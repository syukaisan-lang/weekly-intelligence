#!/usr/bin/env python3
"""Higher-quality deterministic consolidation for My Work System.

This layer keeps the encrypted/private architecture intact while improving the
non-LLM fallback: career intent reclassification, low-value candidate removal,
near-duplicate merging, evidence aggregation, and content-specific invocation
contexts. Generic filler is deliberately removed when the source does not
support a useful scenario/question.
"""
from __future__ import annotations

import re
from collections import defaultdict

import build_system_model as base

CAREER_RE = re.compile(
    r"転職|转职|换工作|跳槽|キャリア|職業|职业|職務経歴|職歴|面接|面談|オファー|offer|求人|年収|給与|待遇|退職|入社|志望動機|職種|雇用",
    re.I,
)
LOW_VALUE_RE = re.compile(r"^(その他|まとめ|メモ|memo|参考|参考資料|未分類|general|マーケティング|marketing)$", re.I)
GENERIC_WHEN = {
    '遇到与该规则同类的问题时，先核对前提条件。',
    '同类问题发生时先核对前提。',
}

# Ordered from specific to broad. These are invocation aids, not new claims:
# they only describe when/how to examine a rule whose own text already matches
# the topic. If nothing specific matches, we show no filler at all.
CONTEXTS = [
    (r'年収|給与|待遇|報酬|salary|compensation|オファー|offer',
     '比较工作机会、年收待遇或是否接受 Offer 时。',
     ['除了年收，职责范围、裁量、工作方式和成长空间分别差多少？',
      '比较条件是否统一到总年收、固定/浮动部分、加班和福利，而不是只看一个数字？',
      '高出的报酬是在补偿什么风险或不确定性？']),
    (r'面接|面談|志望動機|職務経歴|職歴|interview',
     '准备面试、整理职业经历或说明转职理由时。',
     ['这次要证明的核心能力是什么，过去哪一个结果最能作为证据？',
      '经历是否能用“背景→判断→行动→结果”讲清，而不是只罗列职责？',
      '对方真正担心的风险是什么，我的回答有没有消除这个风险？']),
    (r'退職|離職|辞職|辞め|离职|離職',
     '判断离职时点、离职方式或交接安排时。',
     ['离职决定来自短期情绪，还是结构性问题已经持续存在？',
      '奖金、带薪假、住民税、社保和交接时点是否都计算清楚？',
      '怎样退出才能减少对关系和后续职业信誉的损耗？']),
    (r'入社|入職|オンボーディング|onboarding|入职',
     '刚入职、接手新职责或需要快速建立内部信用时。',
     ['前30～90天最需要理解的业务机制和关键关系人是谁？',
      '哪些判断现在只是外部视角的假设，必须先验证再行动？',
      '最小的 early win 是什么，既能产生结果又能建立信任？']),
    (r'転職|转职|换工作|跳槽|キャリア|职业|職業',
     '评估是否转职、选择职业方向或重新定义下一阶段目标时。',
     ['这次真正想改变的是什么：工作内容、裁量、年收、工作方式还是成长？',
      '新机会解决了旧工作的什么结构性问题，又新增了什么风险？',
      '这个选择是否扩大未来选项，而不只是改善眼前条件？']),

    (r'議事録|録音|文字起こし|meeting|会議',
     '评估 AI/自动化是否适合会议记录、录音整理或信息回收流程时。',
     ['真正耗时的是记录、整理、确认，还是后续分发与执行？',
      '哪些内容错误成本高，必须保留人工确认？',
      '导入后应该比较的是总处理时间还是单一步骤速度？']),
    (r'自動化|自动化|効率|workflow|業務効率|工数',
     '考虑把 AI 或自动化导入具体业务流程、并判断是否真的提效时。',
     ['当前流程最耗时、最重复、最容易出错的是哪一步？',
      'AI 输出需要多少人工复核，复核成本有没有抵消节省的时间？',
      '成功标准是缩短时间、降低错误、增加产出，还是提高判断质量？']),
    (r'生成AI|\bAI\b|LLM|agent|エージェント',
     '判断 AI 是否应该进入一个工作判断、产品功能或用户流程时。',
     ['这里需要的是生成、检索、判断辅助还是自动执行？',
      '错误一次的业务成本有多大，哪些节点不能完全自动化？',
      'AI 改变的是内部效率，还是用户行为与价值本身？']),

    (r'検索|検索順位|keyword|キーワード|seo|自然検索',
     'Amazon/EC 的搜索流量、关键词排名或自然流量出现问题时。',
     ['目标关键词的搜索需求、当前排名和点击率分别发生了什么？',
      '流量问题来自没有曝光、没有点击，还是点击后不转化？',
      '标题、关键词、广告和销售速度中，当前最可能限制排名的是哪一项？']),
    (r'セール|クーポン|値引|割引|sale|promotion|キャンペーン',
     '设计促销、参加大促或评估折扣活动是否值得继续时。',
     ['这次动作主要想增加流量还是提高 CVR？',
      '增量销量扣除折扣、广告和平台成本后是否仍然有意义？',
      '活动结束后销量是否回落，还是留下了排名、评价或新客资产？']),
    (r'在庫|欠品|库存|stock|inventory',
     '库存、缺货或补货节奏可能限制销售时。',
     ['损失来自真实需求不足，还是库存不足导致无法成交？',
      '补货周期和安全库存是否覆盖促销与自然增长的波动？',
      '库存决策有没有同时考虑现金占用和缺货损失？']),
    (r'レビュー|review|口コミ|评价|評価',
     '评价、评论数量或口碑可能影响 EC 转化时。',
     ['问题是评价数量不足、星级不足，还是评论内容暴露了产品问题？',
      '评价变化和 CVR/退货率是否同步？',
      '应该优先增加评价覆盖，还是先修复导致差评的产品/体验问题？']),
    (r'CVR|コンバージョン|conversion|転換|转化',
     '流量已经存在，但 EC/Amazon 成交效率下降或不足时。',
     ['进入详情页的人群质量有没有变化？',
      '价格、库存、评价、页面表达和竞争条件中，哪一项同期发生了变化？',
      '当前 CVR 是绝对下降，还是因为流量结构扩大后自然稀释？']),
    (r'アクセス|traffic|流量|セッション|session',
     'EC/Amazon 销售变化需要先判断是不是流量问题时。',
     ['站内搜索、广告、活动和站外流量分别变化多少？',
      '新增/减少的是高意向流量还是低意向流量？',
      '流量变化能否解释销量变化，还是 CVR/客单也同时变化？']),

    (r'CEP|想起|メンタルアベイラビリティ|mental availability',
     '品牌增长问题涉及“消费者在什么场景会想起你”时。',
     ['目标消费者在哪些购买/使用情境下进入这个品类？',
      '品牌目前覆盖了多少重要 CEP，还是只占据一个狭窄场景？',
      '传播内容是在增加新的想起入口，还是重复强化已有用户认知？']),
    (r'浸透|penetration|Double Jeopardy|ダブルジョパディ',
     '判断品牌增长应优先拉新还是提高忠诚/复购时。',
     ['当前增长瓶颈首先是购买人数不足，还是购买频率不足？',
      '小品牌的低复购是否只是渗透率低的伴随现象？',
      '动作能扩大买家基础，还是只在现有重度用户中优化？']),
    (r'ロイヤ|repeat|リピート|復購|复购|継続',
     '评估复购、忠诚或存量用户策略时。',
     ['复购变化是否先控制了新客结构和观察周期？',
      '高频购买者之后回归平均的影响有没有被误判成流失？',
      '提高复购的投入是否挤占了更有增量价值的拉新机会？']),

    (r'ポジショニング|positioning|差別|差异化|代替',
     '需要定义产品/品牌在市场中的位置和差异时。',
     ['用户现在用什么替代方案解决同一个问题？',
      '差异点对最佳目标客户是否真的有价值，而不只是内部认为独特？',
      '选择的市场语境是否能让差异变得容易理解和比较？']),
    (r'競合|竞争|competitor',
     '进行竞争分析或决定应该跟谁比较时。',
     ['竞争对手是功能相似者，还是争夺同一购买情境/预算的替代方案？',
      '比较是否先找共同点，再判断真正影响购买的差异？',
      '竞品变化会影响市场总需求，还是只改变份额分配？']),
    (r'参入|GTM|市場規模|市场规模|成長率|成長市場',
     '评估新市场、GTM 或是否值得投入一个机会时。',
     ['市场规模、增长、竞争强度、自身能力和协同分别怎样？',
      '为什么是现在进入，而不是更早或更晚？',
      '最小可验证切入口是什么，什么结果会让我们继续加码？']),

    (r'新商品|新製品|新品|ローンチ|launch|発売',
     '新品上市、首发资源配置或判断 launch 节奏时。',
     ['品牌认知高低与品类成熟度分别是什么状态？',
      '首发期最需要验证的是需求、转化、渠道还是复购？',
      '有限预算应该集中在哪个能形成后续累积效应的入口？']),
    (r'価格|値上|値下|pricing|定价|价格',
     '定价、涨价、降价或判断价格促销影响时。',
     ['价格变化影响的是转化率、购买人数还是客单与利润？',
      '当前观察有没有混入促销、渠道或产品结构变化？',
      '短期销量弹性与长期品牌/利润影响是否需要分开判断？']),

    (r'ROAS|ROI|広告効率|投放效率',
     '广告效率指标变化、需要判断是否削减或增加投入时。',
     ['ROAS 变化来自 CPC、CVR、客单还是归因口径？',
      '广告是否同时影响品牌搜索、自然流量或后续销售，而不仅是当期归因？',
      '目标是最大化广告 ROI，还是最大化整体业务增长？']),
    (r'PR|メディア|media|媒体',
     '规划 PR、媒体露出或评估内容合作的业务价值时。',
     ['媒体的任务是建立认知、增加想起、获取流量还是促成购买？',
      '这次露出能否留下可累积的搜索、内容或关系资产？',
      '效果应该用即时销量看，还是需要更长的观察窗口？']),
    (r'TikTok|SNS|UGC|social|ソーシャル',
     '社交媒体、UGC 或内容平台需要承担增长任务时。',
     ['内容是在创造触达、形成兴趣，还是承接已经存在的需求？',
      '平台上的互动指标和实际业务指标之间有什么可验证关系？',
      '成功内容能否复用为稳定机制，而不只是一次爆发？']),

    (r'比較|比较|同条件|条件を揃|benchmark',
     '比较不同时间、渠道、方案或实验结果时。',
     ['比较对象是否处在相同促销、库存、流量和时间条件？',
      '差异来自真正的变量，还是基准选择不同？',
      '需要看绝对值、同比/环比，还是同组相对表现？']),
    (r'KPI|KGI|パラメータ|参数|指標|指标',
     '把业务问题拆成指标、寻找真正驱动结果的参数时。',
     ['最终业务结果是什么，能够拆成哪几个可观察参数？',
      '哪些是领先指标，哪些只是结果指标？',
      '这个指标发生变化时，是否真的能指导下一步行动？']),

    (r'依頼|委譲|任せ|delegat|分工',
     '把任务交给成员、跨团队协作或需要明确交付标准时。',
     ['目标、截止时间、判断基准和最终交付物是否都说清楚？',
      '对方缺的是信息、权限、能力还是优先级？',
      '任务完成后由谁 review，什么状态才算真正结束？']),
    (r'交渉|stakeholder|関係者|ベンダー|partner|協業',
     '涉及多个利益相关方、外部伙伴或需要谈判协调时。',
     ['每一方真正的目标、约束和不能接受的条件是什么？',
      '有没有所有参与者都能受益的共同点？',
      '决策权、执行权和信息同步责任分别在谁手里？']),
    (r'レビュー|review|振り返|复盘|振返',
     '项目或动作执行后需要复盘，并决定是否沉淀成方法时。',
     ['实际结果和当初假设差在哪里？',
      '成功/失败来自方法本身，还是条件变化与执行偏差？',
      '这次经验能成为规则，还是只能作为一个特定案例？']),
    (r'チーム|メンバー|部下|上司|マネジメント|团队|成员|管理',
     '管理成员、建立团队协作方式或处理上下级关系时。',
     ['目标和评价标准是否让成员自己也能判断优先级？',
      '问题来自能力、动机、信息不足还是角色边界不清？',
      '我是在替成员解决问题，还是帮助他们形成自己的判断能力？']),
]

_CONTEXTS = [(re.compile(p, re.I), when, qs) for p, when, qs in CONTEXTS]
_ORIGINAL_ENRICH = base.enrich_deterministic


def norm(s: str) -> str:
    return re.sub(r"[^0-9a-z一-龥ぁ-んァ-ヶ]+", "", (s or "").lower())


def grams(text: str, n: int = 3) -> set[str]:
    s = norm(text)
    if len(s) < n:
        return {s} if s else set()
    return {s[i:i+n] for i in range(len(s)-n+1)}


def near_duplicate(a: dict, b: dict) -> bool:
    ta = str(a.get('title') or '')
    tb = str(b.get('title') or '')
    if norm(ta) and norm(ta) == norm(tb):
        return True
    aa = grams(ta + ' ' + str(a.get('detail') or ''))
    bb = grams(tb + ' ' + str(b.get('detail') or ''))
    if not aa or not bb:
        return False
    inter = len(aa & bb)
    union = len(aa | bb)
    if not union:
        return False
    j = inter / union
    contain = inter / min(len(aa), len(bb))
    return j >= 0.72 or (contain >= 0.86 and inter >= 8)


def candidate_domain(c: dict) -> str:
    text = f"{c.get('title','')} {c.get('detail','')}"
    if CAREER_RE.search(text):
        return '职业 / 转职 / Career'
    return ((c.get('domains') or [{}])[0].get('name') or '其他')


def useful(c: dict) -> bool:
    title = str(c.get('title') or '').strip()
    detail = str(c.get('detail') or '').strip()
    if len(title) < 4 or len(detail) < 8:
        return False
    if LOW_VALUE_RE.match(title):
        return False
    if norm(title) == norm(detail) and len(title) < 18:
        return False
    return True


def normalized_base_rules_v2(work: dict) -> list[dict]:
    rules = work.get('rules') or []
    if rules:
        out = []
        for r in rules[:100]:
            x = dict(r)
            if CAREER_RE.search(base.rule_text(x)):
                x['domain'] = '职业 / 转职 / Career'
            out.append(x)
        return out

    candidates = [dict(c) for c in (work.get('candidate_principles') or []) if useful(c)]
    by_domain: dict[str, list[dict]] = defaultdict(list)
    for c in candidates:
        by_domain[candidate_domain(c)].append(c)

    merged: list[dict] = []
    for domain, rows in by_domain.items():
        clusters: list[dict] = []
        for c in rows:
            hit = None
            for cluster in clusters:
                if near_duplicate(cluster['rep'], c):
                    hit = cluster
                    break
            if hit is None:
                clusters.append({'rep': c, 'evidence_ids': list(c.get('evidence_ids') or []), 'source_kinds': list(c.get('source_kinds') or [])})
                continue
            hit['evidence_ids'].extend(c.get('evidence_ids') or [])
            hit['source_kinds'].extend(c.get('source_kinds') or [])
            if len(str(c.get('detail') or '')) > len(str(hit['rep'].get('detail') or '')):
                hit['rep'] = c

        for cluster in clusters:
            c = cluster['rep']
            merged.append({
                'id': c.get('id'),
                'title': c.get('title'),
                'principle': c.get('detail'),
                'when': '',
                'steps': [],
                'metrics': [],
                'traps': [],
                'tensions': [],
                'domain': domain,
                'evidence_ids': list(dict.fromkeys(cluster['evidence_ids']))[:12],
                'confidence': 'low',
            })

    merged.sort(key=lambda r: (r['domain'] == '其他', r['domain'], str(r.get('title') or '')))
    non_other = [r for r in merged if r['domain'] != '其他']
    other = [r for r in merged if r['domain'] == '其他'][:45]
    return (non_other + other)[:180]


def contextualize(rule: dict) -> dict:
    text = base.rule_text(rule)
    for pattern, when, questions in _CONTEXTS:
        if pattern.search(text):
            rule['when'] = when
            rule['questions'] = questions
            rule['context_quality'] = 'topic_specific'
            return rule

    # Do not fabricate a generic scenario/questions just to fill the card.
    if str(rule.get('when') or '').strip() in GENERIC_WHEN:
        rule['when'] = ''
    generic = base.GENERIC_QUESTIONS.get(rule.get('domain')) or base.GENERIC_QUESTIONS.get('判断与问题定义') or []
    if list(rule.get('questions') or []) == list(generic):
        rule['questions'] = []
    rule['context_quality'] = 'source_only'
    return rule


def enrich_deterministic_v2(work: dict, know: dict) -> list[dict]:
    rows = _ORIGINAL_ENRICH(work, know)
    return [contextualize(dict(r)) for r in rows]


base.normalized_base_rules = normalized_base_rules_v2
base.enrich_deterministic = enrich_deterministic_v2

if __name__ == '__main__':
    raise SystemExit(base.main())
