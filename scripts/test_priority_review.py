"""Offline review-contract tests; does not assert real model accuracy."""
import json
import unittest
from types import SimpleNamespace
import review_priority_content as review

class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.a = {'id': 'one', 'title': '新しい視点', 'summary': '', 'content_checked': True,
                  'content_excerpt': '価格の平均だけではなく、購買率の変化を比較して判断する。'}
        self.r = {'id': 'one', 'verdict': 'recommend', 'use': '比较定价', 'gain': '补充判断方法',
                  'reason': '', 'domain': '竞争分析', 'kind': 'method', 'confidence': 'medium',
                  'evidence': [self.a['content_excerpt']]}

    def test_real_evidence_required(self):
        self.assertTrue(review.valid_review(self.a, self.r))
        self.assertFalse(review.valid_review(self.a, {**self.r, 'evidence': ['没有提供但模型自己编造出来的一段所谓原文']}))

    def test_uncertainty_not_rejection(self):
        self.assertTrue(review.valid_review(self.a, {**self.r, 'verdict': 'uncertain', 'evidence': []}))
        self.assertFalse(review.valid_review(self.a, {**self.r, 'verdict': 'skip', 'evidence': []}))

    def test_missing_rows_fail_audit(self):
        client = SimpleNamespace(responses=SimpleNamespace(create=lambda **_: SimpleNamespace(output_text='{"reviews":[]}')))
        with self.assertRaises(ValueError):
            review.review_batch(client, 'configured-model', [self.a])

    def test_second_pass_can_recover_omission(self):
        seen = []
        def create(**args):
            seen.append(args['input'])
            return SimpleNamespace(output_text=json.dumps({'reviews': [self.r]}))
        client = SimpleNamespace(responses=SimpleNamespace(create=create))
        audited = review.review_batch(client, 'configured-model', [self.a], [{**self.r, 'verdict': 'skip'}])
        self.assertEqual(audited['one']['verdict'], 'recommend')
        self.assertIn('双向审核', seen[0])

    def test_failed_batch_isolates_single_bad_article(self):
        other = {**self.a, 'id': 'two', 'title': '別記事'}
        def create(**args):
            rows = json.loads(args['input'].split('文章：', 1)[1].split('\n待审核', 1)[0])
            return SimpleNamespace(output_text=json.dumps({'reviews': [self.r] if len(rows)>1 else
                [{**self.r, 'id': rows[0]['id']}] if rows[0]['id']=='one' else []}))
        client = SimpleNamespace(responses=SimpleNamespace(create=create))
        result, failed = review.review_with_fallback(client, 'configured-model', [self.a, other])
        self.assertEqual(set(result), {'one'})
        self.assertEqual(failed, ['two'])

if __name__ == '__main__':
    unittest.main()
