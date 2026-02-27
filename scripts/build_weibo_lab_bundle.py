#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TOPIC = "晚5秒要付1700高速费当事人发声"
DEFAULT_COOKIE = ROOT / "cookie.rtf"
OUT_TOPIC_DIR = ROOT / "output" / "weibo_topic_page1"
OUT_ARCHIVE_DIR = ROOT / "output" / "weibo_zhisou_archive_full"
FRONT_DATA_DIR = ROOT / "frontend" / "public" / "data"
FRONT_MEDIA_DIR = ROOT / "frontend" / "public" / "media_files"
HTML_DIR = OUT_ARCHIVE_DIR / "linked_pages_html"


def run(cmd: List[str]) -> None:
    subprocess.run(cmd, check=True, cwd=str(ROOT))


def norm_topic(topic: str) -> str:
    t = topic.strip()
    return t if t.startswith("#") and t.endswith("#") else f"#{t.strip('#')}#"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def is_bad_media_url(url: str) -> bool:
    return (
        "svvip_" in url
        or "h5.sinaimg.cn/upload/108/1866" in url
        or "/crop." in url
        or "tvax" in url
    )


def is_good_local_image(path: str) -> bool:
    try:
        p = Path(path)
        if not p.exists():
            return False
        if p.suffix.lower() not in {".jpg", ".jpeg", ".webp", ".png"}:
            return False
        return p.stat().st_size > 8_000
    except Exception:
        return False


def to_public_media_path(local_path: str) -> str:
    return f"/media_files/{Path(local_path).name}"


def ensure_media_file(local_path: str) -> str | None:
    try:
        src = Path(local_path)
        if not src.exists():
            return None
        FRONT_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
        dst = FRONT_MEDIA_DIR / src.name
        if not dst.exists():
            shutil.copy2(src, dst)
        return to_public_media_path(str(src))
    except Exception:
        return None


def normalize_media_url(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return ""
    if u.startswith("//"):
        return f"https:{u}"
    return u


def build_multimodal_map(wis: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for item in (wis.get("card_multimodal", {}) or {}).get("data", []) or []:
        mid = str(item.get("cur_mid") or "")
        if not mid:
            continue
        row = out.setdefault(
            mid,
            {
                "images": [],
                "video_url": "",
                "user_name": "",
                "user_avatar": "",
                "type": "",
            },
        )

        img = normalize_media_url(str(item.get("img") or ""))
        if img and not is_bad_media_url(img) and img not in row["images"]:
            row["images"].append(img)

        if not row["video_url"] and item.get("video_url"):
            row["video_url"] = normalize_media_url(str(item.get("video_url") or ""))
        if not row["user_name"] and item.get("user_name"):
            row["user_name"] = str(item.get("user_name") or "")
        if not row["user_avatar"] and item.get("user_avatar"):
            row["user_avatar"] = normalize_media_url(str(item.get("user_avatar") or ""))
        if not row["type"] and item.get("type"):
            row["type"] = str(item.get("type") or "")
    return out


def build_linked_post_map(linked_posts: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {
        str(row.get("post_id")): row
        for row in linked_posts
        if str(row.get("post_id") or "")
    }


def parse_stream_url_from_html(mid: str) -> str:
    path = HTML_DIR / f"{mid}.html"
    if not path.exists():
        return ""
    raw = path.read_text(encoding="utf-8", errors="ignore")

    for text in (raw, raw.replace("\\/", "/")):
        m = re.search(r"(https?:)?//f\.video\.weibocdn\.com/[^\s\"'<>]+?\.mp4[^\s\"'<>]*", text)
        if m:
            u = m.group(0).replace("&amp;", "&")
            return normalize_media_url(u)
    return ""


def read_html(mid: str) -> str:
    path = HTML_DIR / f"{mid}.html"
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="ignore")


def extract_card_block(raw_html: str, mid: str) -> str:
    if not raw_html:
        return ""
    pattern = rf'<div class="card-wrap"[^>]*mid="{re.escape(mid)}"[^>]*>([\s\S]*?)(?=<div class="card-wrap"|</div>\s*<script|</body>)'
    m = re.search(pattern, raw_html)
    if not m:
        return ""
    return m.group(1)


def extract_images_from_card(raw_html: str, mid: str) -> List[str]:
    block = extract_card_block(raw_html, mid)
    if not block:
        return []

    urls = re.findall(r"""<img[^>]+src=["']([^"']+)["']""", block, flags=re.I)
    out: List[str] = []
    for u in urls:
        url = normalize_media_url(u).replace("&amp;", "&")
        if not url:
            continue
        if "wx" not in url or "sinaimg.cn" not in url:
            continue
        if is_bad_media_url(url):
            continue
        if "face.t.sinajs.cn" in url or "simg.s.weibo.com" in url:
            continue
        if not re.search(r"\.(jpg|jpeg|png|webp)(\?|$)", url, flags=re.I):
            continue
        out.append(url)

    deduped: List[str] = []
    seen = set()
    for u in out:
        if u in seen:
            continue
        seen.add(u)
        deduped.append(u)
    return deduped


def parse_video_meta_from_html(mid: str) -> Dict[str, str]:
    raw = read_html(mid)
    block = extract_card_block(raw, mid) or raw
    if not block:
        return {"stream_url": "", "poster": "", "video_url": ""}

    result = {"stream_url": "", "poster": "", "video_url": ""}
    for text in (block, block.replace("\\/", "/")):
        if not result["stream_url"]:
            m = re.search(r"(https?:)?//f\.video\.weibocdn\.com/[^\s\"'<>]+?\.mp4[^\s\"'<>]*", text)
            if m:
                result["stream_url"] = normalize_media_url(m.group(0).replace("&amp;", "&"))

        if not result["poster"]:
            m = re.search(r"poster\s*:\s*'([^']+)'", text)
            if m:
                result["poster"] = normalize_media_url(m.group(1).replace("&amp;", "&"))

        if not result["video_url"]:
            m = re.search(r"address\s*:\s*'([^']+)'", text)
            if m:
                result["video_url"] = normalize_media_url(m.group(1).replace("&amp;", "&"))

    return result


def build_post_images(mid: str, linked_map: Dict[str, Dict[str, Any]], multimodal_map: Dict[str, Dict[str, Any]], html_meta: Dict[str, str]) -> List[str]:
    imgs: List[str] = []
    linked = linked_map.get(mid) or {}

    for local in linked.get("media_image_local") or []:
        if is_good_local_image(local):
            pub = ensure_media_file(local)
            if pub:
                imgs.append(pub)

    for u in linked.get("media_image_urls") or []:
        url = normalize_media_url(str(u or ""))
        if url and not is_bad_media_url(url):
            imgs.append(url)

    for u in (multimodal_map.get(mid) or {}).get("images", []) or []:
        url = normalize_media_url(str(u or ""))
        if url and not is_bad_media_url(url):
            imgs.append(url)

    for u in extract_images_from_card(read_html(mid), mid):
        if u and not is_bad_media_url(u):
            imgs.append(u)

    if html_meta.get("poster"):
        imgs.append(html_meta["poster"])

    if not imgs:
        mm_first = ((multimodal_map.get(mid) or {}).get("images") or [""])[0]
        if mm_first:
            imgs.append(mm_first)

    seen = set()
    deduped: List[str] = []
    for i in imgs:
        if not i or i in seen:
            continue
        seen.add(i)
        deduped.append(i)
    return deduped[:9]


def resolve_avatar(mid: str, fallback: str, linked_map: Dict[str, Dict[str, Any]], multimodal_map: Dict[str, Dict[str, Any]]) -> str:
    linked = linked_map.get(mid) or {}

    local = str(linked.get("author_avatar_local") or "").strip()
    if local:
        pub = ensure_media_file(local)
        if pub:
            return pub

    remote = normalize_media_url(str(linked.get("author_avatar_url") or ""))
    if remote and not is_bad_media_url(remote):
        return remote

    mm_avatar = normalize_media_url(str((multimodal_map.get(mid) or {}).get("user_avatar") or ""))
    if mm_avatar and not is_bad_media_url(mm_avatar):
        return mm_avatar

    return normalize_media_url(fallback)


def choose_smart_gallery(multimodal_map: Dict[str, Dict[str, Any]]) -> List[str]:
    posters = []
    for mid in ["5270471789774972", "5270483571310612", "5270491384516213", "5270501795824545"]:
        p = ((multimodal_map.get(mid) or {}).get("images") or [""])[0]
        if p:
            posters.append(p)
    if len(posters) < 3:
        for v in multimodal_map.values():
            p = ((v.get("images") or [""])[0] or "").strip()
            if p:
                posters.append(p)

    out = []
    seen = set()
    for p in posters:
        if p in seen:
            continue
        seen.add(p)
        out.append(p)
    return out[:3]


def build_bundle(topic: str) -> Dict[str, Any]:
    topic_posts = load_json(OUT_TOPIC_DIR / "s_weibo_page1_posts.json", [])
    linked_posts = load_json(OUT_ARCHIVE_DIR / "linked_posts.json", [])
    wis = load_json(OUT_ARCHIVE_DIR / "raw" / "aisearch_wis_show.json", {})
    zhisou = load_json(ROOT / "frontend" / "src" / "material" / "zhisou-data.json", {})

    multimodal_map = build_multimodal_map(wis)
    linked_map = build_linked_post_map(linked_posts)

    posts: List[Dict[str, Any]] = []
    for p in topic_posts:
        mid = str(p.get("post_id") or "")
        if not mid:
            continue

        html_meta = parse_video_meta_from_html(mid)
        images = build_post_images(mid, linked_map, multimodal_map, html_meta)
        mm = multimodal_map.get(mid) or {}
        video_url = normalize_media_url(str(mm.get("video_url") or "")) or html_meta.get("video_url", "")
        video_stream_url = html_meta.get("stream_url", "") or (parse_stream_url_from_html(mid) if video_url else "")
        video_poster = html_meta.get("poster", "") or (images[0] if images else "")

        posts.append(
            {
                **p,
                "author_avatar_url": resolve_avatar(mid, str(p.get("author_avatar_url") or ""), linked_map, multimodal_map),
                "images": images,
                "video_url": video_url,
                "video_stream_url": video_stream_url,
                "video_poster": video_poster,
            }
        )

    summary_text = wis.get("text_n") or wis.get("text") or zhisou.get("intro") or ""
    video_map = {
        mid: {
            "video_url": str(row.get("video_url") or ""),
            "poster": ((row.get("images") or [""])[0] or ""),
            "user_name": str(row.get("user_name") or ""),
            "type": str(row.get("type") or ""),
        }
        for mid, row in multimodal_map.items()
        if row.get("video_url")
    }

    return {
        "topic": topic,
        "generated_at": int(os.path.getmtime(OUT_ARCHIVE_DIR / "zhisou_archive_summary.json")) if (OUT_ARCHIVE_DIR / "zhisou_archive_summary.json").exists() else None,
        "smart": {
            "title": f"#{topic.strip('#')}#",
            "summary": summary_text,
            "intro": zhisou.get("intro", ""),
            "gallery": choose_smart_gallery(multimodal_map),
            "link_list": wis.get("link_list", []),
        },
        "posts": posts,
        "video_map": video_map,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Build Weibo_Sim_Lab bundle from scrapers.")
    ap.add_argument("--topic", default=DEFAULT_TOPIC, help="Topic keyword")
    ap.add_argument("--cookie-file", default=str(DEFAULT_COOKIE), help="Cookie file path")
    ap.add_argument("--refresh", action="store_true", help="Run scrapers before building bundle")
    args = ap.parse_args()

    topic = args.topic.strip()
    topic_hash = norm_topic(topic)

    if args.refresh:
        run(
            [
                "python3",
                str(ROOT / "scripts" / "s_weibo_page1_scraper.py"),
                "--cookie-file",
                str(Path(args.cookie_file).expanduser()),
                "--q",
                topic,
                "--page",
                "1",
                "--outdir",
                str(OUT_TOPIC_DIR),
            ]
        )
        run(
            [
                "python3",
                str(ROOT / "scripts" / "weibo_zhisou_archiver.py"),
                "--cookie-file",
                str(Path(args.cookie_file).expanduser()),
                "--q",
                topic,
                "--outdir",
                str(OUT_ARCHIVE_DIR),
                "--download-assets",
            ]
        )

    bundle = build_bundle(topic_hash)
    FRONT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (FRONT_DATA_DIR / "lab_bundle.json").write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] Bundle written: {FRONT_DATA_DIR / 'lab_bundle.json'}")
    print(f"[OK] Posts: {len(bundle.get('posts', []))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
