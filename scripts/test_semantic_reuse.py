"""In-process embedding cache must reuse unchanged source text, not stale changes."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path

import numpy as np


class FakeModel:
    def __init__(self):
        self.calls = 0
        self.texts = 0

    def encode(self, texts, **_):
        self.calls += 1
        self.texts += len(texts)
        values = np.zeros((len(texts), 384), dtype=np.float32)
        values[:, 0] = 1
        return values


class SemanticReuseTest(unittest.TestCase):
    def test_reuse_and_invalidate_on_body_change(self):
        fake = {
            'sentence_transformers': types.SimpleNamespace(SentenceTransformer=FakeModel),
            'build_system_model': types.SimpleNamespace(),
            'build_semantic_index': types.SimpleNamespace(
                ROOT=Path(__file__).resolve().parents[1], clean=lambda x: x,
                split_chunks=lambda x: [(0, x)]),
            'temporal_knowledge': types.SimpleNamespace(evidence_period=lambda _: None),
        }
        previous = {name: sys.modules.get(name) for name in fake}
        sys.modules.update(fake)
        try:
            source = Path(__file__).with_name('weekly_semantic_runtime.py')
            spec = importlib.util.spec_from_file_location('weekly_semantic_runtime_reuse_test', source)
            module = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = module
            spec.loader.exec_module(module)
            matcher = object.__new__(module.SemanticMatcher)
            matcher._article_cache = {}
            matcher.model = FakeModel()
            matcher.matrix = np.zeros((1, 384), dtype=np.float32)
            matcher.matrix[0, 0] = 1
            matcher.kinds = np.array(['rule'])
            matcher.ids = np.array(['rule-1'])
            matcher.entries = [{'kind': 'rule'}]
            rows = [{'id': 'first', 'title': 'EC分析', 'summary': '測定結果', 'content_excerpt': ''},
                    {'id': 'second', 'title': '顧客分析', 'summary': '運用方法', 'content_excerpt': ''}]
            matcher.analyze(rows)
            self.assertEqual(matcher.model.texts, 2)
            matcher.analyze(rows)
            self.assertEqual(matcher.model.calls, 1)
            rows[0]['content_excerpt'] = '追加の公開正文'
            matcher.analyze(rows)
            self.assertEqual(matcher.model.texts, 3)
        finally:
            for name, value in previous.items():
                if value is None:
                    sys.modules.pop(name, None)
                else:
                    sys.modules[name] = value
            sys.modules.pop('weekly_semantic_runtime_reuse_test', None)


if __name__ == '__main__':
    unittest.main()
