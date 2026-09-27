#!/usr/bin/env python3
from __future__ import annotations

import base64, json, os, re
from datetime import datetime
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"events"/"event-state.enc.json"
META=ROOT/"events"/"event-state.json"
DELTA_DIR=ROOT/"events"/"event-state-deltas"
MAX_ENVELOPE_BYTES=250_000

def fail(msg:str)->None:
    Path("/tmp/event_state_error.txt").write_text(msg,encoding="utf-8")
    raise RuntimeError(msg)

def valid_b64(value:str,name:str)->bytes:
    try:return base64.b64decode(value,validate=True)
    except Exception as exc: fail(f"Invalid {name} base64: {exc}")

def iso_ms(value:object)->int:
    text=str(value or "").strip()
    if not text:return 0
    try:return int(datetime.fromisoformat(text.replace("Z","+00:00")).timestamp()*1000)
    except Exception:return 0

def load_meta()->dict:
    if not META.exists():return {"meta":{}}
    try:
        raw=json.loads(META.read_text(encoding="utf-8"))
        if not isinstance(raw,dict):return {"meta":{}}
        raw.setdefault("meta",{})
        return raw
    except Exception:return {"meta":{}}

def write_meta(doc:dict)->None:
    META.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def validate_env(env:dict)->bytes:
    if env.get("kind") not in {"event-state","event-state-delta"}: fail("Unexpected encrypted payload kind")
    if env.get("algorithm")!="AES-256-GCM": fail("Unexpected encryption algorithm")
    if env.get("kdf")!="PBKDF2-SHA256": fail("Unexpected KDF")
    if int(env.get("iterations") or 0)<600000: fail("PBKDF2 iteration count is too low")
    if env.get("compression") not in (None,"gzip"): fail("Unsupported compression")
    salt=valid_b64(str(env.get("salt") or ""),"salt"); iv=valid_b64(str(env.get("iv") or ""),"iv"); cipher=valid_b64(str(env.get("ciphertext") or ""),"ciphertext")
    if len(salt)<16: fail("Salt is too short")
    if len(iv)!=12: fail("AES-GCM IV must be 12 bytes")
    if len(cipher)<16: fail("Ciphertext is too short")
    if not iso_ms(env.get("created_at")): fail("created_at is invalid")
    return cipher

def save_full(env:dict,cipher:bytes)->None:
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(env,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    created=str(env.get("created_at") or "")
    cursor_ts=int(env.get("cursor_updated_at") or 0)
    cursor_id=str(env.get("cursor_id") or "")
    if cursor_ts<=0 or not cursor_id: fail("Base backup cursor metadata is missing")
    write_meta({"meta":{
        "encrypted_full_data":True,"schema":3,"snapshot_at":created,"latest_at":created,
        "cursor_updated_at":cursor_ts,"cursor_id":cursor_id,"entry_count":int(env.get("entry_count") or 0),
        "delta_count":0,"deltas":[],
        "note":"Tokyo Event Radar feedback is stored as an encrypted base snapshot plus encrypted incremental deltas."
    }})
    print(f"Saved Event base snapshot: {len(cipher)} ciphertext bytes")

def save_delta(env:dict,cipher:bytes,issue_number:int)->None:
    if not OUT.exists(): fail("Base Event state backup is missing")
    ts=int(env.get("cursor_updated_at") or 0); cid=str(env.get("cursor_id") or ""); count=int(env.get("entry_count") or 0)
    if ts<=0 or not cid: fail("Incremental backup cursor metadata is missing")
    if count<=0 or count>500: fail("Incremental backup entry count is invalid")
    doc=load_meta(); meta=doc.setdefault("meta",{})
    snap=str(meta.get("snapshot_at") or "")
    if not snap:
        try:snap=str(json.loads(OUT.read_text(encoding="utf-8")).get("created_at") or "")
        except Exception:snap=""
    if env.get("base_snapshot_at") and snap and str(env.get("base_snapshot_at"))!=snap:
        fail("Incremental backup was prepared against a different base snapshot; refresh and retry")
    prev_ts=int(meta.get("cursor_updated_at") or 0); prev_id=str(meta.get("cursor_id") or "")
    if (ts,cid)<=(prev_ts,prev_id): fail("Incremental backup is stale or already applied")
    created=str(env.get("created_at") or "")
    stamp=re.sub(r"[^0-9]","",created)[:17] or "delta"
    DELTA_DIR.mkdir(parents=True,exist_ok=True)
    rel=f"events/event-state-deltas/{stamp}-{issue_number}.enc.json"
    (ROOT/rel).write_text(json.dumps(env,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    deltas=meta.get("deltas") if isinstance(meta.get("deltas"),list) else []
    deltas=[d for d in deltas if (d.get("path") if isinstance(d,dict) else d)!=rel]
    deltas.append({"path":rel,"created_at":created,"cursor_updated_at":ts,"cursor_id":cid,"entry_count":count})
    deltas.sort(key=lambda d:(int(d.get("cursor_updated_at") or 0),str(d.get("cursor_id") or "")))
    meta.update({"encrypted_full_data":True,"schema":3,"snapshot_at":snap,"latest_at":created,"cursor_updated_at":ts,"cursor_id":cid,
                 "delta_count":len(deltas),"deltas":deltas,
                 "note":"Tokyo Event Radar feedback uses an encrypted base snapshot plus encrypted incremental deltas; no plaintext feedback is stored."})
    write_meta(doc)
    print(f"Saved Event delta: {count} entries -> {rel}")

def main()->None:
    ep=os.environ.get("GITHUB_EVENT_PATH")
    if not ep: fail("GITHUB_EVENT_PATH is missing")
    event=json.loads(Path(ep).read_text(encoding="utf-8"))
    issue=event.get("issue") or {}; body=issue.get("body") or ""
    m=re.search(r"EVENT_STATE_ENVELOPE_B64:\s*([A-Za-z0-9+/=]+)",body)
    if not m: fail("Encrypted event state payload was not found")
    raw=valid_b64(m.group(1),"envelope")
    if len(raw)>MAX_ENVELOPE_BYTES: fail("Encrypted event state payload is too large")
    try:env=json.loads(raw.decode("utf-8"))
    except Exception as exc: fail(f"Envelope is not valid JSON: {exc}")
    if not isinstance(env,dict): fail("Envelope must be an object")
    cipher=validate_env(env)
    if env.get("kind")=="event-state-delta": save_delta(env,cipher,int(issue.get("number") or 0))
    else: save_full(env,cipher)

if __name__=="__main__":
    try: main()
    except Exception as exc:
        if not Path("/tmp/event_state_error.txt").exists():
            Path("/tmp/event_state_error.txt").write_text(str(exc),encoding="utf-8")
        raise
