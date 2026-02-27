#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Dict, List


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


def fetch_html(url: str, cookie: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Cookie": cookie,
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="ignore")


def clean_html_text(s: str) -> str:
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s).strip()


def parse_count(text: str) -> int:
    t = text.strip()
    if not t:
        return 0
    if t in ("转发", "评论", "赞"):
        return 0
    t = t.replace(",", "")
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*万", t)
    if m:
        return int(float(m.group(1)) * 10000)
    m = re.search(r"([0-9]+)", t)
    if m:
        return int(m.group(1))
    return 0


def parse_posts(page_html: str) -> List[Dict[str, str]]:
    pattern = re.compile(
        r'<div class="card-wrap" action-type="feed_list_item" mid="(?P<mid>\d+)"[^>]*>(?P<body>.*?)<!--/card-wrap-->',
        re.S,
    )
    rows: List[Dict[str, str]] = []
    for m in pattern.finditer(page_html):
        mid = m.group("mid")
        body = m.group("body")

        avatar = ""
        am = re.search(r'<div class="avator">.*?<img src="([^"]+)"', body, re.S)
        if am:
            avatar = html.unescape(am.group(1))

        author = ""
        author_url = ""
        nm = re.search(r'<a href="([^"]+)" class="name"[^>]*>(.*?)</a>', body, re.S)
        if nm:
            author_url = html.unescape(nm.group(1))
            author = clean_html_text(nm.group(2))

        text = ""
        tm = re.search(r'<p class="txt"[^>]*>(.*?)</p>', body, re.S)
        if tm:
            text = clean_html_text(tm.group(1))

        created_at = ""
        source = ""
        post_url = ""
        fm = re.search(r'<div class="from"[^>]*>(.*?)</div>', body, re.S)
        if fm:
            from_html = fm.group(1)
            links = re.findall(r'<a href="([^"]+)"[^>]*>(.*?)</a>', from_html, re.S)
            if links:
                post_url = html.unescape(links[0][0])
                created_at = clean_html_text(links[0][1])
            if len(links) > 1:
                source = clean_html_text(links[1][1])

        repost_text = ""
        comment_text = ""
        like_text = ""

        rm = re.search(r'action-type="feed_list_forward"[^>]*>(.*?)</a>', body, re.S)
        if rm:
            repost_text = clean_html_text(rm.group(1))
        cm = re.search(r'action-type="feed_list_comment"[^>]*>(.*?)</a>', body, re.S)
        if cm:
            comment_text = clean_html_text(cm.group(1))
        lm = re.search(r'class="woo-like-count"[^>]*>(.*?)</span>', body, re.S)
        if lm:
            like_text = clean_html_text(lm.group(1))

        row = {
            "post_id": mid,
            "post_url": post_url if post_url.startswith("http") else f"https:{post_url}" if post_url else "",
            "author_name": author,
            "author_url": author_url if author_url.startswith("http") else f"https:{author_url}" if author_url else "",
            "author_avatar_url": avatar,
            "content_text": text,
            "created_at": created_at,
            "source": source,
            "reposts_count": str(parse_count(repost_text)),
            "comments_count": str(parse_count(comment_text)),
            "attitudes_count": str(parse_count(like_text)),
        }
        rows.append(row)
    return rows


def safe_name(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", s)[:80]


def save_outputs(rows: List[Dict[str, str]], outdir: Path) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    avatars = outdir / "avatars"
    avatars.mkdir(parents=True, exist_ok=True)

    for r in rows:
        img_url = r.get("author_avatar_url", "")
        if not img_url:
            r["author_avatar_local"] = ""
            continue
        ext = ".jpg"
        path_ext = Path(urllib.parse.urlparse(img_url).path).suffix
        if path_ext and len(path_ext) <= 5:
            ext = path_ext
        local = avatars / f"{safe_name(r.get('author_name', 'unknown'))}_{r.get('post_id','')}{ext}"
        try:
            req = urllib.request.Request(img_url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as resp:
                local.write_bytes(resp.read())
            r["author_avatar_local"] = str(local)
        except Exception:
            r["author_avatar_local"] = ""

    json_path = outdir / "s_weibo_page1_posts.json"
    csv_path = outdir / "s_weibo_page1_posts.csv"
    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    fields = [
        "post_id",
        "post_url",
        "author_name",
        "author_url",
        "author_avatar_url",
        "author_avatar_local",
        "content_text",
        "created_at",
        "source",
        "reposts_count",
        "comments_count",
        "attitudes_count",
    ]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fields})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--q", default="晚5秒要付1700高速费当事人发声")
    ap.add_argument("--page", type=int, default=1)
    ap.add_argument("--cookie-file", default="cookie.rtf")
    ap.add_argument("--outdir", default="output/weibo_topic_page1")
    args = ap.parse_args()

    cookie = read_cookie_from_file(Path(args.cookie_file))
    if not cookie:
        print("[ERROR] Empty cookie.")
        return 1

    url = f"https://s.weibo.com/weibo?q={urllib.parse.quote(args.q)}&page={args.page}"
    print(f"[INFO] URL: {url}")
    html_text = fetch_html(url, cookie)
    if "$CONFIG['islogin'] = '1';" not in html_text:
        print("[ERROR] Cookie is not logged in for s.weibo.com.")
        return 1

    rows = parse_posts(html_text)
    save_outputs(rows, Path(args.outdir))
    print(f"[INFO] Collected posts: {len(rows)}")
    print(f"[INFO] JSON: {args.outdir}/s_weibo_page1_posts.json")
    print(f"[INFO] CSV: {args.outdir}/s_weibo_page1_posts.csv")
    print(f"[INFO] Avatars: {args.outdir}/avatars")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
