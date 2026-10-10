import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sync_weekly_cloud as sync
import weekly_lifecycle


class CloudLearningTests(unittest.TestCase):
    def test_oidc_migrates_archive_to_private_cache_without_public_artifact(self):
        with tempfile.TemporaryDirectory() as folder:
            cache = Path(folder) / 'private.json'
            calls = []
            def request(url, headers, body=None):
                calls.append((url, headers, body))
                if 'token.example' in url:
                    return {'value': 'oidc-test-token'}
                return {'state': {'a': {'status': 'read', 'updated_at': 30, 'feedback': 'more'}}}
            env = {'WEEKLY_CLOUD_STATE_PATH': str(cache), 'ACTIONS_ID_TOKEN_REQUEST_URL': 'https://token.example?x=1', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN': 'test-request-token'}
            with patch.dict(os.environ, env), patch.object(sync, 'request', side_effect=request), patch.object(weekly_lifecycle, '_decrypt_weekly_archive', return_value={'a': {'status': 'later', 'updated_at': 10}}):
                sync.main()
                state = weekly_lifecycle.decrypt_weekly_state()
            self.assertEqual(state['a']['status'], 'read')
            self.assertEqual(state['a']['feedback'], 'more')
            self.assertIn('audience=weekly-intelligence-sync', calls[0][0])
            self.assertEqual(calls[1][2]['state']['a']['status'], 'later')
            self.assertEqual(cache.stat().st_mode & 0o777, 0o600)

    def test_cloud_cache_preserves_equal_time_merged_fields_and_archive_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            cache = Path(folder) / 'feedback.json'
            cache.write_text(json.dumps({'a': {'status': 'read', 'updated_at': 10, 'feedback': 'more'}}))
            with patch.dict(os.environ, {'WEEKLY_CLOUD_STATE_PATH': str(cache)}), patch.object(weekly_lifecycle, '_decrypt_weekly_archive', side_effect=lambda: {'a': {'status': 'later', 'updated_at': 10}, 'b': {'status': 'save', 'updated_at': 5}}):
                result = weekly_lifecycle.decrypt_weekly_state()
                self.assertEqual(result['a']['feedback'], 'more')
                self.assertEqual(result['b']['status'], 'save')
                cache.write_text('bad json')
                self.assertEqual(weekly_lifecycle.decrypt_weekly_state()['a']['status'], 'later')


if __name__ == '__main__':
    unittest.main()
