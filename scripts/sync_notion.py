#!/usr/bin/env python3
import json
import os
import random
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2026-03-11"
DATA_SOURCE_ID = os.getenv("NOTION_DATA_SOURCE_ID", "b2fde79c-a98e-454a-8217-612a6eaec56d")
TOKEN = os.getenv("NOTION_TOKEN", "").strip()
OUT = Path("data/knowledge.json")

TOPIC_RULES = [
    ("Agentic Commerce", r"エージェンティック|agentic"),
    ("AI Search / AEO", r"AEO|AIO|GEO|AI検索|AI経由|AI型購買|生成AI.*購買|AIショッピング"),
    ("生成AI実務", r"生成AI|ChatGPT|LLM|AI活用|AIエージェント"),
    ("CEP / 想起", r"CEP|想起|第一想起"),
    ("KPI / 計測", r"KPI|KGI|計測|指標|効果測定"),
    ("検索行動", r"検索行動|検索数|検索クエリ|SCM|SEO"),
    ("購買行動", r"購買|購入|買う|ファネル|決済"),
    ("消費者インサイト", r"消費者|生活者|インサイト|N.?=.?1|顧客理解"),
    ("EC成長", r"EC|eコマース|Amazon|楽天|TikTok Shop|D2C|モール"),
    ("広告効果", r"広告|メディア投資|リーチ|フリークエンシー|CTR|CPA"),
    ("ブランド成長", r"ブランド|認知|シェア|ロイヤル|浸透率"),
    ("価格戦略", r"価格|値上げ|プライシング|値付け"),
    ("CRM / LTV", r"CRM|LTV|会員|ロイヤルティ|メール|メルマガ"),
    ("SNS / UGC", r"SNS|UGC|TikTok|Instagram|インフルエンサー|VTuber"),
    ("市場 / 競合", r"市場|競合|差別化|シェア|ポジショニング"),
    ("調査設計", r"調査|アンケート|モニター|サンプル|回答率"),
    ("商品開発", r"商品開発|新商品|新ニーズ|パッケージ"),
    ("マネジメント", r"マネジメント|組織|会議|評価制度|コミュニケーション"),
]

SESSION = requests.Session()


def notion_headers():
    return {
        "Authorization": f"Bearer {TOKEN}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def request(method, path, **kwargs):
    url = path if path.startswith("http") else API_BASE + path
    for attempt in range(7):
        r = SESSION.request(method, url, headers=notion_headers(), timeout=40, **kwargs)
        if r.status_code == 429:
            wait = float(r.headers.get("Retry-After", "1.2"))
            time.sleep(max(wait, 0.8))
            continue
        if 500 <= r.status_code < 600:
            time.sleep(min(2 ** attempt, 12))
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"Notion request failed after retries: {method} {url}")


def plain_rich_text(arr):
    if not arr:
        return ""
    out = []
    for x in arr:
        if isinstance(x, dict):
            out.append(x.get("plain_text") or x.get("text", {}).get("content") or "")
    return "".join(out).strip()


def prop_text(prop):
    if not isinstance(prop, dict):
        return ""
    typ = prop.get("type")
    if typ in ("title", "rich_text"):
        return plain_rich_text(prop.get(typ, []))
    return ""


def prop_select(prop):
    if not isinstance(prop, dict):
        return None
    typ = prop.get("type")
    v = prop.get(typ) if typ in ("select", "status") else None
    return v.get("name") if isinstance(v, dict) else None


def prop_checkbox(prop):
    return bool(prop.get("checkbox")) if isinstance(prop, dict) else False


def prop_created_time(prop, fallback=""):
    if isinstance(prop, dict) and prop.get("type") == "created_time":
        return prop.get("created_time") or fallback
    return fallback


def query_all_pages():
    results = []
    cursor = None
    while True:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        payload = request("POST", f"/data_sources/{DATA_SOURCE_ID}/query", json=body)
        results.extend([x for x in payload.get("results", []) if x.get("object") == "page"])
        if not payload.get("has_more"):
            break
        cursor = payload.get("next_cursor")
    return results


def list_comments(block_id):
    comments = []
    cursor = None
    while True:
        params = {"block_id": block_id, "page_size": 100}
        if cursor:
            params["start_cursor"] = cursor
        payload = request("GET", "/comments", params=params)
        for c in payload.get("results", []):
            text = plain_rich_text(c.get("rich_text", []))
            if not text and isinstance(c.get("markdown"), str):
                text = c["markdown"]
            if text:
                comments.append({
                    "id": c.get("id"),
                    "discussion_id": c.get("discussion_id"),
                    "created_time": c.get("created_time"),
                    "text": text,
                })
        if not payload.get("has_more"):
            break
        cursor = payload.get("next_cursor")
    return comments


def extract_topics(text):
    out = []
    for name, pattern in TOPIC_RULES:
        if re.search(pattern, text or "", flags=re.I):
            out.append(name)
    return out


def build_item(page, include_comments=True):
    props = page.get("properties", {})
    title = prop_text(props.get("title")) or prop_text(props.get("Name")) or "Untitled"
    summary = prop_text(props.get("summary"))
    category = prop_select(props.get("種類")) or "未分类"
    status = prop_select(props.get("保存"))
    is_read = prop_checkbox(props.get("既読"))
    created = prop_created_time(props.get("Date"), page.get("created_time", ""))
    comments = []
    comment_error = None
    if include_comments:
        try:
            comments = list_comments(page.get("id"))
        except Exception as e:
            comment_error = str(e)[:240]
    comment_text = "\n".join(c["text"] for c in comments)
    topics = extract_topics(" ".join([title, summary, comment_text]))
    return {
        "id": page.get("id"),
        "url": page.get("url"),
        "title": title,
        "summary": summary,
        "category": category,
        "date": (created or "")[:10],
        "created_time": created,
        "read": is_read,
        "save_status": status,
        "comments": comments,
        "comment_count": len(comments),
        "comment_error": comment_error,
        "topics": topics,
        "search_text": "\n".join(x for x in [title, summary, comment_text] if x),
    }


def main():
    if not TOKEN:
        print("NOTION_TOKEN is not configured; keeping the existing Notion snapshot.")
        return 0

    pages = query_all_pages()
    metrics = {
        "total": len(pages),
        "read": 0,
        "stock": 0,
        "rejected": 0,
        "undecided": 0,
        "added_30d": 0,
        "added_90d": 0,
    }
    category_all = Counter()
    category_stock = Counter()
    category_rejected = Counter()
    stock_pages = []
    now = datetime.now(timezone.utc)

    for p in pages:
        props = p.get("properties", {})
        save_status = prop_select(props.get("保存")) or "未定"
        cat = prop_select(props.get("種類")) or "未分类"
        created = prop_created_time(props.get("Date"), p.get("created_time", ""))
        if prop_checkbox(props.get("既読")):
            metrics["read"] += 1
        category_all[cat] += 1
        if save_status == "ストック":
            metrics["stock"] += 1
            category_stock[cat] += 1
            stock_pages.append(p)
        elif save_status == "ストックしない":
            metrics["rejected"] += 1
            category_rejected[cat] += 1
        else:
            metrics["undecided"] += 1
        try:
            dt = datetime.fromisoformat((created or "").replace("Z", "+00:00"))
            if now - dt <= timedelta(days=30):
                metrics["added_30d"] += 1
            if now - dt <= timedelta(days=90):
                metrics["added_90d"] += 1
        except Exception:
            pass

    items = []
    for i, page in enumerate(stock_pages, start=1):
        try:
            item = build_item(page, include_comments=True)
            items.append(item)
            print(f"[{i}/{len(stock_pages)}] {item['title'][:70]} comments={item['comment_count']}")
        except Exception as e:
            print(f"WARN: failed item {page.get('id')}: {e}", file=sys.stderr)
        # Stay comfortably under Notion API rate limits.
        time.sleep(0.34)

    items.sort(key=lambda x: x.get("created_time") or "", reverse=True)

    categories = []
    for name, total in category_all.most_common():
        categories.append({
            "name": name,
            "total": total,
            "stock": category_stock[name],
            "rejected": category_rejected[name],
        })

    topic_counts = Counter()
    for item in items:
        topic_counts.update(item.get("topics", []))

    old_items = [x for x in items if x.get("date") and x["date"] < (now - timedelta(days=365)).date().isoformat()]
    resurface_pool = old_items if len(old_items) >= 12 else items
    random.seed(now.date().isoformat())
    resurface = random.sample(resurface_pool, min(6, len(resurface_pool))) if resurface_pool else []

    payload = {
        "meta": {
            "source": "Notion / 情報収集と整理 / データベース情報収集",
            "data_source_id": DATA_SOURCE_ID,
            "snapshot_at": now.isoformat(),
            "schema_version": 2,
            "comments_included": True,
            "comments_scope": "page-level open comments via Notion API",
            "notion_api_version": NOTION_VERSION,
        },
        "metrics": metrics,
        "categories": categories,
        "topic_counts": [{"name": k, "count": v} for k, v in topic_counts.most_common()],
        "items": items,
        "recent_stock": items[:20],
        "resurface": [{"url": x["url"], "title": x["title"], "category": x["category"], "date": x["date"]} for x in resurface],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}: {len(items)} Stock items, {sum(x['comment_count'] for x in items)} comments")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
