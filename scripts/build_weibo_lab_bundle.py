#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Tuple


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TOPIC = "晚5秒要付1700高速费当事人发声"
DEFAULT_COOKIE = ROOT / "cookie.rtf"
OUT_TOPIC_DIR = ROOT / "output" / "weibo_topic_page1"
OUT_ARCHIVE_DIR = ROOT / "output" / "weibo_zhisou_archive_full"
FRONT_DATA_DIR = ROOT / "frontend" / "public" / "data"
FRONT_MEDIA_DIR = ROOT / "frontend" / "public" / "media_files"
HTML_DIR = OUT_ARCHIVE_DIR / "linked_pages_html"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif"}
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
)


def run(cmd: List[str]) -> None:
    subprocess.run(cmd, check=True, cwd=str(ROOT))


def run_allow_fail(cmd: List[str]) -> bool:
    proc = subprocess.run(cmd, cwd=str(ROOT))
    return proc.returncode == 0


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
        u = f"https:{u}"
    if u.startswith("http://"):
        u = f"https://{u[len('http://') :]}"
    return u


def safe_name(name: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z_]+", "_", (name or "").strip())
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned or "asset"


def infer_ext(url: str, content_type: str = "") -> str:
    path_ext = Path(urllib.parse.urlparse(url).path).suffix.lower()
    if path_ext in IMAGE_EXTS:
        return path_ext

    ctype = (content_type or "").split(";")[0].strip().lower()
    if ctype:
        guessed = mimetypes.guess_extension(ctype) or ""
        if guessed.lower() in IMAGE_EXTS:
            return guessed.lower()
    return ".jpg"


def looks_like_image_bytes(data: bytes) -> bool:
    if len(data) < 256:
        return False
    head = data[:24]
    if head.startswith(b"\xff\xd8\xff"):  # jpeg
        return True
    if head.startswith(b"\x89PNG\r\n\x1a\n"):  # png
        return True
    if head.startswith(b"GIF87a") or head.startswith(b"GIF89a"):
        return True
    if head.startswith(b"RIFF") and b"WEBP" in data[:16]:
        return True
    if b"<html" in data[:300].lower():
        return False
    return True


def download_remote_image(url: str, cache_key: str) -> Path | None:
    FRONT_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    normalized = normalize_media_url(url)
    if not normalized:
        return None

    candidates = [normalized]
    if normalized.startswith("https://"):
        candidates.append(f"http://{normalized[len('https://'):]}")

    seen = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        req = urllib.request.Request(
            candidate,
            headers={
                "User-Agent": UA,
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                "Referer": "https://weibo.com/",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                payload = resp.read()
                ctype = resp.headers.get("Content-Type", "")
        except (urllib.error.URLError, TimeoutError, ValueError):
            continue
        except Exception:
            continue

        if not looks_like_image_bytes(payload):
            continue
        ext = infer_ext(candidate, ctype)
        out = FRONT_MEDIA_DIR / f"remote_{cache_key}{ext}"
        try:
            out.write_bytes(payload)
        except Exception:
            continue
        if is_good_local_image(str(out)) or out.stat().st_size > 1_500:
            return out
        try:
            out.unlink()
        except Exception:
            pass
    return None


def resolve_existing_media_path(url: str) -> Path | None:
    src = (url or "").strip()
    if not src:
        return None

    if src.startswith("/media_files/"):
        p = FRONT_MEDIA_DIR / Path(src).name
        return p if p.exists() else None

    p = Path(src)
    if p.exists():
        return p

    normalized = normalize_media_url(src)
    if not normalized.startswith("http"):
        return None
    basename = Path(urllib.parse.urlparse(normalized).path).name
    if not basename:
        return None
    candidate = FRONT_MEDIA_DIR / basename
    return candidate if candidate.exists() else None


def materialize_media_slot(
    source_url: str,
    slot_name: str,
    remote_cache: Dict[str, Path],
    download_missing: bool,
) -> Tuple[str, str]:
    normalized = normalize_media_url(source_url)
    if not normalized:
        return "", ""

    src_path = resolve_existing_media_path(normalized)
    if src_path is None and normalized.startswith("http"):
        cached = remote_cache.get(normalized)
        if cached and cached.exists():
            src_path = cached
        elif download_missing:
            key = hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:12]
            downloaded = download_remote_image(normalized, key)
            if downloaded:
                remote_cache[normalized] = downloaded
                src_path = downloaded

    if src_path is None:
        return normalized, normalized

    FRONT_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    ext = src_path.suffix.lower() if src_path.suffix.lower() in IMAGE_EXTS else ".jpg"
    dst = FRONT_MEDIA_DIR / f"{safe_name(slot_name)}{ext}"
    try:
        if src_path.resolve() != dst.resolve():
            shutil.copy2(src_path, dst)
    except Exception:
        return normalized, normalized
    return to_public_media_path(str(dst)), ""


def localize_bundle_media(bundle: Dict[str, Any], download_missing: bool = True) -> Dict[str, Any]:
    remote_cache: Dict[str, Path] = {}
    manifest: Dict[str, Any] = {
        "topic": bundle.get("topic", ""),
        "generated_at": bundle.get("generated_at"),
        "posts": [],
        "unresolved_assets": [],
    }

    posts = bundle.get("posts", []) or []
    for post in posts:
        post_id = str(post.get("post_id") or "")
        if not post_id:
            continue
        local_avatar_candidates = sorted(
            [p for p in FRONT_MEDIA_DIR.glob(f"*{post_id}_avatar.*") if is_good_local_image(str(p))]
        )
        local_image_candidates = sorted(
            [p for p in FRONT_MEDIA_DIR.glob(f"{post_id}_img_*") if is_good_local_image(str(p))]
        )
        local_poster_candidates = sorted(
            [p for p in FRONT_MEDIA_DIR.glob(f"{post_id}_poster.*") if is_good_local_image(str(p))]
        )

        row = {
            "post_id": post_id,
            "author_name": str(post.get("author_name") or ""),
            "content_preview": str(post.get("content_text") or "")[:80],
            "avatar": "",
            "images": [],
            "video_poster": "",
        }

        if local_avatar_candidates:
            avatar_local = to_public_media_path(str(local_avatar_candidates[0]))
            avatar_unresolved = ""
        else:
            avatar_local, avatar_unresolved = materialize_media_slot(
                str(post.get("author_avatar_url") or ""),
                f"{post_id}_avatar",
                remote_cache,
                download_missing,
            )
        post["author_avatar_url"] = avatar_local
        row["avatar"] = avatar_local
        if avatar_unresolved:
            manifest["unresolved_assets"].append(
                {"post_id": post_id, "field": "author_avatar_url", "url": avatar_unresolved}
            )

        localized_images: List[str] = []
        if local_image_candidates:
            localized_images = [to_public_media_path(str(p)) for p in local_image_candidates[:9]]
            row["images"].extend(localized_images)
        else:
            for idx, image_url in enumerate((post.get("images") or [])[:9], start=1):
                img_local, img_unresolved = materialize_media_slot(
                    str(image_url or ""),
                    f"{post_id}_img_{idx}",
                    remote_cache,
                    download_missing,
                )
                if img_local:
                    localized_images.append(img_local)
                    row["images"].append(img_local)
                if img_unresolved:
                    manifest["unresolved_assets"].append(
                        {"post_id": post_id, "field": f"images[{idx - 1}]", "url": img_unresolved}
                    )
        post["images"] = localized_images

        if local_poster_candidates:
            poster_local = to_public_media_path(str(local_poster_candidates[0]))
            poster_unresolved = ""
        else:
            poster_local, poster_unresolved = materialize_media_slot(
                str(post.get("video_poster") or ""),
                f"{post_id}_poster",
                remote_cache,
                download_missing,
            )
        if not poster_local and localized_images:
            poster_local = localized_images[0]
        post["video_poster"] = poster_local
        row["video_poster"] = poster_local
        if poster_unresolved:
            manifest["unresolved_assets"].append(
                {"post_id": post_id, "field": "video_poster", "url": poster_unresolved}
            )

        manifest["posts"].append(row)

    smart = bundle.get("smart", {}) or {}
    gallery = smart.get("gallery", []) or []
    localized_gallery: List[str] = []
    for idx, img in enumerate(gallery[:9], start=1):
        img_local, unresolved = materialize_media_slot(
            str(img or ""),
            f"smart_gallery_{idx}",
            remote_cache,
            download_missing,
        )
        if img_local:
            localized_gallery.append(img_local)
        if unresolved:
            manifest["unresolved_assets"].append(
                {"post_id": "smart", "field": f"smart.gallery[{idx - 1}]", "url": unresolved}
            )
    smart["gallery"] = localized_gallery
    bundle["smart"] = smart

    video_map = bundle.get("video_map", {}) or {}
    for mid, row in video_map.items():
        if not isinstance(row, dict):
            continue
        poster_local, unresolved = materialize_media_slot(
            str(row.get("poster") or ""),
            f"{safe_name(str(mid))}_video_map_poster",
            remote_cache,
            download_missing,
        )
        if poster_local:
            row["poster"] = poster_local
        if unresolved:
            manifest["unresolved_assets"].append(
                {"post_id": str(mid), "field": "video_map.poster", "url": unresolved}
            )

    manifest["stats"] = {
        "posts": len(manifest["posts"]),
        "unresolved_assets": len(manifest["unresolved_assets"]),
    }
    bundle["asset_manifest"] = {
        "posts": len(manifest["posts"]),
        "unresolved_assets": len(manifest["unresolved_assets"]),
    }
    return {"bundle": bundle, "manifest": manifest}


def merge_topic_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen = set()
    for row in rows:
        mid = str(row.get("post_id") or "")
        if not mid or mid in seen:
            continue
        seen.add(mid)
        out.append(row)
    return out


def write_topic_outputs(rows: List[Dict[str, Any]]) -> None:
    OUT_TOPIC_DIR.mkdir(parents=True, exist_ok=True)
    json_path = OUT_TOPIC_DIR / "s_weibo_page1_posts.json"
    csv_path = OUT_TOPIC_DIR / "s_weibo_page1_posts.csv"
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
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fields})


def refresh_topic_pages(topic: str, cookie_file: str, pages: int, page_delay_sec: float) -> None:
    all_rows: List[Dict[str, Any]] = []
    success_pages = 0
    for page in range(1, pages + 1):
        ok = run_allow_fail(
            [
                "python3",
                str(ROOT / "scripts" / "s_weibo_page1_scraper.py"),
                "--cookie-file",
                cookie_file,
                "--q",
                topic,
                "--page",
                str(page),
                "--outdir",
                str(OUT_TOPIC_DIR),
            ]
        )
        if not ok:
            print(f"[WARN] topic page fetch failed, skipped: page={page}")
            continue
        success_pages += 1
        rows = load_json(OUT_TOPIC_DIR / "s_weibo_page1_posts.json", [])
        if isinstance(rows, list):
            all_rows.extend(rows)
        if page_delay_sec > 0:
            time.sleep(page_delay_sec)

    merged = merge_topic_rows(all_rows)
    write_topic_outputs(merged)
    print(f"[OK] Topic pages fetched: {success_pages}/{pages}")
    print(f"[OK] Topic posts merged: {len(merged)}")


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
    zhisou_summary = load_json(OUT_ARCHIVE_DIR / "zhisou_archive_summary.json", {})
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

    answer_text = (
        str(zhisou_summary.get("answer_text") or "").strip()
        or str(wis.get("text_n") or "").strip()
        or str(wis.get("text") or "").strip()
        or str(zhisou.get("intro") or "").strip()
    )
    summary_text = str(wis.get("text_n") or wis.get("text") or zhisou.get("intro") or "").strip()
    if not summary_text:
        summary_text = answer_text[:220]

    raw_links = zhisou_summary.get("links", [])
    source_links: List[Dict[str, str]] = []
    if isinstance(raw_links, list):
        for item in raw_links:
            if not isinstance(item, dict):
                continue
            scheme = str(item.get("scheme") or "").strip()
            mid = str(item.get("mid") or "").strip()
            search_url = str(item.get("search_url") or "").strip()
            if not scheme and not search_url:
                continue
            source_links.append(
                {
                    "scheme": scheme,
                    "mid": mid,
                    "search_url": search_url,
                }
            )

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
            "answer_text": answer_text,
            "intro": zhisou.get("intro", ""),
            "gallery": choose_smart_gallery(multimodal_map),
            "link_list": wis.get("link_list", []),
            "source_links": source_links,
        },
        "posts": posts,
        "video_map": video_map,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Build Weibo_Sim_Lab bundle from scrapers.")
    ap.add_argument("--topic", default=DEFAULT_TOPIC, help="Topic keyword")
    ap.add_argument("--cookie-file", default=str(DEFAULT_COOKIE), help="Cookie file path")
    ap.add_argument("--refresh", action="store_true", help="Run scrapers before building bundle")
    ap.add_argument("--pages", type=int, default=5, help="How many search result pages to fetch when --refresh")
    ap.add_argument("--page-delay-sec", type=float, default=0.6, help="Sleep interval between page fetches")
    ap.add_argument(
        "--no-download-missing-assets",
        action="store_true",
        help="Only use local existing media_files, do not download missing remote images",
    )
    ap.add_argument(
        "--strict-local",
        action="store_true",
        help="Exit non-zero if unresolved remote assets still exist after localization",
    )
    args = ap.parse_args()

    topic = args.topic.strip()
    topic_hash = norm_topic(topic)
    cookie_file = str(Path(args.cookie_file).expanduser())

    if args.refresh:
        refresh_topic_pages(topic, cookie_file, max(1, int(args.pages)), max(0.0, float(args.page_delay_sec)))
        archive_ok = run_allow_fail(
            [
                "python3",
                str(ROOT / "scripts" / "weibo_zhisou_archiver.py"),
                "--cookie-file",
                cookie_file,
                "--q",
                topic,
                "--outdir",
                str(OUT_ARCHIVE_DIR),
                "--download-assets",
            ]
        )
        if not archive_ok:
            print("[WARN] zhisou archiver failed, continue with existing local archive files.")

    bundle = build_bundle(topic_hash)
    localized = localize_bundle_media(bundle, download_missing=not args.no_download_missing_assets)
    bundle = localized["bundle"]
    manifest = localized["manifest"]
    FRONT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (FRONT_DATA_DIR / "lab_bundle.json").write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    (FRONT_DATA_DIR / "lab_bundle_media_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[OK] Bundle written: {FRONT_DATA_DIR / 'lab_bundle.json'}")
    print(f"[OK] Media manifest written: {FRONT_DATA_DIR / 'lab_bundle_media_manifest.json'}")
    print(f"[OK] Posts: {len(bundle.get('posts', []))}")
    unresolved = int(bundle.get("asset_manifest", {}).get("unresolved_assets", 0))
    print(f"[OK] Unresolved assets: {unresolved}")
    if args.strict_local and unresolved > 0:
        print("[ERROR] strict-local enabled: unresolved assets remain.")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
