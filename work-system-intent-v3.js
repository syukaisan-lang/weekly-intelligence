(() => {
  const TASKS_V3 = [
    {id:'career.offer',label:'Offer比较 / 待遇',domain:'职业 / 转职 / Career',p:12,re:/オファー|offer|年収|年收|給与|待遇|報酬|salary|compensation/i,terms:['offer','オファー','年収','年收','給与','待遇','報酬']},
    {id:'career.interview',label:'面试 / 职历表达',domain:'职业 / 转职 / Career',p:12,re:/面接|面談|面试|面試|志望動機|職務経歴|職歴|interview/i,terms:['面试','面接','職務経歴','志望動機','interview']},
    {id:'career.onboarding',label:'入职 / Onboarding',domain:'职业 / 转职 / Career',p:11,re:/入社|入職|入职|onboarding|オンボーディング|early win/i,terms:['入职','入社','onboarding','early win']},
    {id:'career.resign',label:'离职 / 交接',domain:'职业 / 转职 / Career',p:11,re:/退職|離職|辞職|辞め|离职|有給|引継/i,terms:['离职','退職','有給','引継']},
    {id:'career.direction',label:'转职 / 职业选择',domain:'职业 / 转职 / Career',p:9,re:/転職|转职|换工作|跳槽|キャリア|职业|職業/i,terms:['转职','転職','换工作','跳槽','キャリア','职业']},

    {id:'ec.search',label:'Amazon搜索 / 流量',domain:'EC / Amazon / 流通',p:12,re:/検索順位|検索|搜索|キーワード|keyword|seo|自然検索|検索流入/i,terms:['搜索','検索','关键词','キーワード','keyword','SEO','自然流量']},
    {id:'ec.conversion',label:'EC转化 / CVR',domain:'EC / Amazon / 流通',p:12,re:/CVR|コンバージョン|conversion|転換|转化|商品ページ/i,terms:['CVR','转化','コンバージョン','conversion','商品ページ']},
    {id:'ec.promo',label:'促销 / 大促',domain:'EC / Amazon / 流通',p:11,re:/セール|クーポン|値引|割引|sale|promotion|大促/i,terms:['促销','セール','クーポン','折扣','割引','大促']},
    {id:'ec.inventory',label:'库存 / 缺货',domain:'EC / Amazon / 流通',p:11,re:/在庫|欠品|库存|inventory|stock|補充/i,terms:['库存','在庫','缺货','欠品','inventory']},
    {id:'ec.review',label:'评价 / Review',domain:'EC / Amazon / 流通',p:10,re:/レビュー|review|口コミ|评价|評価|星/i,terms:['review','レビュー','评价','口コミ']},
    {id:'ec.traffic',label:'EC流量结构',domain:'EC / Amazon / 流通',p:9,re:/アクセス|traffic|流量|セッション|session|流入/i,terms:['流量','traffic','アクセス','session','セッション']},

    {id:'brand.cep',label:'CEP / 品牌想起',domain:'消费者 / 品牌 / CEP',p:12,re:/CEP|想起|mental availability|メンタルアベイラビリティ/i,terms:['CEP','想起','mental availability']},
    {id:'brand.penetration',label:'渗透 / 拉新 / 复购',domain:'消费者 / 品牌 / CEP',p:11,re:/浸透|渗透|penetration|Double Jeopardy|ダブルジョパディ|ロイヤ|repeat|リピート|復購|复购/i,terms:['渗透','浸透','penetration','复购','repeat','Double Jeopardy']},
    {id:'brand.research',label:'消费者研究',domain:'消费者 / 品牌 / CEP',p:10,re:/消費者調査|消费者研究|生活者研究|インタビュー|アンケート|購買行動|定性|定量/i,terms:['消费者研究','消費者調査','購買行動','定性','定量','访谈','インタビュー']},

    {id:'market.positioning',label:'Positioning / 差异化',domain:'市场 / GTM / Positioning',p:12,re:/ポジショニング|positioning|差別|差异化|代替/i,terms:['定位','ポジショニング','positioning','差异化','差別化','代替']},
    {id:'market.competitor',label:'竞争分析',domain:'市场 / GTM / Positioning',p:11,re:/競合|竞争|competitor|競争相手/i,terms:['竞争','競合','竞品','competitor']},
    {id:'market.gtm',label:'市场进入 / GTM',domain:'市场 / GTM / Positioning',p:11,re:/参入|GTM|市場規模|市场规模|成長率|成長市場|新市場/i,terms:['GTM','市场规模','市場規模','市场进入','参入','成长率','成長率']},

    {id:'product.launch',label:'新品 Launch',domain:'商品 / 新品上市',p:12,re:/新商品|新製品|新品|ローンチ|launch|発売/i,terms:['新品','新商品','新製品','launch','ローンチ']},
    {id:'product.pricing',label:'定价 / 价格弹性',domain:'商品 / 新品上市',p:11,re:/価格|値上|値下|pricing|定价|价格|価格弾力/i,terms:['定价','价格','価格','pricing','涨价','値上']},

    {id:'media.efficiency',label:'广告效率 / ROAS',domain:'广告 / PR / 内容',p:12,re:/ROAS|ROI|広告効率|投放效率|CPC|CPA|広告費/i,terms:['ROAS','ROI','CPC','CPA','广告效率','広告効率']},
    {id:'media.pr',label:'PR / 媒体露出',domain:'广告 / PR / 内容',p:10,re:/\bPR\b|メディア|media|媒体|記事広告|露出|パブリシティ/i,terms:['PR','媒体','メディア','media','記事広告']},

    {id:'data.compare',label:'同条件比较 / 实验',domain:'数据 / KPI / 测量',p:11,re:/比較|比较|同条件|条件を揃|benchmark|ABテスト|A\/B|実験/i,terms:['比较','比較','同条件','benchmark','AB测试','実験']},
    {id:'data.kpi',label:'KPI拆解 / 参数',domain:'数据 / KPI / 测量',p:10,re:/KPI|KGI|パラメータ|参数|指標|指标|分解|因数/i,terms:['KPI','KGI','参数','パラメータ','指标','指標']},

    {id:'management.delegate',label:'委派 / 交付标准',domain:'执行 / 管理 / Stakeholder',p:11,re:/依頼|委譲|任せ|delegat|分工/i,terms:['委派','委譲','依頼','分工','delegation']},
    {id:'management.stakeholder',label:'Stakeholder / 谈判',domain:'执行 / 管理 / Stakeholder',p:11,re:/交渉|stakeholder|関係者|ベンダー|partner|パートナー|協業/i,terms:['stakeholder','交涉','交渉','関係者','vendor','ベンダー']},
    {id:'management.review',label:'复盘 / Review',domain:'执行 / 管理 / Stakeholder',p:10,re:/レビュー|review|振り返|复盘|振返/i,terms:['复盘','review','レビュー','振り返']},
    {id:'management.team',label:'团队管理',domain:'执行 / 管理 / Stakeholder',p:9,re:/チーム|メンバー|部下|上司|マネジメント|团队|成员|管理/i,terms:['团队','チーム','成员','メンバー','管理','マネジメント']},

    {id:'ai.meeting',label:'会议记录 AI',domain:'AI / 工作效率',p:12,re:/議事録|録音|文字起こし|meeting|会議/i,terms:['会议','会議','議事録','录音','録音','文字起こし']},
    {id:'ai.workflow',label:'AI自动化 / 提效',domain:'AI / 工作效率',p:11,re:/自動化|自动化|効率|workflow|業務効率|工数|生成AI|\bAI\b|LLM|agent|エージェント/i,terms:['AI','生成AI','自动化','自動化','workflow','效率','効率','LLM','agent']},

    {id:'customer.cx',label:'客户体验 / CX',domain:'客户服务 / 体验',p:10,re:/CX|カスタマー|客服|問い合わせ|返品|退货|サポート|NPS|VOC|離脱/i,terms:['CX','客服','カスタマー','NPS','VOC','退货','返品']},
    {id:'overseas.expansion',label:'海外扩张 / 越境',domain:'海外 / 渠道扩张',p:10,re:/海外|中国|米国|美国|グローバル|global|越境|跨境|出海|海外販路/i,terms:['海外','越境','跨境','出海','global','グローバル']}
  ];

  const DOMAIN_NAMES = new Set(TASKS_V3.map(x=>x.domain));
  const _baseAllRulesV3 = allRules;
  const _baseRenderRulesV3 = renderRules;

  function uniq(xs){return [...new Set(xs.filter(Boolean))];}
  function taskMatches(text){
    return TASKS_V3.filter(t=>{t.re.lastIndex=0;return t.re.test(text||'');});
  }
  function bestRuleTask(r){
    if(r?.scenario_id){const x=TASKS_V3.find(t=>t.id===r.scenario_id);if(x)return x;}
    const title=String(r?.title||''), body=ruleText(r||{});
    let best=null,bestScore=0;
    for(const t of TASKS_V3){
      t.re.lastIndex=0;const th=t.re.test(title);t.re.lastIndex=0;const bh=t.re.test(body);
      if(!th&&!bh)continue;
      const s=t.p+(th?8:0)+(bh?2.5:0);
      if(s>bestScore){best=t;bestScore=s;}
    }
    return best;
  }
  function cloneRule(r){
    const x={...r};
    const task=bestRuleTask(x);
    if(task){
      x.scenario_id=task.id;x.scenario_label=task.label;x.domain=task.domain;
      // Only use task-specific prompts when the rule itself supports that task.
      const pyTask=TASK_CONTENT[task.id];
      if(pyTask){x.when=pyTask.when;x.questions=pyTask.questions;}
    }
    return x;
  }

  const TASK_CONTENT = {
    'career.offer':{when:'比较工作机会、年收待遇或是否接受 Offer 时。',questions:['除了年收，职责范围、裁量、工作方式和成长空间分别差多少？','比较条件是否统一到总年收、固定/浮动部分、加班和福利？','高出的报酬是在补偿什么风险或不确定性？']},
    'career.interview':{when:'准备面试、整理职业经历或说明转职理由时。',questions:['这次要证明的核心能力是什么，过去哪一个结果最能作为证据？','经历是否能用“背景→判断→行动→结果”讲清？','对方真正担心的风险是什么，我的回答有没有消除它？']},
    'career.direction':{when:'评估是否转职、选择职业方向或重新定义下一阶段目标时。',questions:['这次真正想改变的是什么：工作内容、裁量、年收、工作方式还是成长？','新机会解决了旧工作的什么结构性问题，又新增了什么风险？','这个选择是否扩大未来选项，而不只是改善眼前条件？']},
    'ec.search':{when:'Amazon/EC 的搜索流量、关键词排名或自然流量出现问题时。',questions:['目标关键词的搜索需求、当前排名和点击率分别发生了什么？','问题是没有曝光、没有点击，还是点击后不转化？','标题、关键词、广告和销售速度中最可能的限制项是哪一个？']},
    'ec.conversion':{when:'流量已经存在，但 EC/Amazon 成交效率下降或不足时。',questions:['进入详情页的人群质量有没有变化？','价格、库存、评价、页面表达和竞争条件中哪一项同期变化？','CVR 是绝对下降，还是流量结构变化后的自然稀释？']},
    'ec.promo':{when:'设计促销、参加大促或评估折扣活动是否值得继续时。',questions:['这次动作主要想增加流量还是提高 CVR？','增量销量扣除折扣、广告和平台成本后是否仍然有意义？','活动结束后留下了排名、评价或新客资产吗？']},
    'brand.cep':{when:'品牌增长问题涉及“消费者在什么场景会想起你”时。',questions:['目标消费者在哪些购买/使用情境下进入这个品类？','品牌目前覆盖了多少重要 CEP？','传播是在增加新的想起入口，还是重复已有认知？']},
    'brand.penetration':{when:'判断品牌增长应优先扩大购买人数，还是提高复购/忠诚时。',questions:['当前增长瓶颈首先是购买人数不足，还是购买频率不足？','小品牌的低复购是否只是低渗透率的伴随现象？','动作能扩大买家基础，还是只优化现有重度用户？']},
    'market.positioning':{when:'需要定义产品/品牌在市场中的位置和差异时。',questions:['用户现在用什么替代方案解决同一个问题？','差异点对最佳目标客户是否真的有价值？','市场语境是否能让差异容易理解和比较？']},
    'market.gtm':{when:'评估新市场、GTM 或是否值得投入一个机会时。',questions:['市场规模、增长、竞争强度、自身能力和协同分别怎样？','为什么是现在进入？','最小可验证切入口是什么，什么结果会让我们继续加码？']},
    'product.launch':{when:'新品上市、首发资源配置或判断 launch 节奏时。',questions:['品牌认知高低与品类成熟度分别是什么状态？','首发期最需要验证的是需求、转化、渠道还是复购？','有限预算应该集中在哪个能形成后续累积效应的入口？']},
    'product.pricing':{when:'定价、涨价、降价或判断价格促销影响时。',questions:['价格变化影响的是转化、购买人数还是客单与利润？','观察有没有混入促销、渠道或产品结构变化？','短期销量弹性与长期品牌/利润影响是否要分开判断？']},
    'media.efficiency':{when:'广告效率指标变化，需要判断是否削减或增加投入时。',questions:['ROAS 变化来自 CPC、CVR、客单还是归因口径？','广告是否同时影响品牌搜索、自然流量或后续销售？','目标是最大化广告 ROI，还是最大化整体业务增长？']},
    'data.compare':{when:'比较不同时间、渠道、方案或实验结果时。',questions:['比较对象是否处在相同促销、库存、流量和时间条件？','差异来自真正变量，还是基准选择不同？','需要看绝对值、同比/环比，还是同组相对表现？']},
    'data.kpi':{when:'把业务问题拆成指标、寻找真正驱动结果的参数时。',questions:['最终业务结果是什么，能够拆成哪几个可观察参数？','哪些是领先指标，哪些只是结果指标？','这个指标变化时，是否真的能指导下一步行动？']},
    'management.delegate':{when:'把任务交给成员、跨团队协作或需要明确交付标准时。',questions:['目标、截止时间、判断基准和最终交付物是否都说清楚？','对方缺的是信息、权限、能力还是优先级？','任务完成后由谁 review，什么状态才算真正结束？']},
    'management.stakeholder':{when:'涉及多个利益相关方、外部伙伴或需要谈判协调时。',questions:['每一方真正的目标、约束和不能接受的条件是什么？','有没有所有参与者都能受益的共同点？','决策权、执行权和信息同步责任分别在谁手里？']},
    'management.team':{when:'管理成员、建立团队协作方式或处理上下级关系时。',questions:['目标和评价标准是否让成员自己也能判断优先级？','问题来自能力、动机、信息不足还是角色边界不清？','我是在替成员解决问题，还是帮助他们形成自己的判断能力？']},
    'ai.meeting':{when:'评估 AI/自动化是否适合会议记录、录音整理或信息回收流程时。',questions:['真正耗时的是记录、整理、确认，还是后续分发与执行？','哪些内容错误成本高，必须保留人工确认？','导入后应该比较总处理时间还是单一步骤速度？']},
    'ai.workflow':{when:'考虑把 AI 或自动化导入具体业务流程，并判断是否真的提效时。',questions:['当前流程最耗时、最重复、最容易出错的是哪一步？','人工复核成本有没有抵消节省的时间？','成功标准是缩短时间、降低错误、增加产出，还是提高判断质量？']}
  };

  allRules=function(){return _baseAllRulesV3().map(cloneRule);};

  makeQueryContext=function(q){
    const raw=normalize(q), exact=new Set(basicTokens(q));if(raw)exact.add(raw);
    const aliases=new Set(), expanded=new Set();
    ALIAS_GROUPS.forEach(g=>{if(g.some(t=>raw.includes(normalize(t))))g.forEach(t=>aliases.add(normalize(t)));});
    const tasks=TASKS_V3.filter(t=>{t.re.lastIndex=0;return t.re.test(q||'');});
    tasks.forEach(t=>t.terms.forEach(x=>expanded.add(normalize(x))));
    const intents=INTENTS.filter(x=>x.re.test(q||''));
    intents.forEach(x=>(x.terms||[]).slice(0,8).forEach(t=>expanded.add(normalize(t))));
    exact.forEach(x=>{aliases.delete(x);expanded.delete(x);});aliases.forEach(x=>expanded.delete(x));
    const terms=uniq([...exact,...aliases,...expanded]).filter(x=>x.length>1).sort((a,b)=>b.length-a.length).slice(0,90);
    return {raw,intents,tasks,exactTerms:[...exact],aliasTerms:[...aliases],expandedTerms:[...expanded],terms};
  };

  function termFieldScore(term,title,domain,when,body,weight=1){
    if(term.length<2)return 0;
    if(title.includes(term))return 8*weight;
    if(domain.includes(term))return 4*weight;
    if(when.includes(term))return 3*weight;
    if(body.includes(term))return 1.8*weight;
    return 0;
  }

  queryScore=function(r,ctx){
    if(!ctx?.raw)return (MAT_ORDER[r.maturity]||0)*.15+(r.type==='framework'?.15:r.type==='playbook'?.1:0);
    const title=normalize(r.title),domain=normalize(r.domain),when=normalize([r.when,...(r.questions||[])].join(' ')),body=normalize(ruleText(r));
    let score=0,exactHits=0,taskHit=false;
    if(ctx.raw.length>=3){if(title.includes(ctx.raw))score+=14;else if(body.includes(ctx.raw))score+=7;}
    for(const t of ctx.exactTerms||[]){const s=termFieldScore(t,title,domain,when,body,1);if(s){score+=s;exactHits++;}}
    for(const t of ctx.aliasTerms||[])score+=termFieldScore(t,title,domain,when,body,.34);
    for(const t of ctx.expandedTerms||[])score+=termFieldScore(t,title,domain,when,body,.10);
    const rt=bestRuleTask(r);
    for(const t of ctx.tasks||[]){
      if(r.scenario_id===t.id||rt?.id===t.id){score+=20;taskHit=true;}
      else if(r.domain===t.domain){score+=2.2;}
    }
    if((ctx.tasks||[]).length&&!taskHit&&!exactHits){
      const allowed=new Set(ctx.tasks.map(x=>x.domain));
      if(!allowed.has(r.domain))return 0;
      score-=2;
    }
    if(r.maturity==='validated')score+=.6;
    const threshold=(ctx.tasks||[]).length?6.5:2.5;
    return score>=threshold?score:0;
  };

  rawScore=function(title,body,domains,ctx){
    const nt=normalize(title),nb=normalize(body),nd=normalize(domains);let score=0,exactHits=0,taskHit=false;
    if(ctx.raw.length>=3){if(nt.includes(ctx.raw))score+=13;else if(nb.includes(ctx.raw))score+=6;}
    for(const t of ctx.exactTerms||[]){if(nt.includes(t)){score+=7;exactHits++;}else if(nd.includes(t)){score+=3;exactHits++;}else if(nb.includes(t)){score+=1.7;exactHits++;}}
    for(const t of ctx.aliasTerms||[]){if(nt.includes(t))score+=2.4;else if(nb.includes(t))score+=.6;}
    for(const task of ctx.tasks||[]){task.re.lastIndex=0;if(task.re.test(`${title} ${body} ${domains}`)){score+=14;taskHit=true;}else if(normalize(task.domain)===nd)score+=1.5;}
    if((ctx.tasks||[]).length&&!taskHit&&!exactHits)return 0;
    return score>=3?score:0;
  };

  renderIntentHint=function(ctx,ruleCount,rawCount){
    const box=$w('queryIntentHint');if(!box)return;
    if(!ctx.raw){box.classList.add('hidden');box.innerHTML='';return;}
    const tasks=(ctx.tasks||[]).slice(0,3).map(x=>x.label);
    const focus=tasks.length?`识别工作场景：<b>${tasks.map(ew).join(' + ')}</b>`:'没有强行归类，按你输入的原词优先检索';
    box.innerHTML=`${focus}<span>原词优先 · 同义词辅助 · 领域扩展仅弱召回 · ${Math.min(ruleCount,8)} 条核心规则${rawCount?` · ${rawCount} 条原始知识`:''}</span>`;
    box.classList.remove('hidden');
  };

  renderRules=function(){
    _baseRenderRulesV3();
    const q=($w('playbookSearch')?.value||'').trim();
    if(!q)return;
    const cards=[...document.querySelectorAll('#playbookList .system-rule-card')];
    cards.slice(8).forEach(x=>x.remove());
    const raws=[...document.querySelectorAll('#playbookList .raw-recall-item')];
    raws.slice(0,8).forEach(()=>{});raws.slice(8).forEach(x=>x.remove());
    document.querySelectorAll('#playbookList .system-rule-card').forEach(card=>card.dataset.contextEnhanced='0');
  };
})();
