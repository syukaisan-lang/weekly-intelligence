(() => {
  // Semantic retrieval layer: classification answers "what is this mainly about?";
  // retrieval answers "can this help with the current problem?".  Supporting
  // knowledge may therefore come from a different domain, while incidental
  // one-word matches remain filtered by the v4 precision layer.

  const PROFILES = {
    'career.onboarding': {
      label:'入职 / Onboarding', domain:'职业 / 转职 / Career',
      queryRe:/入职新公司|新公司.*开始|刚入职|刚入社|新环境|新岗位|新職場|着任|赴任|接手新职责|接手新团队|最初.*90日|最初.*90天|first 90 days/i,
      anchorRe:/入社|入職|入职|onboarding|オンボーディング|early win|着任|新任/i,
      facets:[
        ['理解业务',/事業理解|業務理解|顧客理解|市場理解|現状把握|キャッチアップ|情報収集|学び|学習|理解を深め|理解する/i],
        ['验证假设',/仮説|验证假设|検証|違和感|前提を確認|思い込み|先入観|新鮮な視点|外部視点|fresh eyes/i],
        ['内部关系',/他部署|関係者|社内|上司|メンバー|協力を得|協力関係|信頼|人間関係|コミュニケーション|stakeholder/i],
        ['角色与期待',/役割|期待値|期待され|責任|裁量|権限|優先順位|ミッション|担当範囲|目標を確認/i],
        ['早期成果',/early win|小さな成果|早期成果|短期成果|最初の成果|成功体験|信用を得|実績を作|成果を出/i],
        ['着任初期',/90日|30日|60日|最初の数か月|最初の数カ月|着任|異動|新任|新人|新規部門|新たな取り組み|立ち上がり/i]
      ]
    },
    'career.direction': {
      label:'转职 / 职业选择', domain:'职业 / 转职 / Career',
      queryRe:/転職|转职|换工作|跳槽|职业选择|キャリア/i, anchorRe:/転職|转职|キャリア|職業|换工作|跳槽/i,
      facets:[
        ['想改变什么',/仕事内容|働き方|裁量|成長|やりたい|不満|違和感|価値観|志向|キャリア/i],
        ['未来选项',/将来|選択肢|市場価値|キャリアパス|次の機会|可能性|長期/i],
        ['机会风险',/リスク|不確実|安定|会社規模|事業リスク|組織|経営|撤退/i],
        ['条件约束',/年収|給与|待遇|残業|福利厚生|勤務地|リモート|報酬/i],
        ['角色匹配',/職種|役割|ポジション|経験|強み|スキル|適性|マネジメント/i]
      ]
    },
    'career.offer': {
      label:'Offer比较 / 待遇', domain:'职业 / 转职 / Career',
      queryRe:/offer|オファー|年収|年收|待遇|两个工作机会|二つの会社/i, anchorRe:/offer|オファー|年収|給与|待遇|報酬/i,
      facets:[
        ['总报酬',/年収|給与|賞与|ボーナス|固定残業|株式|ストックオプション|福利厚生|報酬/i],
        ['职责裁量',/役割|責任|裁量|権限|マネジメント|担当範囲/i],
        ['成长空间',/成長|経験|スキル|キャリア|市場価値|学び/i],
        ['工作方式',/残業|勤務時間|リモート|出社|勤務地|休日|働き方/i],
        ['风险补偿',/リスク|不確実|会社規模|事業|資金|安定|倒産|成長率/i]
      ]
    },
    'career.interview': {
      label:'面试 / 职历表达', domain:'职业 / 转职 / Career',
      queryRe:/面试|面接|志望動機|職務経歴|interview/i, anchorRe:/面接|面談|面试|志望動機|職務経歴|interview/i,
      facets:[
        ['经历证据',/実績|成果|数字|経験|事例|担当|改善|達成/i],
        ['表达结构',/背景|課題|判断|行動|結果|STAR|ストーリー|説明/i],
        ['能力匹配',/強み|スキル|能力|再現性|求める|要件|適性/i],
        ['动机理由',/志望|転職理由|なぜ|動機|キャリア/i],
        ['对方顾虑',/懸念|リスク|弱み|不安|質問|期待/i]
      ]
    },
    'career.resign': {
      label:'离职 / 交接', domain:'职业 / 转职 / Career',
      queryRe:/离职|退職|辞职|辞め|交接|引継/i, anchorRe:/退職|離職|辞職|辞め|离职|引継/i,
      facets:[
        ['离职时点',/退職日|有給|賞与|住民税|社会保険|時期|タイミング/i],
        ['结构性原因',/不満|構造|改善しない|継続|環境|働き方|役割/i],
        ['交接',/引継|後任|資料|担当|移管|共有/i],
        ['关系维护',/関係|信頼|円満|コミュニケーション|挨拶|評判/i]
      ]
    },

    'ec.search': {
      label:'Amazon搜索 / 流量', domain:'EC / Amazon / 流通',
      queryRe:/Amazon.*搜索|検索順位|关键词排名|自然流量|検索流入/i, anchorRe:/検索順位|検索|搜索|キーワード|keyword|SEO|自然検索/i,
      facets:[
        ['搜索需求',/検索数|検索需要|search volume|需要|キーワードボリューム/i],
        ['曝光排名',/順位|ランキング|表示回数|インプレッション|露出|検索結果/i],
        ['点击率',/CTR|クリック率|クリック|セッション/i],
        ['Listing表达',/タイトル|商品名|キーワード|検索語句|商品ページ|SEO/i],
        ['销售速度',/販売速度|売上速度|販売実績|销量|売上|ランキング/i]
      ]
    },
    'ec.conversion': {
      label:'EC转化 / CVR', domain:'EC / Amazon / 流通',
      queryRe:/CVR|转化|コンバージョン|成交/i, anchorRe:/CVR|コンバージョン|conversion|転換|转化/i,
      facets:[
        ['流量质量',/流入元|トラフィック|セッション|新規|指名|検索|広告流入/i],
        ['价格条件',/価格|値段|値引|クーポン|競合価格|送料/i],
        ['评价口碑',/レビュー|口コミ|評価|星|評判/i],
        ['库存配送',/在庫|欠品|配送|納期|FBA/i],
        ['页面表达',/商品ページ|画像|タイトル|説明|訴求|A\+|LP/i],
        ['竞争变化',/競合|シェア|他社|代替|競争/i]
      ]
    },
    'ec.promo': {
      label:'促销 / 大促', domain:'EC / Amazon / 流通',
      queryRe:/促销|大促|セール|クーポン|sale/i, anchorRe:/セール|クーポン|値引|割引|sale|promotion|大促/i,
      facets:[
        ['流量还是转化',/アクセス|流量|トラフィック|CVR|コンバージョン|集客/i],
        ['增量利润',/増分|增量|利益|粗利|広告費|手数料|コスト|採算/i],
        ['折扣成本',/値引|割引|クーポン|ポイント|価格/i],
        ['活动后资产',/ランキング|レビュー|新規顧客|リピート|検索順位|指名検索|セール後/i]
      ]
    },
    'ec.inventory': {
      label:'库存 / 缺货', domain:'EC / Amazon / 流通',
      queryRe:/库存|在庫|缺货|欠品|补货/i, anchorRe:/在庫|欠品|库存|inventory|stock|補充/i,
      facets:[
        ['需求损失',/欠品|販売機会|機会損失|需要|売切/i],
        ['补货周期',/リードタイム|補充|発注|入荷|納期/i],
        ['安全库存',/安全在庫|在庫日数|需要予測|変動|バッファ/i],
        ['现金占用',/キャッシュ|資金|在庫金額|回転率|滞留/i]
      ]
    },
    'ec.review': {
      label:'评价 / Review', domain:'EC / Amazon / 流通',
      queryRe:/review|レビュー|评价|口コミ|差评/i, anchorRe:/レビュー|review|口コミ|评价|評価|星/i,
      facets:[
        ['数量覆盖',/レビュー数|件数|口コミ数|母数/i],
        ['评分',/星|評価点|rating|低評価|高評価/i],
        ['内容原因',/不満|品質|問題|理由|内容|VOC/i],
        ['业务影响',/CVR|返品|返金|購入|コンバージョン/i]
      ]
    },

    'brand.cep': {
      label:'CEP / 品牌想起', domain:'消费者 / 品牌 / CEP',
      queryRe:/CEP|品牌想起|想起|mental availability/i, anchorRe:/CEP|想起|mental availability|メンタルアベイラビリティ/i,
      facets:[
        ['购买情境',/利用シーン|使用場面|購買場面|文脈|状況|きっかけ|occasion|ニーズ発生/i],
        ['品牌想起',/想起|思い出す|ブランド想起|mental availability|第一想起/i],
        ['覆盖入口',/複数|広げ|接点|入口|カテゴリーエントリーポイント|CEP/i],
        ['传播强化',/広告|コミュニケーション|クリエイティブ|メッセージ|記憶/i]
      ]
    },
    'brand.penetration': {
      label:'渗透 / 拉新 / 复购', domain:'消费者 / 品牌 / CEP',
      queryRe:/渗透|浸透|拉新|复购|リピート|penetration/i, anchorRe:/浸透|penetration|Double Jeopardy|ロイヤ|repeat|リピート|復購|复购/i,
      facets:[
        ['买家人数',/購入者数|買い手|顧客数|新規顧客|浸透率|penetration/i],
        ['购买频率',/購入頻度|リピート|repeat|継続|ロイヤル/i],
        ['回归平均',/平均への回帰|regression to the mean|回帰/i],
        ['增长来源',/成長|新規|獲得|市場シェア|売上増/i]
      ]
    },
    'brand.research': {
      label:'消费者研究', domain:'消费者 / 品牌 / CEP',
      queryRe:/消费者研究|消費者調査|用户调研|生活者研究/i, anchorRe:/消費者調査|消费者研究|生活者研究|インタビュー|アンケート|定性|定量/i,
      facets:[
        ['真实行为',/購買行動|行動データ|実購買|観察|ログ|行動/i],
        ['口头态度',/アンケート|意識|態度|回答|インタビュー|発言/i],
        ['定性定量',/定性|定量|サンプル|統計|調査/i],
        ['需求场景',/利用シーン|ニーズ|課題|文脈|状況/i]
      ]
    },

    'market.gtm': {
      label:'市场进入 / GTM', domain:'市场 / GTM / Positioning',
      queryRe:/GTM|市场进入|参入|市场规模|市場規模/i, anchorRe:/参入|GTM|市場規模|市场规模|成長率|新市場/i,
      facets:[
        ['市场规模增长',/市場規模|TAM|SAM|成長率|成長市場|需要|市場性/i],
        ['竞争强度',/競合|競争|シェア|参入障壁|代替/i],
        ['自身能力',/ケイパビリティ|強み|能力|リソース|チャネル|ブランド力/i],
        ['协同',/シナジー|既存顧客|既存チャネル|資産|相乗効果/i],
        ['进入验证',/テスト|検証|MVP|小さく|PoC|初期顧客|仮説/i]
      ]
    },
    'market.positioning': {
      label:'Positioning / 差异化', domain:'市场 / GTM / Positioning',
      queryRe:/定位|positioning|ポジショニング|差异化/i, anchorRe:/ポジショニング|positioning|差別|差异化|代替/i,
      facets:[
        ['替代方案',/代替|選択肢|競合|今使っている|比較対象/i],
        ['独特性',/独自|ユニーク|差別|強み|特徴/i],
        ['客户价值',/価値|ベネフィット|顧客|最適|ニーズ/i],
        ['市场语境',/カテゴリー|市場|文脈|フレーム|比較/i]
      ]
    },
    'market.competitor': {
      label:'竞争分析', domain:'市场 / GTM / Positioning',
      queryRe:/竞争分析|競合分析|竞品|competitor/i, anchorRe:/競合|竞争|competitor|競争相手/i,
      facets:[
        ['真正替代',/代替|同じ予算|同じニーズ|選択肢|競合/i],
        ['共同点差异',/共通|類似|差異|差別|比較/i],
        ['购买影响',/購入理由|選択理由|顧客|価値|意思決定/i],
        ['市场变化',/市場|シェア|需要|成長|カテゴリー/i]
      ]
    },

    'product.launch': {
      label:'新品 Launch', domain:'商品 / 新品上市',
      queryRe:/新品|新商品|launch|ローンチ|上市/i, anchorRe:/新商品|新製品|新品|ローンチ|launch|発売/i,
      facets:[
        ['品牌认知',/ブランド認知|知名度|指名検索|認知率|ブランド力/i],
        ['品类成熟度',/カテゴリー|成熟|新市場|既存需要|需要創造/i],
        ['首发验证',/初期|発売直後|検証|仮説|テスト|初動/i],
        ['资源集中',/予算|集中|優先|チャネル|配分|投資/i],
        ['累积效应',/レビュー|検索順位|UGC|指名|顧客獲得|口コミ/i]
      ]
    },
    'product.pricing': {
      label:'定价 / 价格弹性', domain:'商品 / 新品上市',
      queryRe:/定价|价格|pricing|涨价|値上/i, anchorRe:/価格|値上|値下|pricing|定价|价格|価格弾力/i,
      facets:[
        ['销量弹性',/価格弾力|販売数量|需要|CVR|購入率|数量/i],
        ['利润',/粗利|利益|マージン|採算|売上/i],
        ['竞争价格',/競合価格|価格差|相場|他社/i],
        ['长期影响',/ブランド|長期|顧客|値頃感|基準価格/i]
      ]
    },

    'media.efficiency': {
      label:'广告效率 / ROAS', domain:'广告 / PR / 内容',
      queryRe:/ROAS|广告效率|広告効率|ROI|投放/i, anchorRe:/ROAS|ROI|広告効率|投放效率|CPC|CPA|広告費/i,
      facets:[
        ['成本结构',/CPC|CPA|CPM|広告費|単価|入札|コスト/i],
        ['转化',/CVR|コンバージョン|購入|売上|客単価/i],
        ['归因',/アトリビューション|归因|計測|ラストクリック|直接効果/i],
        ['自然增量',/自然流入|オーガニック|指名検索|ブランド検索|自然売上/i],
        ['整体增长',/全体売上|増分|incremental|成長|利益/i]
      ]
    },
    'media.pr': {
      label:'PR / 媒体露出', domain:'广告 / PR / 内容',
      queryRe:/PR|媒体露出|メディア|記事広告/i, anchorRe:/PR|メディア|media|媒体|記事広告|露出/i,
      facets:[
        ['传播任务',/認知|想起|集客|購入|トラフィック|目的/i],
        ['关系资产',/メディアリレーション|関係|記者|編集|継続/i],
        ['内容资产',/記事|検索|コンテンツ|SEO|二次利用/i],
        ['长短期效果',/短期|長期|売上|指名検索|認知/i]
      ]
    },

    'data.kpi': {
      label:'KPI拆解 / 参数', domain:'数据 / KPI / 测量',
      queryRe:/KPI|KGI|指标拆解|参数|パラメータ/i, anchorRe:/KPI|KGI|パラメータ|参数|指標|指标/i,
      facets:[
        ['最终结果',/KGI|最終成果|事業成果|売上|利益|目標/i],
        ['参数拆解',/分解|因数|パラメータ|式|構造|ツリー/i],
        ['领先结果指标',/先行指標|遅行指標|結果指標|モニタリング/i],
        ['行动性',/アクション|改善|意思決定|打ち手|行動/i]
      ]
    },
    'data.compare': {
      label:'同条件比较 / 实验', domain:'数据 / KPI / 测量',
      queryRe:/比较|比較|同条件|AB测试|実験/i, anchorRe:/比較|比较|同条件|benchmark|ABテスト|A\/B|実験/i,
      facets:[
        ['条件统一',/同条件|条件を揃|同じ条件|補正|コントロール/i],
        ['基准',/基準|ベースライン|前年|前月|benchmark|対照/i],
        ['变量隔离',/変数|要因|影響|因果|実験|AB/i],
        ['结果解释',/差分|増減|比較|解釈|有意/i]
      ]
    },

    'management.team': {
      label:'团队管理', domain:'执行 / 管理 / Stakeholder',
      queryRe:/团队管理|チーム|成员|メンバー|部下|上司/i, anchorRe:/チーム|メンバー|部下|上司|マネジメント|团队|成员|管理/i,
      facets:[
        ['目标标准',/目標|基準|期待値|優先順位|評価|ゴール/i],
        ['能力动机信息',/能力|スキル|動機|モチベーション|情報不足|理解|役割/i],
        ['自主判断',/自走|任せる|判断|裁量|権限|主体/i],
        ['反馈成长',/フィードバック|レビュー|育成|1on1|成長|振り返/i]
      ]
    },
    'management.stakeholder': {
      label:'Stakeholder / 谈判', domain:'执行 / 管理 / Stakeholder',
      queryRe:/stakeholder|谈判|交渉|跨部门|他部署|関係者/i, anchorRe:/交渉|stakeholder|関係者|ベンダー|partner|パートナー|協業/i,
      facets:[
        ['利益约束',/利害|メリット|目的|制約|条件|懸念|利益/i],
        ['决策权限',/決裁|意思決定|権限|責任者|決定権/i],
        ['共同利益',/win.?win|共通|合意|協力|一致|相互/i],
        ['信息同步',/共有|コミュニケーション|認識|情報|連携|関係/i]
      ]
    },
    'management.delegate': {
      label:'委派 / 交付标准', domain:'执行 / 管理 / Stakeholder',
      queryRe:/委派|分工|依頼|委譲|交付标准/i, anchorRe:/依頼|委譲|任せ|delegat|分工/i,
      facets:[
        ['目标交付物',/目的|ゴール|成果物|アウトプット|完成条件/i],
        ['期限',/期限|締め切り|納期|deadline/i],
        ['判断标准',/基準|品質|要件|期待値|判断/i],
        ['权限信息',/権限|情報|前提|背景|アクセス/i],
        ['Review',/レビュー|確認|チェック|フィードバック/i]
      ]
    },
    'management.review': {
      label:'复盘 / Review', domain:'执行 / 管理 / Stakeholder',
      queryRe:/复盘|振り返|review|レビュー/i, anchorRe:/レビュー|review|振り返|复盘|振返/i,
      facets:[
        ['假设结果',/仮説|想定|結果|差|予想/i],
        ['方法执行',/方法|実行|プロセス|施策|運用/i],
        ['条件偏差',/条件|環境|外部要因|実行差|例外/i],
        ['可复用性',/再現|ルール|学び|次回|標準化|横展開/i]
      ]
    },

    'ai.workflow': {
      label:'AI自动化 / 提效', domain:'AI / 工作效率',
      queryRe:/AI.*效率|自动化|自動化|workflow|LLM|agent/i, anchorRe:/自動化|自动化|効率|workflow|業務効率|工数|生成AI|AI|LLM|agent/i,
      facets:[
        ['流程瓶颈',/ボトルネック|工数|時間|反復|繰り返し|手作業|負荷/i],
        ['替代或增强',/代替|補助|支援|判断|生成|検索|実行/i],
        ['复核错误成本',/確認|レビュー|誤り|エラー|精度|リスク|人手/i],
        ['总工作量',/総工数|全体時間|トータル|手戻り|チェック工数|生産性/i]
      ]
    },
    'ai.meeting': {
      label:'会议记录 AI', domain:'AI / 工作效率',
      queryRe:/会议记录|議事録|录音|録音|文字起こし/i, anchorRe:/議事録|録音|文字起こし|meeting|会議/i,
      facets:[
        ['记录转写',/録音|文字起こし|書き起こし|メモ|記録/i],
        ['整理摘要',/要約|整理|議事録|まとめ|構造化/i],
        ['确认准确',/確認|修正|精度|誤り|レビュー/i],
        ['分发执行',/共有|タスク|アクション|フォロー|配布/i]
      ]
    },
    'customer.cx': {
      label:'客户体验 / CX', domain:'客户服务 / 体验',
      queryRe:/客户体验|CX|客服|カスタマー|退货|返品/i, anchorRe:/CX|カスタマー|客服|問い合わせ|返品|退货|NPS|VOC/i,
      facets:[
        ['客户声音',/VOC|問い合わせ|レビュー|不満|要望|フィードバック/i],
        ['体验节点',/体験|導線|購入|配送|サポート|接点/i],
        ['流失问题',/離脱|解約|返品|退货|不満|継続/i],
        ['业务影响',/CVR|LTV|リピート|NPS|売上|コスト/i]
      ]
    },
    'overseas.expansion': {
      label:'海外扩张 / 越境', domain:'海外 / 渠道扩张',
      queryRe:/海外|越境|跨境|出海|global|グローバル/i, anchorRe:/海外|中国|米国|美国|グローバル|global|越境|跨境|出海/i,
      facets:[
        ['市场适配',/現地|ローカライズ|文化|消費者|需要|市場/i],
        ['渠道',/Amazon|代理店|EC|チャネル|流通|販売網/i],
        ['进入成本',/物流|関税|規制|コスト|手数料|在庫/i],
        ['验证扩张',/テスト|小さく|検証|黒字|採算|初期/i]
      ]
    }
  };

  function normText(s){return normalize(String(s||''));}
  function countRe(re,text){
    try{return (String(text||'').match(new RegExp(re.source,re.flags.includes('i')?'gi':'g'))||[]).length;}catch(e){return 0;}
  }
  function taskEvidence(task,title,body){
    const t=String(title||''),b=String(body||'');
    task.re.lastIndex=0;const titleHit=task.re.test(t);
    const bodyHits=countRe(task.re,b);
    const compact=b.replace(/\s+/g,'').length;
    return {titleHit,bodyHits,strong:titleHit||bodyHits>=2||(bodyHits===1&&compact<=320)};
  }
  function profileEvidence(profile,title,body,domains){
    const t=String(title||''),b=String(body||''),d=String(domains||''),head=b.slice(0,1200);
    const hits=[];let score=0;
    for(const [label,re] of profile.facets||[]){
      re.lastIndex=0;const th=re.test(t);re.lastIndex=0;const hh=re.test(head);re.lastIndex=0;const bh=re.test(b);re.lastIndex=0;const dh=re.test(d);
      if(!th&&!hh&&!bh&&!dh)continue;
      let s=(th?4.8:0)+(hh?2.4:0)+(bh?1.2:0)+(dh?.7:0);
      hits.push({label,score:s});score+=s;
    }
    hits.sort((a,b)=>b.score-a.score);
    return {facetCount:hits.length,facets:hits.map(x=>x.label),score};
  }
  function semanticFor(title,body,domains,ctx){
    let best=null;
    for(const task of ctx.tasks||[]){
      const profile=PROFILES[task.id];if(!profile)continue;
      const direct=taskEvidence(task,title,body),sem=profileEvidence(profile,title,body,domains);
      let level='none',score=0;
      if(direct.strong){level='core';score=15+(direct.titleHit?4:0)+Math.min(3,direct.bodyHits*.7)+sem.score*.25;}
      else if(sem.facetCount>=3){level='support';score=11+sem.score*.55;}
      else if(sem.facetCount>=2&&sem.score>=5){level='support';score=8+sem.score*.5;}
      if(level!=='none'&&(!best||score>best.score))best={taskId:task.id,taskLabel:profile.label,level,score,facets:sem.facets.slice(0,4),facetCount:sem.facetCount};
    }
    return best;
  }

  const _makeCtxV5=makeQueryContext;
  makeQueryContext=function(q){
    const ctx=_makeCtxV5(q),existing=new Set((ctx.tasks||[]).map(x=>x.id));
    for(const [id,p] of Object.entries(PROFILES)){
      if(existing.has(id)||!p.queryRe)continue;
      p.queryRe.lastIndex=0;if(!p.queryRe.test(q||''))continue;
      ctx.tasks.push({id,label:p.label,domain:p.domain,terms:[],re:p.anchorRe});existing.add(id);
    }
    ctx.semanticProfiles=(ctx.tasks||[]).map(x=>x.id).filter(id=>PROFILES[id]);
    return ctx;
  };

  const _rawScoreV4=rawScore;
  function scoredRaw(title,body,domains,ctx){
    const lexical=_rawScoreV4(title,body,domains,ctx)||0;
    const semantic=semanticFor(title,body,domains,ctx);
    let score=lexical;
    if(semantic)score=Math.max(score,semantic.score);
    const exact=ctx.raw&&normText(title).includes(ctx.raw);
    const level=semantic?.level||(lexical>0?(exact?'core':'direct'):'none');
    return {score,semantic:semantic||{level,facets:[],taskLabel:''}};
  }
  rawScore=function(title,body,domains,ctx){return scoredRaw(title,body,domains,ctx).score;};

  const _queryScoreV5=queryScore;
  queryScore=function(r,ctx){
    const lexical=_queryScoreV5(r,ctx)||0;
    if(!ctx?.raw)return lexical;
    const sem=semanticFor(r.title||'',ruleText(r),r.domain||'',ctx);
    if(!sem)return lexical;
    const semanticRuleScore=sem.level==='core'?sem.score+3:sem.score;
    return Math.max(lexical,semanticRuleScore);
  };

  rawResults=function(ctx,excluded=new Set(),limit=10){
    if(!ctx.raw)return [];
    const rows=[];
    for(const n of (WS?.notes||[])){
      if(excluded.has('n:'+n.id))continue;
      const d=(n.domains||[]).map(x=>x.name||'').join(' '),body=noteText(n),res=scoredRaw(n.title||'',body,d,ctx);
      if(res.score>0)rows.push({kind:'private',id:n.id,score:res.score,title:n.title||n.section||'工作笔记',subtitle:`${n.source_label||'私人资料'} · ${n.section||''}`,text:n.text||'',note:n,semantic:res.semantic});
    }
    for(const a of (WK?.items||[])){
      if(excluded.has('k:'+a.id))continue;
      const d=`${a.category||''} ${(a.topics||[]).join(' ')}`,body=knowledgeText(a),res=scoredRaw(a.title||'',body,d,ctx);
      if(res.score>0)rows.push({kind:'notion',id:a.id,score:res.score,title:a.title||'Notion Knowledge',subtitle:`Notion · ${a.category||'未分类'}`,text:a.summary||a.page_body||'',article:a,semantic:res.semantic});
    }
    const rank={core:4,support:3,direct:2,none:0};
    rows.sort((a,b)=>(rank[b.semantic?.level]||0)-(rank[a.semantic?.level]||0)||b.score-a.score);
    // Keep enough supporting context, but avoid flooding the page.
    return rows.slice(0,limit);
  };

  function relationLine(x){
    const s=x.semantic||{};
    if(s.level==='core')return `<span class="raw-kind">核心相关</span>${s.facets?.length?`<small>内容依据：${ew(s.facets.join(' / '))}</small>`:''}`;
    if(s.level==='support')return `<span class="raw-kind">支撑相关</span><small>为什么有用：${ew((s.facets||[]).join(' / '))}</small>`;
    return `<span class="raw-kind">直接命中</span>`;
  }
  renderRaw=function(rows){
    if(!rows.length)return'';
    const ctx=makeQueryContext($w('playbookSearch')?.value||'');
    return `<section class="raw-recall"><div class="section-head slim"><div><h2>相关原始知识</h2><p class="muted small">不要求和问题属于同一分类：核心内容优先，同时召回能支持当前判断的跨领域知识；只在正文偶然出现一个词的内容会隐藏。</p></div></div><div class="raw-recall-list">${rows.map(x=>{
      const rel=relationLine(x);
      if(x.kind==='notion')return `<a class="raw-recall-item" href="knowledge.html?open=${encodeURIComponent(x.id||'')}"><div>${rel}<b>${ew(x.title)}</b><small>${ew(x.subtitle)}</small></div><p>${ew(excerpt(x.text,ctx,300))}</p></a>`;
      const url=sourceUrl(x.note);return `<div class="raw-recall-item"><div>${rel}<b>${ew(x.title)}</b><small>${ew(x.subtitle)}</small></div><p>${ew(excerpt(x.text,ctx,300))}</p>${url?`<a class="raw-source-link" href="${ew(url)}" target="_blank" rel="noopener noreferrer">打开原资料 ↗</a>`:''}</div>`;
    }).join('')}</div></section>`;
  };

  const _hintV5=renderIntentHint;
  renderIntentHint=function(ctx,ruleCount,rawCount){
    _hintV5(ctx,ruleCount,rawCount);
    const box=$w('queryIntentHint');if(!box||box.classList.contains('hidden'))return;
    const old=box.querySelector('.intent-precision-note');if(old)old.remove();
    const note=document.createElement('small');note.className='intent-precision-note';
    note.textContent='检索会看内容含义：核心场景 + 跨领域支撑；正文偶然词命中会被隐藏';
    box.appendChild(note);
  };
})();
