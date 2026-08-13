from __future__ import annotations

import re
from collections import defaultdict

TAXONOMY_VERSION = 3

DOMAINS = [
    {'id':'career','name':'职业 / 转职 / Career','priority':7.0,'patterns':[r'転職|转职|換仕事|换工作|跳槽|キャリア|職務経歴|職歴|面接|面談|オファー|offer|求人|年収|給与|待遇|退職|入社|志望動機|職種|採用|雇用']},
    {'id':'ec','name':'EC / Amazon / 流通','priority':6.8,'patterns':[r'Amazon|楽天|EC|eコマース|モール|検索順位|検索|キーワード|レビュー|セール|クーポン|在庫|出荷|CVR|コンバージョン|商品ページ|カート|buy box|FBA|アクセス|セッション']},
    {'id':'ai','name':'AI / 工作效率','priority':6.6,'patterns':[r'生成AI|\bAI\b|LLM|agent|エージェント|自動化|自动化|業務効率|工数|録音|議事録|文字起こし']},
    {'id':'product','name':'商品 / 新品上市','priority':6.4,'patterns':[r'新商品|新製品|新品|商品開発|ローンチ|launch|発売|SKU|価格|値上|値下|pricing|定价|定価']},
    {'id':'media','name':'广告 / PR / 内容','priority':6.2,'patterns':[r'広告|广告|PR|メディア|媒体|SNS|TikTok|UGC|プロモーション|キャンペーン|ROAS|広告効率|リーチ|クリエイティブ|DSP|P.MAX|P-MAX']},
    {'id':'consumer','name':'消费者 / 品牌 / CEP','priority':6.1,'patterns':[r'消費者|消费者|生活者|顧客|購買|買い手|想起|CEP|ブランド|brand|浸透|penetration|ロイヤ|repeat|リピート|パーセプション|mental availability|Double Jeopardy']},
    {'id':'market','name':'市场 / GTM / Positioning','priority':6.0,'patterns':[r'市場|市场|GTM|ポジショニング|positioning|代替|競合|竞争|差別|差异化|サブカテゴリー|参入|市場規模|成長率|トレンド']},
    {'id':'management','name':'执行 / 管理 / Stakeholder','priority':5.8,'patterns':[r'マネジメント|管理|上司|部下|メンバー|成员|チーム|团队|依頼|委譲|任せ|共有|レビュー|振り返|交渉|stakeholder|関係者|ベンダー|パートナー|協業|締め切り|担当|実行|進捗|プロジェクト']},
    {'id':'data','name':'数据 / KPI / 测量','priority':5.6,'patterns':[r'データ|数据|分析|KPI|KGI|指標|指标|測定|数字|予測|記録|パラメータ|ROI|回帰|実験|ABテスト|A/B|比較対象|同条件']},
    {'id':'customer','name':'客户服务 / 体验','priority':5.5,'patterns':[r'カスタマー|客服|問い合わせ|返品|交換|評価|体験|CX|離脱|退货|サポート|NPS|VOC']},
    {'id':'overseas','name':'海外 / 渠道扩张','priority':5.4,'patterns':[r'海外|中国|米国|美国|グローバル|global|越境|跨境|出海|海外販路']},
    {'id':'decision','name':'判断与问题定义','priority':3.6,'patterns':[r'目的|違和感|判断|根拠|先入観|比較|情報源|課題|仮説|意思決定|優先順位|前提|条件|問題定義']},
]

TASKS = [
    {'id':'career.offer','label':'Offer比较 / 待遇','domain':'career','priority':12,'patterns':[r'オファー|offer|年収|給与|待遇|報酬|salary|compensation'],
     'when':'比较工作机会、年收待遇或是否接受 Offer 时。','questions':['除了年收，职责范围、裁量、工作方式和成长空间分别差多少？','比较条件是否统一到总年收、固定/浮动部分、加班和福利？','高出的报酬是在补偿什么风险或不确定性？']},
    {'id':'career.interview','label':'面试 / 职历表达','domain':'career','priority':12,'patterns':[r'面接|面談|志望動機|職務経歴|職歴|interview'],
     'when':'准备面试、整理职业经历或说明转职理由时。','questions':['这次要证明的核心能力是什么，过去哪一个结果最能作为证据？','经历是否能用“背景→判断→行动→结果”讲清，而不是只罗列职责？','对方真正担心的风险是什么，我的回答有没有消除它？']},
    {'id':'career.onboarding','label':'入职 / Onboarding','domain':'career','priority':11,'patterns':[r'入社|入職|onboarding|オンボーディング|入职|early win'],
     'when':'刚入职、接手新职责或需要快速建立内部信用时。','questions':['前30～90天最需要理解的业务机制和关键关系人是谁？','哪些判断目前只是外部视角的假设，必须先验证？','最小的 early win 是什么，既能产生结果又能建立信任？']},
    {'id':'career.resign','label':'离职 / 交接','domain':'career','priority':11,'patterns':[r'退職|離職|辞職|辞め|离职|有給|引継'],
     'when':'判断离职时点、离职方式或交接安排时。','questions':['离职决定来自短期情绪，还是结构性问题已经持续存在？','奖金、带薪假、税社保和交接时点是否计算清楚？','怎样退出才能减少对关系和后续职业信誉的损耗？']},
    {'id':'career.direction','label':'转职 / 职业选择','domain':'career','priority':9,'patterns':[r'転職|转职|换工作|跳槽|キャリア|职业|職業'],
     'when':'评估是否转职、选择职业方向或重新定义下一阶段目标时。','questions':['这次真正想改变的是什么：工作内容、裁量、年收、工作方式还是成长？','新机会解决了旧工作的什么结构性问题，又新增了什么风险？','这个选择是否扩大未来选项，而不只是改善眼前条件？']},

    {'id':'ec.search','label':'Amazon搜索 / 流量','domain':'ec','priority':12,'patterns':[r'検索順位|検索|キーワード|keyword|SEO|自然検索|検索流入'],
     'when':'Amazon/EC 的搜索流量、关键词排名或自然流量出现问题时。','questions':['目标关键词的搜索需求、当前排名和点击率分别发生了什么？','问题是没有曝光、没有点击，还是点击后不转化？','标题、关键词、广告和销售速度中，当前最可能限制排名的是哪一项？']},
    {'id':'ec.conversion','label':'EC转化 / CVR','domain':'ec','priority':12,'patterns':[r'CVR|コンバージョン|conversion|転換|转化|商品ページ|detail page'],
     'when':'流量已经存在，但 EC/Amazon 成交效率下降或不足时。','questions':['进入详情页的人群质量有没有变化？','价格、库存、评价、页面表达和竞争条件中哪一项同期变化？','CVR 是绝对下降，还是流量结构变化后的自然稀释？']},
    {'id':'ec.promo','label':'促销 / 大促','domain':'ec','priority':11,'patterns':[r'セール|クーポン|値引|割引|sale|promotion|タイムセール|大促'],
     'when':'设计促销、参加大促或评估折扣活动是否值得继续时。','questions':['这次动作主要想增加流量还是提高 CVR？','增量销量扣除折扣、广告和平台成本后是否仍然有意义？','活动结束后留下了排名、评价或新客资产吗？']},
    {'id':'ec.inventory','label':'库存 / 缺货','domain':'ec','priority':11,'patterns':[r'在庫|欠品|inventory|stock|库存|補充|補貨'],
     'when':'库存、缺货或补货节奏可能限制销售时。','questions':['损失来自真实需求不足，还是库存不足导致无法成交？','补货周期和安全库存是否覆盖促销与自然增长波动？','库存决策有没有同时考虑现金占用和缺货损失？']},
    {'id':'ec.review','label':'评价 / Review','domain':'ec','priority':10,'patterns':[r'レビュー|review|口コミ|评价|評価|星'],
     'when':'评价、评论数量或口碑可能影响 EC 转化时。','questions':['问题是评价数量不足、星级不足，还是评论内容暴露了产品问题？','评价变化和 CVR/退货率是否同步？','应该优先增加评价覆盖，还是先修复导致差评的产品/体验问题？']},
    {'id':'ec.traffic','label':'EC流量结构','domain':'ec','priority':9,'patterns':[r'アクセス|traffic|流量|セッション|session|流入'],
     'when':'EC/Amazon 销售变化需要先判断是不是流量问题时。','questions':['站内搜索、广告、活动和站外流量分别变化多少？','新增或减少的是高意向流量还是低意向流量？','流量变化能否解释销量变化，还是 CVR/客单也同时变化？']},

    {'id':'brand.cep','label':'CEP / 品牌想起','domain':'consumer','priority':12,'patterns':[r'CEP|想起|mental availability|メンタルアベイラビリティ'],
     'when':'品牌增长问题涉及“消费者在什么场景会想起你”时。','questions':['目标消费者在哪些购买/使用情境下进入这个品类？','品牌目前覆盖了多少重要 CEP，还是只占据一个狭窄场景？','传播内容是在增加新的想起入口，还是重复强化已有认知？']},
    {'id':'brand.penetration','label':'渗透 / 拉新 / 复购','domain':'consumer','priority':11,'patterns':[r'浸透|penetration|Double Jeopardy|ダブルジョパディ|ロイヤ|repeat|リピート|復購|复购'],
     'when':'判断品牌增长应优先扩大购买人数，还是提高复购/忠诚时。','questions':['当前增长瓶颈首先是购买人数不足，还是购买频率不足？','小品牌的低复购是否只是低渗透率的伴随现象？','动作能扩大买家基础，还是只在现有重度用户中优化？']},
    {'id':'brand.research','label':'消费者研究','domain':'consumer','priority':10,'patterns':[r'消費者調査|消费者研究|生活者研究|インタビュー|アンケート|購買行動|行動データ|定性|定量'],
     'when':'需要理解消费者行为、验证需求或解释购买原因时。','questions':['现在需要回答的是“发生了什么”“为什么发生”还是“怎样改变”？','证据来自口头态度、实际行为还是实验结果？','样本和观察场景是否代表真正目标人群与购买情境？']},

    {'id':'market.positioning','label':'Positioning / 差异化','domain':'market','priority':12,'patterns':[r'ポジショニング|positioning|差別|差异化|代替'],
     'when':'需要定义产品/品牌在市场中的位置和差异时。','questions':['用户现在用什么替代方案解决同一个问题？','差异点对最佳目标客户是否真的有价值，而不只是内部认为独特？','选择的市场语境是否能让差异变得容易理解和比较？']},
    {'id':'market.competitor','label':'竞争分析','domain':'market','priority':11,'patterns':[r'競合|竞争|competitor|競争相手'],
     'when':'进行竞争分析或决定应该跟谁比较时。','questions':['竞争对手是功能相似者，还是争夺同一购买情境/预算的替代方案？','比较是否先找共同点，再判断真正影响购买的差异？','竞品变化会影响市场总需求，还是只改变份额分配？']},
    {'id':'market.gtm','label':'市场进入 / GTM','domain':'market','priority':11,'patterns':[r'参入|GTM|市場規模|市场规模|成長率|成長市場|新市場'],
     'when':'评估新市场、GTM 或是否值得投入一个机会时。','questions':['市场规模、增长、竞争强度、自身能力和协同分别怎样？','为什么是现在进入，而不是更早或更晚？','最小可验证切入口是什么，什么结果会让我们继续加码？']},

    {'id':'product.launch','label':'新品 Launch','domain':'product','priority':12,'patterns':[r'新商品|新製品|新品|ローンチ|launch|発売'],
     'when':'新品上市、首发资源配置或判断 launch 节奏时。','questions':['品牌认知高低与品类成熟度分别是什么状态？','首发期最需要验证的是需求、转化、渠道还是复购？','有限预算应该集中在哪个能形成后续累积效应的入口？']},
    {'id':'product.pricing','label':'定价 / 价格弹性','domain':'product','priority':11,'patterns':[r'価格|値上|値下|pricing|定价|价格|価格弾力'],
     'when':'定价、涨价、降价或判断价格促销影响时。','questions':['价格变化影响的是转化率、购买人数还是客单与利润？','当前观察有没有混入促销、渠道或产品结构变化？','短期销量弹性与长期品牌/利润影响是否需要分开判断？']},

    {'id':'media.efficiency','label':'广告效率 / ROAS','domain':'media','priority':12,'patterns':[r'ROAS|ROI|広告効率|投放效率|CPC|CPA|広告費'],
     'when':'广告效率指标变化，需要判断是否削减或增加投入时。','questions':['ROAS 变化来自 CPC、CVR、客单还是归因口径？','广告是否同时影响品牌搜索、自然流量或后续销售，而不仅是当期归因？','目标是最大化广告 ROI，还是最大化整体业务增长？']},
    {'id':'media.pr','label':'PR / 媒体露出','domain':'media','priority':10,'patterns':[r'\bPR\b|メディア|media|媒体|記事広告|露出|パブリシティ'],
     'when':'规划 PR、媒体露出或评估内容合作的业务价值时。','questions':['媒体任务是建立认知、增加想起、获取流量还是促成购买？','这次露出能否留下可累积的搜索、内容或关系资产？','效果应该看即时销量，还是需要更长观察窗口？']},

    {'id':'data.compare','label':'同条件比较 / 实验','domain':'data','priority':11,'patterns':[r'比較|比较|同条件|条件を揃|benchmark|ABテスト|A/B|実験'],
     'when':'比较不同时间、渠道、方案或实验结果时。','questions':['比较对象是否处在相同促销、库存、流量和时间条件？','差异来自真正变量，还是基准选择不同？','需要看绝对值、同比/环比，还是同组相对表现？']},
    {'id':'data.kpi','label':'KPI拆解 / 参数','domain':'data','priority':10,'patterns':[r'KPI|KGI|パラメータ|参数|指標|指标|分解|因数'],
     'when':'把业务问题拆成指标、寻找真正驱动结果的参数时。','questions':['最终业务结果是什么，能够拆成哪几个可观察参数？','哪些是领先指标，哪些只是结果指标？','这个指标变化时，是否真的能指导下一步行动？']},

    {'id':'management.delegate','label':'委派 / 交付标准','domain':'management','priority':11,'patterns':[r'依頼|委譲|任せ|delegat|分工|依赖'],
     'when':'把任务交给成员、跨团队协作或需要明确交付标准时。','questions':['目标、截止时间、判断基准和最终交付物是否都说清楚？','对方缺的是信息、权限、能力还是优先级？','任务完成后由谁 review，什么状态才算真正结束？']},
    {'id':'management.stakeholder','label':'Stakeholder / 谈判','domain':'management','priority':11,'patterns':[r'交渉|stakeholder|関係者|ベンダー|partner|パートナー|協業'],
     'when':'涉及多个利益相关方、外部伙伴或需要谈判协调时。','questions':['每一方真正的目标、约束和不能接受的条件是什么？','有没有所有参与者都能受益的共同点？','决策权、执行权和信息同步责任分别在谁手里？']},
    {'id':'management.review','label':'复盘 / Review','domain':'management','priority':10,'patterns':[r'レビュー|review|振り返|复盘|振返'],
     'when':'项目或动作执行后需要复盘，并决定是否沉淀成方法时。','questions':['实际结果和当初假设差在哪里？','成功或失败来自方法本身，还是条件变化与执行偏差？','这次经验能成为规则，还是只能作为一个特定案例？']},
    {'id':'management.team','label':'团队管理','domain':'management','priority':9,'patterns':[r'チーム|メンバー|部下|上司|マネジメント|团队|成员|管理'],
     'when':'管理成员、建立团队协作方式或处理上下级关系时。','questions':['目标和评价标准是否让成员自己也能判断优先级？','问题来自能力、动机、信息不足还是角色边界不清？','我是在替成员解决问题，还是帮助他们形成自己的判断能力？']},

    {'id':'ai.meeting','label':'会议记录 AI','domain':'ai','priority':12,'patterns':[r'議事録|録音|文字起こし|meeting|会議'],
     'when':'评估 AI/自动化是否适合会议记录、录音整理或信息回收流程时。','questions':['真正耗时的是记录、整理、确认，还是后续分发与执行？','哪些内容错误成本高，必须保留人工确认？','导入后应该比较的是总处理时间还是单一步骤速度？']},
    {'id':'ai.workflow','label':'AI自动化 / 提效','domain':'ai','priority':11,'patterns':[r'自動化|自动化|効率|workflow|業務効率|工数|生成AI|\bAI\b|LLM|agent|エージェント'],
     'when':'考虑把 AI 或自动化导入具体业务流程，并判断是否真的提效时。','questions':['当前流程最耗时、最重复、最容易出错的是哪一步？','AI 输出需要多少人工复核，复核成本有没有抵消节省的时间？','成功标准是缩短时间、降低错误、增加产出，还是提高判断质量？']},

    {'id':'customer.cx','label':'客户体验 / CX','domain':'customer','priority':10,'patterns':[r'CX|カスタマー|客服|問い合わせ|返品|退货|サポート|NPS|VOC|離脱'],
     'when':'客户体验、客服或售后问题开始影响转化、留存或品牌评价时。','questions':['问题发生在购买前、购买中还是售后？','这是个别异常，还是重复出现的结构性问题？','解决动作应该优先降低摩擦、降低错误，还是改变产品本身？']},
    {'id':'overseas.expansion','label':'海外扩张 / 越境','domain':'overseas','priority':10,'patterns':[r'海外|中国|米国|美国|グローバル|global|越境|跨境|出海|海外販路'],
     'when':'评估海外市场、跨境渠道或新的国家/地区扩张时。','questions':['目标市场的需求、渠道结构和竞争是否与日本本土相同？','先验证市场需求，还是先验证履约、法规和渠道可行性？','什么最小规模的测试能验证继续投入是否合理？']},
]

DOMAIN_BY_ID = {x['id']: x for x in DOMAINS}
DOMAIN_BY_NAME = {x['name']: x for x in DOMAINS}


def _count(patterns: list[str], text: str) -> int:
    total = 0
    for p in patterns:
        total += len(re.findall(p, text or '', re.I))
    return total


def task_scores(title: str, text: str, section: str = '') -> list[dict]:
    title = title or ''
    text = text or ''
    section = section or ''
    rows = []
    for task in TASKS:
        title_hits = _count(task['patterns'], title)
        section_hits = _count(task['patterns'], section)
        body_hits = _count(task['patterns'], text)
        if not (title_hits or section_hits or body_hits):
            continue
        score = float(task['priority']) + title_hits * 7.0 + section_hits * 3.0 + min(body_hits, 4) * 1.6
        rows.append({**task, 'score': round(score, 2)})
    return sorted(rows, key=lambda x: (-x['score'], -x['priority'], x['id']))


def domain_scores(title: str, text: str, section: str = '', source_kind: str = '') -> list[dict]:
    hay = f'{section} {text}'
    scores = defaultdict(float)
    tasks = task_scores(title, text, section)
    for task in tasks[:3]:
        scores[task['domain']] += 9.0 + min(task['score'], 20) * 0.15
    for d in DOMAINS:
        title_hits = _count(d['patterns'], title)
        section_hits = _count(d['patterns'], section)
        body_hits = _count(d['patterns'], hay)
        if title_hits or section_hits or body_hits:
            scores[d['id']] += d['priority'] + title_hits * 5.0 + section_hits * 2.0 + min(body_hits, 5) * 1.25
    sec = (section or '').lower()
    if source_kind == 'field_manual':
        scores['ec'] += 7.0
    if source_kind == 'experience' and ('仕事進め方' in section or '進め方' in section):
        scores['management'] += 5.0
        scores['decision'] += 2.0
    if 'amazon' in sec:
        scores['ec'] += 8.0
    if 'デジタルマーケ' in section or 'marketing' in sec:
        scores['media'] += 5.0
    if '競合' in section:
        scores['market'] += 6.0
    if not scores:
        fallback = {'field_manual':'ec','experience':'management','book':'decision'}.get(source_kind, 'decision')
        scores[fallback] = 1.0
    if any(k not in ('decision',) for k, v in scores.items() if v >= 6):
        scores['decision'] *= 0.72
    rows = []
    for key, score in scores.items():
        d = DOMAIN_BY_ID[key]
        rows.append({'id':key,'name':d['name'],'score':round(score,2)})
    return sorted(rows, key=lambda x: (-x['score'], x['name']))


def classify(title: str, text: str, section: str = '', source_kind: str = '') -> tuple[list[dict], list[dict]]:
    domains = domain_scores(title, text, section, source_kind)
    tasks = task_scores(title, text, section)
    domain_tags = domains[:3]
    scenario_tags = [{'id':x['id'],'label':x['label'],'domain':DOMAIN_BY_ID[x['domain']]['name'],'score':x['score']} for x in tasks[:3]]
    return domain_tags, scenario_tags


def best_task(title: str, text: str, section: str = '') -> dict | None:
    rows = task_scores(title, text, section)
    return rows[0] if rows else None
