#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import html
import json
import os
import re
import subprocess
import time
import urllib.parse
import urllib.request
from urllib.error import URLError, HTTPError
from pathlib import Path
from typing import Dict, List, Tuple


UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)


def read_cookie_from_file(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(str(path))
    if path.suffix.lower() == ".rtf":
        p = subprocess.run(
            ["textutil", "-convert", "txt", "-stdout", str(path)],
            check=True,
            capture_output=True,
            text=True,
        )
        raw = p.stdout
    else:
        raw = path.read_text(encoding="utf-8", errors="ignore")

    lines = [x.strip() for x in raw.splitlines() if x.strip() and not x.strip().startswith("#")]
    if not lines:
        return ""
    if len(lines) == 1 and "=" in lines[0] and ";" in lines[0]:
        return lines[0]

    keys = [
        "_s_tentry",
        "ALF",
        "Apache",
        "SCF",
        "SINAGLOBAL",
        "SUB",
        "SUBP",
        "ULV",
        "UOR",
        "WBPSESSI",
        "XSRF-TOKEN",
        "SSOLoginState",
    ]
    out = []
    for ln in lines:
        if "=" in ln:
            out.append(ln)
            continue
        for k in keys:
            if ln.startswith(k):
                out.append(f"{k}={ln[len(k):]}")
                break
    return "; ".join(out)


def http_get_text(url: str, cookie: str, retries: int = 4) -> str:
    last_err = None
    for i in range(retries):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": UA,
                    "Cookie": cookie,
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", errors="ignore")
        except Exception as e:
            last_err = e
            time.sleep(0.8 * (i + 1))
    raise last_err


def http_post_form_json(url: str, data: Dict[str, str], cookie: str, retries: int = 4) -> Dict:
    last_err = None
    for i in range(retries):
        try:
            body = urllib.parse.urlencode(data).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=body,
                headers={
                    "User-Agent": UA,
                    "Cookie": cookie,
                    "Accept": "application/json,text/plain,*/*",
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest",
                },
            )
            with urllib.request.urlopen(req, timeout=40) as r:
                text = r.read().decode("utf-8", errors="ignore")
            return json.loads(text)
        except Exception as e:
            last_err = e
            time.sleep(0.8 * (i + 1))
    raise last_err


def clean_html_text(s: str) -> str:
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s).strip()


def parse_count(text: str) -> int:
    t = clean_html_text(text).strip().replace(",", "")
    if not t or t in ("转发", "评论", "赞"):
        return 0
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*万", t)
    if m:
        return int(float(m.group(1)) * 10000)
    m = re.search(r"([0-9]+)", t)
    return int(m.group(1)) if m else 0


def parse_card_ai_search(search_html: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    idx = search_html.find('class="card-ai-search_box"')
    if idx < 0:
        return out
    chunk = search_html[max(0, idx - 300) : idx + 5000]

    m = re.search(r'<a\s+href="([^"]+)"[^>]*>\s*<div class="card-ai-search_title">', chunk, re.S)
    if m:
        href = html.unescape(m.group(1))
        out["jump_link"] = href if href.startswith("http") else f"https:{href}" if href.startswith("//") else href

    m = re.search(r'class="card-ai-search_titleText">([^<]+)</div>', chunk)
    if m:
        out["title"] = clean_html_text(m.group(1))

    m = re.search(r'class="card-ai-search_content">(.+?)</div>', chunk, re.S)
    if m:
        out["content"] = clean_html_text(m.group(1))

    m = re.search(r'class="card-ai-search_leftIcon"[^>]*src="([^"]+)"', chunk)
    if m:
        icon = html.unescape(m.group(1))
        out["left_icon"] = icon if icon.startswith("http") else f"https:{icon}" if icon.startswith("//") else icon
    return out


def fetch_wis_show(query: str, cookie: str) -> Dict:
    request_id = str(int(time.time()))
    request_time = "0"
    page_id = ""
    query_id = ""
    model = ""
    last = {}
    for loop_num in range(1, 16):
        params = {
            "query": query,
            "content_type": "loop",
            "request_id": request_id,
            "request_time": request_time,
            "search_source": "default_init",
            "sid": "pc_search",
            "vstyle": "1",
            "cot": "1",
            "loop_num": str(loop_num),
        }
        if page_id:
            params["page_id"] = page_id
        if query_id:
            params["query_id"] = query_id
        if model:
            params["model"] = model
        res = http_post_form_json("https://ai.s.weibo.com/api/wis/show.json", params, cookie)
        last = res
        status = int(res.get("status") or 0)
        page_id = str(res.get("page_id") or page_id)
        query_id = str(res.get("query_id") or query_id)
        model = str(res.get("model") or model)
        request_time = str(res.get("current_time") or request_time)
        if status != 1:
            break
    return last


def extract_mid_from_scheme(link: str) -> str:
    m = re.search(r"mblogid=(\d+)", link or "")
    return m.group(1) if m else ""


def parse_card_by_mid(page_html: str, mid: str) -> Dict:
    p = re.compile(
        r'<div class="card-wrap" action-type="feed_list_item" mid="' + re.escape(mid) + r'"[^>]*>(?P<body>.*?)<!--/card-wrap-->',
        re.S,
    )
    m = p.search(page_html)
    if not m:
        return {}
    body = m.group("body")
    out = {"post_id": mid}

    am = re.search(r'<div class="avator">.*?<img src="([^"]+)"', body, re.S)
    out["author_avatar_url"] = html.unescape(am.group(1)) if am else ""

    nm = re.search(r'<a href="([^"]+)" class="name"[^>]*>(.*?)</a>', body, re.S)
    out["author_url"] = ""
    out["author_name"] = ""
    if nm:
        aurl = html.unescape(nm.group(1))
        out["author_url"] = aurl if aurl.startswith("http") else f"https:{aurl}" if aurl.startswith("//") else aurl
        out["author_name"] = clean_html_text(nm.group(2))

    tm = re.search(r'<p class="txt"[^>]*>(.*?)</p>', body, re.S)
    out["content_text"] = clean_html_text(tm.group(1)) if tm else ""

    fm = re.search(r'<div class="from"[^>]*>(.*?)</div>', body, re.S)
    out["created_at"] = ""
    out["source"] = ""
    out["post_url"] = ""
    if fm:
        links = re.findall(r'<a href="([^"]+)"[^>]*>(.*?)</a>', fm.group(1), re.S)
        if links:
            purl = html.unescape(links[0][0])
            out["post_url"] = purl if purl.startswith("http") else f"https:{purl}" if purl.startswith("//") else purl
            out["created_at"] = clean_html_text(links[0][1])
        if len(links) > 1:
            out["source"] = clean_html_text(links[1][1])

    rm = re.search(r'action-type="feed_list_forward"[^>]*>(.*?)</a>', body, re.S)
    cm = re.search(r'action-type="feed_list_comment"[^>]*>(.*?)</a>', body, re.S)
    lm = re.search(r'class="woo-like-count"[^>]*>(.*?)</span>', body, re.S)
    out["reposts_count"] = parse_count(rm.group(1) if rm else "")
    out["comments_count"] = parse_count(cm.group(1) if cm else "")
    out["attitudes_count"] = parse_count(lm.group(1) if lm else "")

    media_urls = []
    for img in re.findall(r'<div class="media[^"]*"[^>]*>.*?</div>', body, re.S):
        for u in re.findall(r'<img[^>]+src="([^"]+)"', img):
            u = html.unescape(u)
            media_urls.append(u if u.startswith("http") else f"https:{u}" if u.startswith("//") else u)
    # Fallback: pick non-avatar images in this card block.
    if not media_urls:
        for u in re.findall(r'<img[^>]+src="([^"]+)"', body):
            u = html.unescape(u)
            if "sinaimg.cn" in u and "tvax" not in u:
                media_urls.append(u if u.startswith("http") else f"https:{u}" if u.startswith("//") else u)
    out["media_image_urls"] = sorted(set(media_urls))
    return out


def safe_name(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", s)[:90]


def download_file(
    url: str,
    dest: Path,
    cookie: str = "",
    referer: str = "",
    retries: int = 3,
) -> bool:
    for i in range(retries):
        try:
            headers = {"User-Agent": UA, "Accept": "image/*,*/*;q=0.8"}
            if cookie:
                headers["Cookie"] = cookie
            if referer:
                headers["Referer"] = referer
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as r:
                content = r.read()
                ctype = (r.headers.get("Content-Type") or "").lower()
                # Basic guard: avoid saving HTML/login pages as images.
                if ("image" not in ctype) or len(content) < 300:
                    raise ValueError(f"not-image-or-too-small content_type={ctype} size={len(content)}")
                dest.write_bytes(content)
            return True
        except Exception:
            time.sleep(0.5 * (i + 1))
    return False


def archive_linked_posts(
    mids: List[str], cookie: str, outdir: Path, download_assets: bool = False
) -> List[Dict]:
    html_dir = outdir / "linked_pages_html"
    assets_dir = outdir / "media_files"
    html_dir.mkdir(parents=True, exist_ok=True)
    assets_dir.mkdir(parents=True, exist_ok=True)

    rows: List[Dict] = []
    for i, mid in enumerate(mids, start=1):
        url = f"https://s.weibo.com/weibo?q={urllib.parse.quote(mid)}&page=1"
        try:
            html_text = http_get_text(url, cookie)
            (html_dir / f"{mid}.html").write_text(html_text, encoding="utf-8")
        except Exception as e:
            rows.append({"post_id": mid, "search_url": url, "fetch_ok": False, "error": str(e)})
            continue

        row = parse_card_by_mid(html_text, mid)
        if not row:
            row = {"post_id": mid, "search_url": url, "fetch_ok": False}
            rows.append(row)
            continue

        row["search_url"] = url
        row["fetch_ok"] = True

        row["author_avatar_local"] = ""
        row["media_image_local"] = []
        if download_assets:
            avatar_url = row.get("author_avatar_url", "")
            if avatar_url:
                ext = Path(urllib.parse.urlparse(avatar_url).path).suffix or ".jpg"
                ap = assets_dir / f"{safe_name(row.get('author_name','unknown'))}_{mid}_avatar{ext}"
                row["author_avatar_local"] = (
                    str(ap)
                    if download_file(
                        avatar_url,
                        ap,
                        cookie=cookie,
                        referer=row.get("author_url") or row.get("search_url") or url,
                    )
                    else ""
                )

            local_imgs = []
            for idx, img_url in enumerate(row.get("media_image_urls", []), start=1):
                ext = Path(urllib.parse.urlparse(img_url).path).suffix or ".jpg"
                p = assets_dir / f"{mid}_img_{idx}{ext}"
                if download_file(
                    img_url,
                    p,
                    cookie=cookie,
                    referer=row.get("post_url") or row.get("search_url") or url,
                ):
                    local_imgs.append(str(p))
            row["media_image_local"] = local_imgs
        rows.append(row)
        if i % 10 == 0:
            print(f"[INFO] linked post archived: {i}/{len(mids)}", flush=True)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description="Archive Weibo Zhisou page, links and linked post details.")
    ap.add_argument("--q", default="晚5秒要付1700高速费当事人发声")
    ap.add_argument("--cookie-file", default="cookie.rtf")
    ap.add_argument("--outdir", default="output/weibo_zhisou_archive")
    ap.add_argument("--download-assets", action="store_true", help="Download avatar/media files")
    args = ap.parse_args()

    outdir = Path(args.outdir)
    raw = outdir / "raw"
    raw.mkdir(parents=True, exist_ok=True)

    cookie = read_cookie_from_file(Path(args.cookie_file))
    if not cookie:
        print("[ERROR] Empty cookie.")
        return 1

    q = args.q
    search_url = f"https://s.weibo.com/weibo?q={urllib.parse.quote(q)}&page=1"
    aisearch_url = f"https://s.weibo.com/aisearch?q={urllib.parse.quote(q)}&Refer=weibo_aisearch"

    search_html = http_get_text(search_url, cookie)
    aisearch_html = http_get_text(aisearch_url, cookie)
    if "$CONFIG['islogin'] = '1';" not in search_html:
        print("[ERROR] Cookie not logged in on s.weibo.com.")
        return 1

    (raw / "s_weibo_search_page1.html").write_text(search_html, encoding="utf-8")
    (raw / "s_weibo_aisearch.html").write_text(aisearch_html, encoding="utf-8")

    card_ai = parse_card_ai_search(search_html)

    wis = fetch_wis_show(q, cookie)
    (raw / "aisearch_wis_show.json").write_text(json.dumps(wis, ensure_ascii=False, indent=2), encoding="utf-8")

    msg = wis.get("msg", "") or ""
    think_text = ""
    answer_text = msg
    if "</think>" in msg:
        parts = msg.split("</think>", 1)
        think_text = clean_html_text(parts[0].replace("<think>", ""))
        answer_text = clean_html_text(parts[1])
    else:
        answer_text = clean_html_text(msg)

    link_list = wis.get("link_list") or []
    mids = []
    for link in link_list:
        mid = extract_mid_from_scheme(str(link))
        if mid:
            mids.append(mid)
    mids = sorted(set(mids))

    linked_rows = archive_linked_posts(mids, cookie, outdir, download_assets=args.download_assets)

    summary = {
        "query": q,
        "created_at_epoch": int(time.time()),
        "search_url": search_url,
        "aisearch_url": aisearch_url,
        "card_ai_search": card_ai,
        "wis_status": wis.get("status"),
        "wis_status_stage": wis.get("status_stage"),
        "wis_model": wis.get("model"),
        "wis_page_id": wis.get("page_id"),
        "wis_short_url": wis.get("short_url"),
        "think_text": think_text,
        "answer_text": answer_text,
        "raw_msg_markdown": msg,
        "link_list_count": len(link_list),
        "mid_count": len(mids),
        "links": [
            {
                "scheme": x,
                "mid": extract_mid_from_scheme(str(x)),
                "search_url": f"https://s.weibo.com/weibo?q={urllib.parse.quote(extract_mid_from_scheme(str(x)))}&page=1"
                if extract_mid_from_scheme(str(x))
                else "",
            }
            for x in link_list
        ],
    }
    (outdir / "zhisou_archive_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (outdir / "linked_posts.json").write_text(
        json.dumps(linked_rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    with (outdir / "linked_posts.csv").open("w", encoding="utf-8-sig", newline="") as f:
        fields = [
            "post_id",
            "fetch_ok",
            "search_url",
            "post_url",
            "author_name",
            "author_url",
            "author_avatar_url",
            "author_avatar_local",
            "created_at",
            "source",
            "content_text",
            "reposts_count",
            "comments_count",
            "attitudes_count",
            "media_image_urls",
            "media_image_local",
        ]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in linked_rows:
            rr = dict(r)
            rr["media_image_urls"] = json.dumps(rr.get("media_image_urls", []), ensure_ascii=False)
            rr["media_image_local"] = json.dumps(rr.get("media_image_local", []), ensure_ascii=False)
            w.writerow({k: rr.get(k, "") for k in fields})

    print(f"[INFO] archived query: {q}")
    print(f"[INFO] outdir: {outdir}")
    print(f"[INFO] links in wis: {len(link_list)}, unique mids: {len(mids)}")
    ok_count = sum(1 for x in linked_rows if x.get("fetch_ok"))
    print(f"[INFO] linked posts parsed: {ok_count}/{len(linked_rows)}")
    print(f"[INFO] summary json: {outdir / 'zhisou_archive_summary.json'}")
    print(f"[INFO] linked posts json: {outdir / 'linked_posts.json'}")
    print(f"[INFO] linked posts csv: {outdir / 'linked_posts.csv'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
