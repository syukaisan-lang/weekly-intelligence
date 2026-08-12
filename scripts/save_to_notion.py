#!/usr/bin/env python3
import base64
import json
import os
import re
import sys
from pathlib import Path

import requests

API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2026-03-11"
DATA_SOURCE_ID = os.getenv("NOTION_DATA_SOURCE_ID", "b2fde79c-a98e-454a-8217-612a6eaec56d")
TOKEN = os.getenv("NOTION_TOKEN", "").strip()
EVENT_PATH = os.getenv("GITHUB_EVENT_PATH", "")


def headers():
    return {
        "Authorization": f"Bearer {TOKEN}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def notion(method, path, **kwargs):
    r = requests.request(method, API_BASE + path, headers=headers(), timeout=40, **kwargs)
    r.raise_for_status()
    return r.json()


def read_payload():
    if not EVENT_PATH:
        raise RuntimeError("GITHUB_EVENT_PATH is missing")
    event = json.loads(Path(EVENT_PATH).read_text(encoding="utf-8"))
    issue = event.get("issue") or {}
    author = ((issue.get("user") or {}).get("login") or "").strip()
    if author != "syukaisan-lang":
        raise RuntimeError(f"Unauthorized issue author: {author}")
    body = issue.get("body") or ""
    m = re.search(r"PAYLOAD_BASE64:\s*([A-Za-z0-9_\-+/=]+)", body)
    if not m:
        raise RuntimeError("PAYLOAD_BASE64 not found")
    raw = base64.b64decode(m.group(1)).decode("utf-8")
    payload = json.loads(raw)
    payload["issue_number"] = issue.get("number")
    return payload


def rich_text(text, limit=1900):
    text = (text or "").strip()
    if not text:
        return []
    return [{"type": "text", "text": {"content": text[:limit]}}]


def infer_category(payload):
    requested = (payload.get("category") or "").strip()
    allowed = {"家電情報","キャンペーン","マーケティング","スキル","消費者","EC","知識","ビジネス","AI","新商品開発"}
    if requested in allowed:
        return requested
    text = " ".join([
        payload.get("title") or "",
        payload.get("summary") or "",
        payload.get("reason") or "",
        " ".join(payload.get("tags") or []),
    ])
    if re.search(r"AI|生成AI|AEO|AIO|GEO|LLM|ChatGPT", text, re.I):
        return "AI"
    if re.search(r"EC|eコマース|Amazon|楽天|D2C|TikTok Shop", text, re.I):
        return "EC"
    if re.search(r"消費者|生活者|購買行動|インサイト|顧客", text, re.I):
        return "消費者"
    if re.search(r"家電|イヤホン|ヘッドホン|デバイス|ガジェット", text, re.I):
        return "家電情報"
    return "マーケティング"


def find_duplicate(title):
    body = {
        "page_size": 10,
        "filter": {"property": "title", "title": {"equals": title[:2000]}},
    }
    result = notion("POST", f"/data_sources/{DATA_SOURCE_ID}/query", json=body)
    pages = [x for x in result.get("results", []) if x.get("object") == "page"]
    return pages[0] if pages else None


def create_page(payload):
    title = (payload.get("title") or "Untitled").strip()
    duplicate = find_duplicate(title)
    if duplicate:
        return {"duplicate": True, "url": duplicate.get("url"), "id": duplicate.get("id")}

    summary = (payload.get("summary") or payload.get("reason") or "").strip()
    category = infer_category(payload)
    properties = {
        "title": {"type": "title", "title": rich_text(title)},
        "保存": {"type": "status", "status": {"name": "ストック"}},
        "既読": {"type": "checkbox", "checkbox": True},
        "種類": {"type": "select", "select": {"name": category}},
    }
    if summary:
        properties["summary"] = {"type": "rich_text", "rich_text": rich_text(summary)}

    url = payload.get("url") or ""
    source = payload.get("source") or ""
    reason = payload.get("reason") or ""
    children = []
    for label, value in [("Original URL", url), ("Source", source), ("Why saved", reason)]:
        if not value:
            continue
        children.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {"rich_text": rich_text(f"{label}: {value}")},
        })

    body = {
        "parent": {"type": "data_source_id", "data_source_id": DATA_SOURCE_ID},
        "properties": properties,
    }
    if children:
        body["children"] = children
    page = notion("POST", "/pages", json=body)
    return {"duplicate": False, "url": page.get("url"), "id": page.get("id"), "category": category}


def main():
    if not TOKEN:
        raise RuntimeError("NOTION_TOKEN is not configured in GitHub Secrets")
    payload = read_payload()
    result = create_page(payload)
    Path("/tmp/notion_save_result.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    if result.get("duplicate"):
        print(f"Already exists: {result.get('url')}")
    else:
        print(f"Created: {result.get('url')} category={result.get('category')}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        Path("/tmp/notion_save_error.txt").write_text(str(e), encoding="utf-8")
        print(str(e), file=sys.stderr)
        raise
