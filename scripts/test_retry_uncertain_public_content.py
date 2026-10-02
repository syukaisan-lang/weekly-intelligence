import base64
import json
import sys
import tempfile
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import retry_uncertain_public_content as recheck
import weekly_lifecycle


def article(id_, name, dimension=0, **extra):
    raw = bytearray(384)
    raw[dimension] = 127
    return {'id': id_, 'title': name, 'summary': '実務の改善とデータの比較を説明します。' * 8,
            'url': f'https://example{id_}.org/article',
            'semantic_vector': {'dim': 384, 'q': base64.b64encode(raw).decode()}, **extra}


class RecheckTests(unittest.TestCase):
    def test_incremental_backup_rows_feed_server_learning(self):
        rows = [['picked-b', 'l', 'm', 200, 'h', 's', 190, 'w', 180, 175]]
        decoded = weekly_lifecycle._decode_delta_rows(rows)
        self.assertEqual(decoded['picked-b']['status'], 'later')
        self.assertEqual(decoded['picked-b']['feedback'], 'more')
        self.assertEqual(decoded['picked-b']['feedback_reason'], 'work_direct')
        self.assertEqual(decoded['picked-b']['later_interest_at'], 175)
        state = {'picked-b': {'status': 'new', 'updated_at': 100}}
        weekly_lifecycle._merge_state(state, decoded)
        self.assertEqual(state['picked-b']['updated_at'], 200)

    def test_only_backed_up_matching_feedback_changes_fetch_order(self):
        liked = article('old', '有用な方法')
        match = article('match', '新しい実務', 0)
        other = article('other', '別の実務', 1)
        state = {'old': {'later_interest_at': 100}}
        picked = recheck.select([other, liked, match], {'match', 'other'}, state)
        self.assertEqual([a['id'] for a in picked], ['match', 'other'])
        neutral = recheck.select([other, match], {'match', 'other'}, {})
        self.assertEqual({a['id'] for a in neutral}, {'match', 'other'})

    def test_negative_feedback_and_robots_or_paywall_do_not_force_fetch(self):
        disliked = article('negative', '不喜欢的内容')
        near = article('near', '相近内容')
        far = article('far', '其他内容', 1)
        picked = recheck.select([disliked, near, far], {'near', 'far'},
                                {'negative': {'feedback': 'less'}})
        self.assertEqual(picked[0]['id'], 'far')
        paid = article('paid', '会员正文', url='https://xtrend.nikkei.com/atcl/example')
        self.assertEqual(recheck.select([paid], {'paid'}, {}), [paid], 'public XTrend pages can be checked without login')
        with patch.object(recheck, 'robots_rules', return_value=False):
            self.assertFalse(recheck.robots_allow('example.org', 'https', 'https://example.org/private'))

    def test_retry_window_and_host_budget(self):
        today = datetime.now(timezone.utc).isoformat()
        self.assertEqual(recheck.select([article('recent', '最近重试', free_public_retry_at=today)],
                                        {'recent'}, {}), [])
        rows = [article(str(i), f'内容{i}', url=f'https://same.example.org/{i}') for i in range(recheck.MAX_PER_HOST+5)]
        self.assertEqual(len(recheck.select(rows, {a['id'] for a in rows}, {})), recheck.MAX_PER_HOST)

    def test_redirect_checks_destination_robots_before_second_request(self):
        calls = []

        def get(url, **_):
            calls.append(url)
            return types.SimpleNamespace(status_code=302, headers={'Location': 'https://blocked.example/private'})

        feeds = types.SimpleNamespace(requests=types.SimpleNamespace(get=get, RequestException=Exception))
        with patch.object(recheck, 'robots_allow', side_effect=lambda host, *_: host == 'open.example'):
            content, checked, error = recheck.fetch_public_text('https://open.example/article', feeds)
        self.assertEqual((content, checked, error), ('', False, 'robots_or_unavailable'))
        self.assertEqual(calls, ['https://open.example/article'])

    def test_temporary_failures_retry_before_seven_days(self):
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        failed = article('failure', '暂时失败', free_public_retry_status='unavailable',
                         free_public_retry_at=(now-timedelta(hours=8)).isoformat())
        self.assertTrue(recheck.due(failed, now))
        failed['free_public_retry_status'] = 'access_restricted'
        self.assertFalse(recheck.due(failed, now))
        failed['free_public_retry_next_at'] = (now+timedelta(hours=1)).isoformat()
        self.assertFalse(recheck.due(failed, now))

    def test_real_candidates_are_read_only_and_include_summary_gaps(self):
        row = article('gap', '生成AIを業務分析に活用', first_seen=datetime.now(timezone.utc).isoformat(),
                      content_checked=False, content_excerpt='')
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'articles.json'
            path.write_text(json.dumps({'articles': [row]}, ensure_ascii=False), encoding='utf-8')
            ids = recheck.candidate_ids(path)
        self.assertEqual(ids, {'gap'})

    def test_public_preview_keeps_paywall_marker(self):
        node = types.SimpleNamespace(get_text=lambda *_args, **_kwargs: '公開された本文。' * 40)
        class FakeSoup:
            def __call__(self, _): return []
            def select(self, _): return [node]
        response = types.SimpleNamespace(status_code=200, headers={'content-type':'text/html'},
                                         text='{"isAccessibleForFree":false}')
        feeds = types.SimpleNamespace(requests=types.SimpleNamespace(get=lambda *_args, **_kwargs:response, RequestException=Exception),
                                      BeautifulSoup=lambda *_args:FakeSoup(), clean=lambda x:x)
        with patch.object(recheck, 'robots_allow', return_value=True):
            text, checked, error = recheck.fetch_public_text('https://example.org/article', feeds)
        self.assertTrue(checked)
        self.assertEqual(error, 'paywall')


if __name__ == '__main__':
    unittest.main()
