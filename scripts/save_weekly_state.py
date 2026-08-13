#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "weekly-state.enc.json"
MAX_ENVELOPE_BYTES = 350_000


def fail(message: str) -> None:
    Path("/tmp/weekly_state_error.txt").write_text(message, encoding="utf-8")
    raise RuntimeError(message)


def valid_b64(value: str, name: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except Exception as exc:
        fail(f"Invalid {name} base64: {exc}")


def main() -> None:
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        fail("GITHUB_EVENT_PATH is missing")
    event = json.loads(Path(event_path).read_text(encoding="utf-8"))
    issue = event.get("issue") or {}
    body = issue.get("body") or ""
    match = re.search(r"STATE_ENVELOPE_B64:\s*([A-Za-z0-9+/=]+)", body)
    if not match:
        fail("Encrypted state payload was not found in the issue body")

    raw = valid_b64(match.group(1), "envelope")
    if len(raw) > MAX_ENVELOPE_BYTES:
        fail("Encrypted state payload is too large")
    try:
        env = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        fail(f"Envelope is not valid JSON: {exc}")

    if env.get("kind") != "weekly-state":
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

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(env, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Saved encrypted Weekly state: {len(ciphertext)} ciphertext bytes")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        if not Path("/tmp/weekly_state_error.txt").exists():
            Path("/tmp/weekly_state_error.txt").write_text(str(exc), encoding="utf-8")
        raise
