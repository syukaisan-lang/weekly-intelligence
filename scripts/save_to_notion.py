#!/usr/bin/env python3
import json
import os
import re
import sys
from pathlib import Path

import requests
import temporal_knowledge as temporal

API_BASE="https://api.notion.com/v1"
NOTION_VERSION="2026-03-11"
DATA_SOURCE_ID=os.getenv("NOTION_DATA_SOURCE_ID","b2fde79c-a98e-454a-8217-612a6eaec56d")
TOKEN=os.getenv("NOTION_TOKEN","").strip()
EVENT_PATH=os.getenv("GITHUB_EVENT_PATH","")
ARTICLES_PATH=Path("data/articles.json")


def headers(): return {"Authorization":f"Bearer {TOKEN}","Notion-Version":NOTION_VERSION,"Content-Type":"application/json"}
def notion(method,path,**kwargs):
    r=requests.request(method,API_BASE+path,headers=headers(),timeout=40,**kwargs);r.raise_for_status();return r.json()

def read_article():
    if not EVENT_PATH: raise RuntimeError("GITHUB_EVENT_PATH is missing")
    event=json.loads(Path(EVENT_PATH).read_text(encoding="utf-8"));issue=event.get("issue") or {}
    author=((issue.get("user") or {}).get("login") or "").strip()
    if author!="syukaisan-lang": raise RuntimeError(f"Unauthorized issue author: {author}")
    m=re.search(r"ARTICLE_ID:\s*([^\s]+)",issue.get("body") or "")
    if not m: raise RuntimeError("ARTICLE_ID not found")
    article_id=m.group(1).strip()
    raw=json.loads(ARTICLES_PATH.read_text(encoding="utf-8"));articles=raw.get("articles",raw if isinstance(raw,list) else [])
    article=next((a for a in articles if str(a.get("id"))==article_id),None)
    if not article: raise RuntimeError(f"Article ID not found in data/articles.json: {article_id}")
    return article

def rich_text(text,limit=1900):
    text=(text or "").strip();return [{"type":"text","text":{"content":text[:limit]}}] if text else []

def infer_category(a):
    text=" ".join([a.get("title") or "",a.get("summary") or "",a.get("reason") or ""," ".join(a.get("tags") or [])," ".join(a.get("concepts") or [])])
    if re.search(r"AI|生成AI|AEO|AIO|GEO|LLM|ChatGPT",text,re.I): return "AI"
    if re.search(r"EC|eコマース|Amazon|楽天|D2C|TikTok Shop",text,re.I): return "EC"
    if re.search(r"消費者|生活者|購買行動|インサイト|顧客",text,re.I): return "消費者"
    if re.search(r"家電|イヤホン|ヘッドホン|デバイス|ガジェット",text,re.I): return "家電情報"
    return "マーケティング"

def find_duplicate(title):
    body={"page_size":10,"filter":{"property":"title","title":{"equals":title[:2000]}}}
    result=notion("POST",f"/data_sources/{DATA_SOURCE_ID}/query",json=body)
    pages=[x for x in result.get("results",[]) if x.get("object")=="page"]
    return pages[0] if pages else None

def create_page(a):
    title=(a.get("title") or "Untitled").strip();duplicate=find_duplicate(title)
    if duplicate:return {"duplicate":True,"url":duplicate.get("url"),"id":duplicate.get("id")}
    summary=(a.get("summary") or a.get("reason") or "").strip();category=infer_category(a)
    properties={"title":{"type":"title","title":rich_text(title)},"保存":{"type":"status","status":{"name":"ストック"}},"既読":{"type":"checkbox","checkbox":True},"種類":{"type":"select","select":{"name":category}}}
    if summary:properties["summary"]={"type":"rich_text","rich_text":rich_text(summary)}
    children=[]
    for label,value in [("Original URL",a.get("url") or ""),("Source",a.get("source") or ""),("Why saved",a.get("reason") or "")]:
        if value:children.append({"object":"block","type":"paragraph","paragraph":{"rich_text":rich_text(f"{label}: {value}")}})
    published=str(a.get("published") or "").strip()
    if published:
        children.append({"object":"block","type":"paragraph","paragraph":{"rich_text":rich_text(f"Published at: {published[:10]}")}})
    evidence_text=" ".join([title,summary,a.get("content_excerpt") or ""])
    ev=temporal.evidence_period(evidence_text)
    if ev:
        children.append({"object":"block","type":"paragraph","paragraph":{"rich_text":rich_text(f"Evidence period: {ev['start']} to {ev['end']}")}})
    body={"parent":{"type":"data_source_id","data_source_id":DATA_SOURCE_ID},"properties":properties}
    if children:body["children"]=children
    page=notion("POST","/pages",json=body)
    return {"duplicate":False,"url":page.get("url"),"id":page.get("id"),"category":category,"published_at":published[:10] if published else None,"evidence_period":ev}

def main():
    if not TOKEN:raise RuntimeError("NOTION_TOKEN is not configured in GitHub Secrets")
    result=create_page(read_article());Path("/tmp/notion_save_result.json").write_text(json.dumps(result,ensure_ascii=False),encoding="utf-8")
    print(("Already exists: " if result.get("duplicate") else "Created: ")+str(result.get("url")));return 0

if __name__=="__main__":
    try:raise SystemExit(main())
    except Exception as e:Path("/tmp/notion_save_error.txt").write_text(str(e),encoding="utf-8");print(str(e),file=sys.stderr);raise
