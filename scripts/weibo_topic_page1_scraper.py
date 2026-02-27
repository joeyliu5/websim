#!/usr/bin/env python3
"""
Scrape page-1 posts from a Weibo topic via the m.weibo.cn public API.

Usage:
  python3 scripts/weibo_topic_page1_scraper.py
  python3 scripts/weibo_topic_page1_scraper.py --topic "#晚5秒要付1700高速费当事人发声#" --page 1
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import os
import subprocess
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterable, List


DEFAULT_TOPIC = "#晚5秒要付1700高速费当事人发声#"
DEFAULT_OUTDIR = Path("output/weibo_topic_page1")
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)


def build_api_url(topic: str, page: int) -> str:
    encoded_topic = urllib.parse.quote(topic, safe="")
    containerid = f"231522type%3D1%26t%3D10%26q%3D{encoded_topic}"
    return (
        "https://m.weibo.cn/api/container/getIndex"
        f"?containerid={containerid}&page_type=searchall&page={page}"
    )


def fetch_json(
    url: str, cookie: str | None = None, timeout: int = 20
) -> tuple[Dict[str, Any], str]:
    headers = {"User-Agent": UA, "Accept": "application/json,text/plain,*/*"}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = resp.read().decode("utf-8", errors="replace")
    payload = payload.strip()

    # Some endpoints may return JSONP-style wrappers.
    if payload.startswith("callback(") and payload.endswith(")"):
        payload = payload[len("callback(") : -1]
    return json.loads(payload), payload


def read_cookie_from_file(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(str(path))

    raw = ""
    suffix = path.suffix.lower()
    if suffix == ".rtf":
        # macOS textutil: convert rich-text cookie notes to plain text.
        proc = subprocess.run(
            ["textutil", "-convert", "txt", "-stdout", str(path)],
            check=True,
            capture_output=True,
            text=True,
        )
        raw = proc.stdout
    else:
        raw = path.read_text(encoding="utf-8", errors="ignore")

    lines = [x.strip() for x in raw.splitlines() if x.strip() and not x.strip().startswith("#")]
    if not lines:
        return ""

    # Try direct header first: k=v; k2=v2
    if ";" in raw and "=" in raw and len(lines) == 1:
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
    pairs = []
    for ln in lines:
        if "=" in ln:
            pairs.append(ln)
            continue
        for k in keys:
            if ln.startswith(k):
                pairs.append(f"{k}={ln[len(k):]}")
                break
    return "; ".join(pairs)


def strip_html(value: str) -> str:
    if not value:
        return ""
    # Convert HTML to plain text while keeping line breaks readable.
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", "", value)
    value = html.unescape(value)
    return re.sub(r"\n{3,}", "\n\n", value).strip()


def iter_mblogs(cards: Iterable[Dict[str, Any]]) -> Iterable[Dict[str, Any]]:
    for card in cards or []:
        mblog = card.get("mblog")
        if isinstance(mblog, dict):
            yield mblog
        for nested in card.get("card_group", []) or []:
            nested_mblog = nested.get("mblog")
            if isinstance(nested_mblog, dict):
                yield nested_mblog


def normalize_post(mblog: Dict[str, Any]) -> Dict[str, Any]:
    user = mblog.get("user") or {}
    post_id = str(mblog.get("id") or mblog.get("idstr") or "")
    return {
        "post_id": post_id,
        "post_url": f"https://m.weibo.cn/detail/{post_id}" if post_id else "",
        "author_name": user.get("screen_name", ""),
        "author_id": str(user.get("id", "")),
        "author_avatar_url": user.get("profile_image_url", ""),
        "created_at": mblog.get("created_at", ""),
        "source": mblog.get("source", ""),
        "content_text": strip_html(mblog.get("text", "")),
        "reposts_count": int(mblog.get("reposts_count") or 0),
        "comments_count": int(mblog.get("comments_count") or 0),
        "attitudes_count": int(mblog.get("attitudes_count") or 0),
    }


def safe_filename(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", value)


def download_avatar(url: str, dest: Path) -> bool:
    if not url:
        return False
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            content = resp.read()
        dest.write_bytes(content)
        return True
    except Exception:
        return False


def save_outputs(rows: List[Dict[str, Any]], outdir: Path) -> Dict[str, Path]:
    outdir.mkdir(parents=True, exist_ok=True)
    avatars_dir = outdir / "avatars"
    avatars_dir.mkdir(parents=True, exist_ok=True)

    for row in rows:
        avatar_url = row.get("author_avatar_url", "")
        author_name = row.get("author_name", "unknown")
        post_id = row.get("post_id", "")
        ext = ".jpg"
        parsed = urllib.parse.urlparse(avatar_url)
        _, maybe_ext = os.path.splitext(parsed.path)
        if maybe_ext and len(maybe_ext) <= 5:
            ext = maybe_ext
        avatar_path = avatars_dir / f"{safe_filename(author_name)}_{post_id}{ext}"
        ok = download_avatar(avatar_url, avatar_path)
        row["author_avatar_local"] = str(avatar_path) if ok else ""

    json_path = outdir / "page1_posts.json"
    csv_path = outdir / "page1_posts.csv"

    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    fieldnames = [
        "post_id",
        "post_url",
        "author_name",
        "author_id",
        "author_avatar_url",
        "author_avatar_local",
        "created_at",
        "source",
        "content_text",
        "reposts_count",
        "comments_count",
        "attitudes_count",
    ]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})

    return {"json": json_path, "csv": csv_path, "avatars": avatars_dir}


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape first-page posts under a Weibo topic.")
    parser.add_argument("--topic", default=DEFAULT_TOPIC, help="Topic text, e.g. #xxx#")
    parser.add_argument("--page", type=int, default=1, help="Page number, default 1")
    parser.add_argument("--cookie", default="", help="Optional Cookie for anti-bot bypass")
    parser.add_argument(
        "--cookie-file",
        default="",
        help="Path to cookie file (.txt/.rtf). Supports raw header or merged Name+Value lines.",
    )
    parser.add_argument(
        "--outdir",
        default=str(DEFAULT_OUTDIR),
        help="Output directory for JSON/CSV/avatar images",
    )
    args = parser.parse_args()

    if args.page < 1:
        print("page must be >= 1", file=sys.stderr)
        return 2

    cookie = args.cookie.strip()
    if not cookie and args.cookie_file:
        try:
            cookie = read_cookie_from_file(Path(args.cookie_file).expanduser())
        except Exception as e:
            print(f"[ERROR] Failed to read cookie file: {e}", file=sys.stderr)
            return 1
        if not cookie:
            print("[ERROR] Cookie file parsed but produced empty cookie string.", file=sys.stderr)
            return 1

    url = build_api_url(args.topic, args.page)
    print(f"[INFO] Request URL: {url}")

    raw_payload = ""
    try:
        data, raw_payload = fetch_json(url, cookie=cookie or None)
    except urllib.error.HTTPError as e:
        print(f"[ERROR] HTTP {e.code}: {e.reason}", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"[ERROR] Network issue: {e.reason}", file=sys.stderr)
        return 1
    except json.JSONDecodeError:
        outdir = Path(args.outdir)
        outdir.mkdir(parents=True, exist_ok=True)
        debug_path = outdir / f"raw_response_{int(time.time())}.txt"
        debug_path.write_text(raw_payload or "", encoding="utf-8")
        print("[ERROR] Response is not valid JSON.", file=sys.stderr)
        print(f"[ERROR] Raw response dumped to: {debug_path}", file=sys.stderr)
        print(
            "[ERROR] Usually this means anti-bot or cookie invalid/expired."
            " Try a fresh logged-in cookie via --cookie or --cookie-file.",
            file=sys.stderr,
        )
        return 1

    if int(data.get("ok") or 0) != 1:
        print("[ERROR] API returned non-ok response:")
        print(json.dumps(data, ensure_ascii=False, indent=2)[:2000])
        return 1

    cards = ((data.get("data") or {}).get("cards") or [])
    posts = [normalize_post(m) for m in iter_mblogs(cards)]

    # Deduplicate by post_id while preserving order.
    seen = set()
    deduped = []
    for post in posts:
        pid = post.get("post_id")
        if not pid or pid in seen:
            continue
        seen.add(pid)
        deduped.append(post)

    outputs = save_outputs(deduped, Path(args.outdir))
    print(f"[INFO] Topic: {args.topic}")
    print(f"[INFO] Page: {args.page}")
    print(f"[INFO] Collected posts: {len(deduped)}")
    print(f"[INFO] JSON: {outputs['json']}")
    print(f"[INFO] CSV: {outputs['csv']}")
    print(f"[INFO] Avatars dir: {outputs['avatars']}")
    print("[INFO] Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
