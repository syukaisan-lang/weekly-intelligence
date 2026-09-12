import base64
import sys
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import retry_uncertain_public_content as recheck


def article(id_, name, dimension=0, **extra):
    raw = bytearray(384)
    raw[dimension] = 127
    return {'id': id_, 'title': name, 'summary': '実務の改善とデータの比較を説明します。' * 8,
            'url': f'https://example{id_}.org/article',
            'semantic_vector': {'dim': 384, 'q': base64.b64encode(raw).decode()}, **extra}


class RecheckTests(unittest.TestCase):
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
        self.assertEqual(recheck.select([paid], {'paid'}, {}), [])
        with patch.object(recheck, 'robots_rules', return_value=False):
            self.assertFalse(recheck.robots_allow('example.org', 'https', 'https://example.org/private'))

    def test_retry_window_and_host_budget(self):
        today = datetime.now(timezone.utc).isoformat()
        self.assertEqual(recheck.select([article('recent', '最近重试', free_public_retry_at=today)],
                                        {'recent'}, {}), [])
        rows = [article(str(i), f'内容{i}', url=f'https://same.example.org/{i}') for i in range(12)]
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

    def test_real_candidates_are_read_only_and_include_summary_gaps(self):
        ids = recheck.candidate_ids()
        self.assertIsInstance(ids, set)
        self.assertGreater(len(ids), 0)


if __name__ == '__main__':
    unittest.main()
