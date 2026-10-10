"""Migrate old encrypted feedback and refresh the private CI learning cache.

GitHub OIDC authorizes the exact production workflow, without storing a sync code.
Only the temporary cache (outside the checkout) contains unencrypted feedback.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import weekly_lifecycle

ENDPOINT = 'https://cjcnjcblipqsyzxvlbus.supabase.co/functions/v1/weekly-sync'
AUDIENCE = 'weekly-intelligence-sync'


def request(url, headers, body=None):
    req = Request(url, headers=headers, data=json.dumps(body).encode() if body is not None else None)
    with urlopen(req, timeout=30) as response:
        return json.load(response)


def main():
    cache = os.environ.get('WEEKLY_CLOUD_STATE_PATH', '')
    url = os.environ.get('ACTIONS_ID_TOKEN_REQUEST_URL', '')
    credential = os.environ.get('ACTIONS_ID_TOKEN_REQUEST_TOKEN', '')
    if not cache or not url or not credential:
        print('Weekly cloud: OIDC unavailable; retain encrypted archive learning')
        return
    try:
        oidc_url = url + ('&' if '?' in url else '?') + urlencode({'audience': AUDIENCE})
        token = request(oidc_url, {'Authorization': 'Bearer ' + credential})['value']
        headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
        archive = weekly_lifecycle._decrypt_weekly_archive()
        # One-time migration is idempotent: field timestamps cannot replace newer cloud edits.
        items = list(archive.items())
        for start in range(0, len(items), 150):
            request(ENDPOINT, headers, {'state': dict(items[start:start + 150])})
        remote = request(ENDPOINT, headers).get('state') or {}
        path = Path(cache)
        if path.resolve().is_relative_to(weekly_lifecycle.ROOT.resolve()):
            raise ValueError('Cloud feedback cache must stay outside the public checkout')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(remote, ensure_ascii=False), encoding='utf-8')
        path.chmod(0o600)
        print(f'Weekly cloud: migrated archive and loaded {len(remote)} feedback records for learning')
    except Exception as error:
        # Do not log tokens, records or request contents, including exception text from servers.
        print(f'Weekly cloud temporarily unavailable ({type(error).__name__}); retain encrypted archive learning')


if __name__ == '__main__':
    main()
