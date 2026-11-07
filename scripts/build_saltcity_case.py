#!/usr/bin/env python3
"""Build the fixed, source-faithful Salt City experiment bundle."""
from __future__ import annotations

import argparse
import json
import html
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT.parent / "原始采集" / "盐城寄宿学校事件"
PUBLIC = ROOT / "frontend" / "public"
ASSETS = PUBLIC / "case-saltcity"
DATA = PUBLIC / "data" / "saltcity_case.json"

POST_SPECS = [
    ("N1_大河报", "1734530730", "RnFgj3m2O"),
    ("N2_中国新闻周刊", "1642512402", "Ro1vW3NwT"),
    ("N3_新浪新闻", "2028810631", "RnTcRm22p"),
]


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def copy_asset(src: Path, dest_name: str) -> str:
    if not src.is_file():
        return ""
    ASSETS.mkdir(parents=True, exist_ok=True)
    dest = ASSETS / dest_name
    shutil.copy2(src, dest)
    return f"/case-saltcity/{dest_name}"


def mid_from_link(link: str) -> str:
    match = re.search(r"mblogid=(\d+)", link)
    return match.group(1) if match else ""


def parse_ai_blocks(raw: str, allowed_mids: list[str]):
    replacements = []
    source_number = {mid: index for index, mid in enumerate(allowed_mids, start=1)}

    def replace(match):
        value = json.loads(match.group(1))
        replacements.append(value)
        return f"[[BLOCK:{len(replacements) - 1}]]"

    marked = re.sub(r"```wbCustomBlock(\{[\s\S]*?\})```", replace, raw)
    blocks = []
    for line in marked.splitlines():
        line = line.strip()
        if not line:
            continue
        tokens = [int(x) for x in re.findall(r"\[\[BLOCK:(\d+)\]\]", line)]
        text = re.sub(r"\s*\[\[BLOCK:\d+\]\]\s*", " ", line).strip()
        cites = []
        media = []
        for token in tokens:
            value = replacements[token]
            if value.get("type") == "quoted":
                for item in (value.get("data") or {}).get("quote_list") or []:
                    mid = mid_from_link(item.get("scheme") or "")
                    if mid in source_number and not any(x["mid"] == mid for x in cites):
                        cites.append({"mid": mid, "index": source_number[mid], "name": item.get("name") or "微博原文"})
            elif value.get("type") == "mediablock":
                for item in value.get("data") or []:
                    mid = item.get("cur_mid") or ""
                    if mid not in source_number:
                        continue
                    media.append({
                        "mid": mid,
                        "type": item.get("type"),
                        "author": item.get("user_name") or "",
                        "image": copy_asset(ARCHIVE / "智搜" / "media" / f"{mid}.jpg", f"ai_media_{mid}.jpg"),
                    })
        if text:
            if text.startswith("### "):
                kind, text = "heading", text[4:]
            elif text.startswith("- "):
                kind, text = "bullet", text[2:]
            else:
                kind = "paragraph"
            blocks.append({"kind": kind, "text": text.strip(), "citations": cites})
        if media:
            blocks.append({"kind": "media", "items": media})
    return blocks


def main():
    global ARCHIVE
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, default=ARCHIVE, help="原始采集目录")
    args = parser.parse_args()
    ARCHIVE = args.archive.resolve()
    ASSETS.mkdir(parents=True, exist_ok=True)
    ai = read_json(ARCHIVE / "智搜" / "api_loop_01.json")
    raw_answer = (ARCHIVE / "智搜" / "回答_接口原文.md").read_text(encoding="utf-8")
    post_rows = []
    for name, uid, bid in POST_SPECS:
        folder = ARCHIVE / "普通新闻" / name
        status = read_json(folder / "status.json")
        longtext = read_json(folder / "longtext.json")
        user = status.get("user") or {}
        media = folder / "canonical_media"
        prefix = bid.lower()
        photos = [copy_asset(media / f"photo_{i:02d}.jpg", f"{prefix}_photo_{i:02d}.jpg")
                  for i in range(1, len(status.get("pic_ids") or []) + 1)]
        post_rows.append({
            "id": str(status.get("idstr") or status.get("id")),
            "bid": bid,
            "url": f"https://weibo.com/{uid}/{bid}",
            "author": user.get("screen_name") or name,
            "authorUrl": f"https://weibo.com/u/{uid}",
            "avatar": copy_asset(media / "avatar_display.jpg", f"{prefix}_avatar.jpg"),
            "avatarHd": copy_asset(media / "avatar_hd.jpg", f"{prefix}_avatar_hd.jpg"),
            "verified": bool(user.get("verified")),
            "createdAt": status.get("created_at") or "",
            "source": re.sub(r"<[^>]*>", "", status.get("source") or ""),
            "text": html.unescape((longtext.get("data") or {}).get("longTextContent") or status.get("text_raw") or ""),
            "photos": [x for x in photos if x],
            "video": copy_asset(media / "video.mp4", f"{prefix}_video.mp4"),
            "videoPoster": copy_asset(media / "video_poster.jpg", f"{prefix}_video_poster.jpg"),
            "reposts": status.get("reposts_count") or 0,
            "comments": status.get("comments_count") or 0,
            "likes": status.get("attitudes_count") or 0,
        })

    source_links = [
        {"index": index, "mid": post["id"], "name": post["author"], "url": post["url"]}
        for index, post in enumerate(post_rows, start=1)
    ]

    bundle = {
        "id": "saltcity_202610",
        "topic": "13岁男孩被打后多次求助宿管遭拒",
        "sourceCaptureDate": "2026-11-07",
        "posts": post_rows,
        "smart": {
            "blocks": parse_ai_blocks(raw_answer, [post["id"] for post in post_rows]),
            "generatedAt": ai.get("analysis_time"),
            "weiboReferenceCount": 3,
            "sources": source_links,
        },
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Built {DATA}: {len(post_rows)} posts, {len(bundle['smart']['blocks'])} answer blocks, {len(source_links)} links")


if __name__ == "__main__":
    main()
