# My Work System — private Google source sync

The Work System reads three private Google Drive files and writes only encrypted content to this public repository.

## Required GitHub secret

Create one additional repository secret:

- `GOOGLE_SERVICE_ACCOUNT_JSON` — the full JSON key of a Google Cloud service account that has **read-only** access to the three source files.

`DASHBOARD_PASSPHRASE` is reused for encryption. Use a unique password of at least 14 characters; 18+ characters or 5–6 random words is recommended. Do not reuse your Google, GitHub, email, or Notion password.

`OPENAI_API_KEY` + repository variable `OPENAI_MODEL` are optional. If configured, changed notes are synthesized into cross-source work rules. Without them, the system still syncs all notes and exposes deterministic rule candidates after decryption.

## Google Cloud setup

1. Create/select a Google Cloud project.
2. Enable **Google Drive API**.
3. Create a Service Account.
4. Create a JSON key for the Service Account and download it once.
5. Copy the whole JSON into GitHub → Settings → Secrets and variables → Actions → New repository secret → `GOOGLE_SERVICE_ACCOUNT_JSON`.
6. In the JSON, find `client_email` (for example `work-system-reader@project.iam.gserviceaccount.com`).
7. Share each of the three Google Drive files with that email as **Viewer** only.

Source file IDs used by the sync:
- `19gBiQuP8kjMRkzhuNRXXKKZS7Cn-yKJUZdADPOYJDos`
- `13nPr94W9YHfZi_SkFk1i38WAHdO8pdEq`
- `1bBVlTpIodFbSLK8l2CsukALFdSq9m5hpxLHMK7liaug`

## Schedule

`Sync personal work system` runs every Friday at **18:20 JST**. It downloads the three files and compares content hashes. If nothing changed, it exits without rewriting data. If anything changed, it rebuilds and encrypts `data/work-system.enc.json`.

Notion then syncs at 18:40 JST and Weekly updates at 19:05 JST.

## Security model

Private Google/Notion text is never intentionally committed as plaintext. The browser decrypts private data locally. The passphrase is kept only in page memory, not localStorage/sessionStorage, and the page auto-locks after inactivity.

This is still a static public GitHub Pages site. The encrypted ciphertext is downloadable by anyone who knows where to look. A strong unique passphrase is mandatory. For protection even if the passphrase leaks, put the site behind a second authentication layer such as Cloudflare Access / Google login, or move the private data to authenticated private storage.
