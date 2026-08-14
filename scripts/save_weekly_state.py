#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import os
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "weekly-state.enc.json"
META = ROOT / "data" / "weekly-state.json"
DELTA_DIR = ROOT / "data" / "weekly-state-deltas"
MAX_ENVELOPE_BYTES = 350_000


def fail(message: str) -> None:
    Path("/tmp/weekly_state_error.txt").write_text(message, encoding="utf-8")
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
        raw = json.loads(META.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return {"meta": {}}
        raw.setdefault("meta", {})
        return raw
    except Exception:
        return {"meta": {}}


def write_meta(doc: dict) -> None:
    META.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def validate_envelope(env: dict) -> bytes:
    kind = env.get("kind")
    if kind not in {"weekly-state", "weekly-state-delta"}:
        fail("Unexpected encrypted payload kind")
    if env.get("algorithm") != "AES-256-GCM":
        fail("Unexpected encryption algorithm")
    if env.get("kdf") != "PBKDF2-SHA256":
        fail("Unexpected KDF")
    if int(env.get("iterations") or 0) < 600_000:
        fail("PBKDF2 iteration count is too low")
    if env.get("compression") not in (None, "gzip"):
        fail("Unsupported compression")

    salt = valid_b64(str(env.get("salt") or ""), "salt")
    iv = valid_b64(str(env.get("iv") or ""), "iv")
    ciphertext = valid_b64(str(env.get("ciphertext") or ""), "ciphertext")
    if len(salt) < 16:
        fail("Salt is too short")
    if len(iv) != 12:
        fail("AES-GCM IV must be 12 bytes")
    if len(ciphertext) < 16:
        fail("Ciphertext is too short")
    if not iso_ms(env.get("created_at")):
        fail("Encrypted payload created_at is invalid")
    return ciphertext


def save_full(env: dict, ciphertext: bytes) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(env, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    created_at = str(env.get("created_at") or "")
    write_meta({"meta": {
        "encrypted_full_data": True,
        "snapshot_at": created_at,
        "latest_at": created_at,
        "cursor_updated_at": iso_ms(created_at),
        "cursor_id": "\uffff",
        "delta_count": 0,
        "deltas": [],
        "note": "Weekly reading state is stored as an encrypted base snapshot plus encrypted incremental deltas."
    }})
    print(f"Saved encrypted Weekly base state: {len(ciphertext)} ciphertext bytes")


def save_delta(env: dict, ciphertext: bytes, issue_number: int) -> None:
    if not OUT.exists():
        fail("Base Weekly state backup is missing")

    through_ts = int(env.get("cursor_updated_at") or 0)
    through_id = str(env.get("cursor_id") or "")
    entry_count = int(env.get("entry_count") or 0)
    if through_ts <= 0 or not through_id:
        fail("Incremental backup cursor metadata is missing")
    if entry_count <= 0 or entry_count > 500:
        fail("Incremental backup entry count is invalid")

    doc = load_meta()
    meta = doc.setdefault("meta", {})
    snapshot_at = str(meta.get("snapshot_at") or "")
    if not snapshot_at:
        try:
            snapshot_at = str(json.loads(OUT.read_text(encoding="utf-8")).get("created_at") or "")
        except Exception:
            snapshot_at = ""
    if env.get("base_snapshot_at") and snapshot_at and str(env.get("base_snapshot_at")) != snapshot_at:
        fail("Incremental backup was prepared against a different base snapshot; refresh and retry")

    prev_ts = int(meta.get("cursor_updated_at") or iso_ms(snapshot_at) or 0)
    prev_id = str(meta.get("cursor_id") or ("\uffff" if snapshot_at else ""))
    if (through_ts, through_id) <= (prev_ts, prev_id):
        fail("Incremental backup is stale or already applied; refresh and retry")

    created_at = str(env.get("created_at") or "")
    stamp = re.sub(r"[^0-9]", "", created_at)[:17] or "delta"
    DELTA_DIR.mkdir(parents=True, exist_ok=True)
    rel_path = f"data/weekly-state-deltas/{stamp}-{issue_number}.enc.json"
    path = ROOT / rel_path
    path.write_text(json.dumps(env, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    deltas = meta.get("deltas") if isinstance(meta.get("deltas"), list) else []
    deltas = [d for d in deltas if (d.get("path") if isinstance(d, dict) else d) != rel_path]
    deltas.append({
        "path": rel_path,
        "created_at": created_at,
        "cursor_updated_at": through_ts,
        "cursor_id": through_id,
        "entry_count": entry_count,
    })
    deltas.sort(key=lambda d: (int(d.get("cursor_updated_at") or 0), str(d.get("cursor_id") or "")))

    meta.update({
        "encrypted_full_data": True,
        "snapshot_at": snapshot_at,
        "latest_at": created_at,
        "cursor_updated_at": through_ts,
        "cursor_id": through_id,
        "delta_count": len(deltas),
        "deltas": deltas,
        "note": "Weekly reading state is stored as an encrypted base snapshot plus encrypted incremental deltas; no plaintext reading state is stored."
    })
    write_meta(doc)
    print(f"Saved encrypted Weekly delta: {entry_count} entries, {len(ciphertext)} ciphertext bytes -> {rel_path}")


def main() -> None:
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        fail("GITHUB_EVENT_PATH is missing")
    event = json.loads(Path(event_path).read_text(encoding="utf-8"))
    issue = event.get("issue") or {}
    body = issue.get("body") or ""
    match = re.search(r"STATE_ENVELOPE_B64:\s*([A-Za-z0-9+/=]+)", body)
    if not match:
        if os.environ.get("WEEKLY_STATE_OPTIONAL") == "1":
            print("No Weekly state envelope included; skipping optional backup")
            return
        fail("Encrypted state payload was not found in the issue body")

    raw = valid_b64(match.group(1), "envelope")
    if len(raw) > MAX_ENVELOPE_BYTES:
        fail("Encrypted state payload is too large")
    try:
        env = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        fail(f"Envelope is not valid JSON: {exc}")
    if not isinstance(env, dict):
        fail("Envelope must be a JSON object")

    ciphertext = validate_envelope(env)
    if env.get("kind") == "weekly-state-delta":
        save_delta(env, ciphertext, int(issue.get("number") or 0))
    else:
        save_full(env, ciphertext)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        if not Path("/tmp/weekly_state_error.txt").exists():
            Path("/tmp/weekly_state_error.txt").write_text(str(exc), encoding="utf-8")
        raise
