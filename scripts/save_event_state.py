#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import os
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "events" / "event-state.enc.json"
META = ROOT / "events" / "event-state.json"
MAX_ENVELOPE_BYTES = 180_000
MAX_ENTRIES = 5000

def fail(message: str) -> None:
    Path("/tmp/event_state_error.txt").write_text(message, encoding="utf-8")
    raise RuntimeError(message)

def valid_b64(value: str, name: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except Exception as exc:
        fail(f"Invalid {name} base64: {exc}")

def iso_ms(value: object) -> int:
    text = str(value or "").strip()
    if not text:
        return 0
    try:
        return int(datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp() * 1000)
    except Exception:
        return 0

def load_meta() -> dict:
    if not META.exists():
        return {"meta": {}}
    try:
        doc = json.loads(META.read_text(encoding="utf-8"))
        return doc if isinstance(doc, dict) else {"meta": {}}
    except Exception:
        return {"meta": {}}

def main() -> None:
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        fail("GITHUB_EVENT_PATH is missing")
    event = json.loads(Path(event_path).read_text(encoding="utf-8"))
    issue = event.get("issue") or {}
    body = issue.get("body") or ""
    match = re.search(r"EVENT_STATE_ENVELOPE_B64:\s*([A-Za-z0-9+/=]+)", body)
    if not match:
        fail("Encrypted event state payload was not found")

    raw = valid_b64(match.group(1), "envelope")
    if len(raw) > MAX_ENVELOPE_BYTES:
        fail("Encrypted event state payload is too large")
    try:
        env = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        fail(f"Envelope is not valid JSON: {exc}")
    if not isinstance(env, dict):
        fail("Envelope must be an object")
    if env.get("kind") != "event-state":
        fail("Unexpected encrypted payload kind")
    if env.get("algorithm") != "AES-256-GCM":
        fail("Unexpected encryption algorithm")
    if env.get("kdf") != "PBKDF2-SHA256":
        fail("Unexpected KDF")
    if int(env.get("iterations") or 0) < 600_000:
        fail("PBKDF2 iteration count is too low")
    if env.get("compression") not in (None, "gzip"):
        fail("Unsupported compression")
    if len(valid_b64(str(env.get("salt") or ""), "salt")) < 16:
        fail("Salt is too short")
    if len(valid_b64(str(env.get("iv") or ""), "iv")) != 12:
        fail("AES-GCM IV must be 12 bytes")
    ciphertext = valid_b64(str(env.get("ciphertext") or ""), "ciphertext")
    if len(ciphertext) < 16:
        fail("Ciphertext is too short")

    created_at = str(env.get("created_at") or "")
    if not iso_ms(created_at):
        fail("created_at is invalid")
    entry_count = int(env.get("entry_count") or 0)
    cursor = int(env.get("cursor_updated_at") or 0)
    if entry_count < 0 or entry_count > MAX_ENTRIES:
        fail("entry_count is invalid")
    if entry_count > 0 and cursor <= 0:
        fail("cursor_updated_at is missing")

    old = load_meta().get("meta") or {}
    old_cursor = int(old.get("cursor_updated_at") or 0)
    if old_cursor and cursor and cursor < old_cursor:
        fail("This browser has an older Event Radar state than the current cloud backup. Restore cloud state first, then retry.")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(env, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    META.write_text(json.dumps({"meta":{
        "encrypted_full_data": True,
        "schema": 2,
        "snapshot_at": created_at,
        "latest_at": created_at,
        "cursor_updated_at": cursor,
        "entry_count": entry_count,
        "note": "Tokyo Event Radar feedback is stored only as an encrypted full snapshot; no plaintext feedback is stored."
    }}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved encrypted event state: {entry_count} entries, {len(ciphertext)} ciphertext bytes")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        if not Path("/tmp/event_state_error.txt").exists():
            Path("/tmp/event_state_error.txt").write_text(str(exc), encoding="utf-8")
        raise
