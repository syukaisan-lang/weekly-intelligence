(() => {
  const GENERIC_WHENS = new Set([
    '遇到与该规则同类的问题时，先核对前提条件。',
    '同类问题发生时先核对前提。'
  ]);
  const GENERIC_QUESTION_SNIPPETS = [
    '真正要改变的业务结果是什么', '目前事实、假设和意见分别是什么', '如果结果没发生',
    '目标市场的替代方案是什么', '这个市场为什么现在值得进入', '我们真正有优势的场景',
    '消费者在什么情境下会进入这个品类', '要改变的是想起、考虑、购买还是复购', '现有判断来自真实行为还是口头态度',
    '这是成熟需求还是新需求', '首发期最需要验证的假设是什么', '什么指标决定继续、调整或停止投入',
    '问题发生在流量、转化、客单、库存还是复购', '站内与站外流量分别发生了什么', '当前动作是在制造需求还是承接需求',
    '本次媒体任务是触达、想起、承接还是成交', '效果问题来自渠道、创意、人群还是承接页', '短期指标与长期业务指标是否冲突',
    '最终业务结果如何拆成可观察参数', '领先指标与结果指标分别是什么', '当前比较是否在相同条件下进行',
    '谁真正拥有决策权和执行权', '每个相关方的利益和约束是什么', '下一步是否有明确负责人、截止时间和验收标准',
    'AI是在替代步骤、增强判断还是改变用户行为', '错误成本和人工复核点在哪里', '是否真的减少总工作量'
  ];

  const CONTEXTS = [
    [/年収|給与|待遇|報酬|salary|compensation|オファー|offer/i,
      '比较工作机会、年收待遇或是否接受 Offer 时。',
      ['除了年收，职责范围、裁量、工作方式和成长空间分别差多少？','比较条件是否统一到总年收、固定/浮动部分、加班和福利？','高出的报酬是在补偿什么风险或不确定性？']],
    [/面接|面談|志望動機|職務経歴|職歴|interview/i,
      '准备面试、整理职业经历或说明转职理由时。',
      ['这次要证明的核心能力是什么，过去哪一个结果最能作为证据？','经历是否能用“背景→判断→行动→结果”讲清？','对方真正担心的风险是什么，我的回答有没有消除它？']],
    [/退職|離職|辞職|辞め|离职/i,
      '判断离职时点、离职方式或交接安排时。',
      ['离职决定来自短期情绪，还是结构性问题已经持续存在？','奖金、带薪假、住民税、社保和交接时点是否计算清楚？','怎样退出才能减少对关系和职业信誉的损耗？']],
    [/入社|入職|オンボーディング|onboarding|入职/i,
      '刚入职、接手新职责或需要快速建立内部信用时。',
      ['前30～90天最需要理解的业务机制和关键关系人是谁？','哪些判断目前只是外部视角的假设？','最小的 early win 是什么？']],
    [/議事録|録音|文字起こし|meeting|会議/i,
      '评估 AI/自动化是否适合会议记录、录音整理或信息回收流程时。',
      ['真正耗时的是记录、整理、确认，还是后续分发与执行？','哪些内容错误成本高，必须保留人工确认？','导入后应该比较总处理时间还是单一步骤速度？']],
    [/自動化|自动化|効率|workflow|業務効率|工数/i,
      '考虑把 AI 或自动化导入具体业务流程，并判断是否真的提效时。',
      ['当前流程最耗时、最重复、最容易出错的是哪一步？','人工复核成本有没有抵消节省的时间？','成功标准是缩短时间、降低错误、增加产出，还是提高判断质量？']],
    [/検索|検索順位|keyword|キーワード|seo|自然検索/i,
      'Amazon/EC 的搜索流量、关键词排名或自然流量出现问题时。',
      ['目标关键词的搜索需求、当前排名和点击率分别发生了什么？','问题是没有曝光、没有点击，还是点击后不转化？','标题、关键词、广告和销售速度中最可能的限制项是哪一个？']],
    [/セール|クーポン|値引|割引|sale|promotion|キャンペーン/i,
      '设计促销、参加大促或评估折扣活动是否值得继续时。',
      ['这次动作主要想增加流量还是提高 CVR？','增量销量扣除折扣、广告和平台成本后是否仍然有意义？','活动结束后留下了排名、评价或新客资产吗？']],
    [/在庫|欠品|库存|stock|inventory/i,
      '库存、缺货或补货节奏可能限制销售时。',
      ['损失来自需求不足，还是库存不足导致无法成交？','补货周期和安全库存是否覆盖促销与自然增长波动？','现金占用和缺货损失如何权衡？']],
    [/レビュー|review|口コミ|评价|評価/i,
      '评价、评论数量或口碑可能影响 EC 转化时。',
      ['问题是评价数量、星级，还是评论内容暴露了产品问题？','评价变化和 CVR/退货率是否同步？','应该优先增加评价覆盖，还是先修复差评原因？']],
    [/CVR|コンバージョン|conversion|転換|转化/i,
      '流量已经存在，但 EC/Amazon 成交效率下降或不足时。',
      ['进入详情页的人群质量有没有变化？','价格、库存、评价、页面表达和竞争条件中哪一项同期变化？','CVR 是绝对下降，还是流量结构扩大后的自然稀释？']],
    [/アクセス|traffic|流量|セッション|session/i,
      'EC/Amazon 销售变化需要先判断是不是流量问题时。',
      ['站内搜索、广告、活动和站外流量分别变化多少？','新增/减少的是高意向还是低意向流量？','流量变化能否解释销量变化，还是 CVR/客单也同时变化？']],
    [/CEP|想起|メンタルアベイラビリティ|mental availability/i,
      '品牌增长问题涉及“消费者在什么场景会想起你”时。',
      ['消费者在哪些购买/使用情境下进入这个品类？','品牌覆盖了多少重要 CEP？','传播是在增加新的想起入口，还是重复已有认知？']],
    [/浸透|penetration|Double Jeopardy|ダブルジョパディ/i,
      '判断品牌增长应优先拉新还是提高忠诚/复购时。',
      ['当前瓶颈首先是购买人数不足，还是购买频率不足？','小品牌的低复购是否只是渗透率低的伴随现象？','动作能扩大买家基础，还是只优化现有重度用户？']],
    [/ポジショニング|positioning|差別|差异化|代替/i,
      '需要定义产品/品牌在市场中的位置和差异时。',
      ['用户现在用什么替代方案解决同一个问题？','差异点对最佳目标客户是否真的有价值？','市场语境是否能让差异容易理解和比较？']],
    [/競合|竞争|competitor/i,
      '进行竞争分析或决定应该跟谁比较时。',
      ['竞争对手是功能相似者，还是争夺同一购买情境/预算的替代方案？','比较是否先找共同点，再判断真正影响购买的差异？','竞品变化会影响市场总需求，还是只改变份额？']],
    [/参入|GTM|市場規模|市场规模|成長率|成長市場/i,
      '评估新市场、GTM 或是否值得投入一个机会时。',
      ['市场规模、增长、竞争强度、自身能力和协同分别怎样？','为什么是现在进入？','最小可验证切入口是什么，什么结果会让我们继续加码？']],
    [/新商品|新製品|新品|ローンチ|launch|発売/i,
      '新品上市、首发资源配置或判断 launch 节奏时。',
      ['品牌认知高低与品类成熟度分别是什么状态？','首发期最需要验证的是需求、转化、渠道还是复购？','有限预算应该集中在哪个能形成后续累积效应的入口？']],
    [/価格|値上|値下|pricing|定价|价格/i,
      '定价、涨价、降价或判断价格促销影响时。',
      ['价格变化影响的是转化、购买人数还是客单与利润？','观察有没有混入促销、渠道或产品结构变化？','短期销量弹性与长期品牌/利润影响是否要分开判断？']],
    [/ROAS|ROI|広告効率|投放效率/i,
      '广告效率指标变化，需要判断是否削减或增加投入时。',
      ['ROAS 变化来自 CPC、CVR、客单还是归因口径？','广告是否同时影响品牌搜索、自然流量或后续销售？','目标是最大化广告 ROI，还是最大化整体业务增长？']],
    [/PR|メディア|media|媒体/i,
      '规划 PR、媒体露出或评估内容合作的业务价值时。',
      ['媒体任务是建立认知、增加想起、获取流量还是促成购买？','这次露出能否留下可累积的搜索、内容或关系资产？','效果应该看即时销量还是更长观察窗口？']],
    [/比較|比较|同条件|条件を揃|benchmark/i,
      '比较不同时间、渠道、方案或实验结果时。',
      ['比较对象是否处在相同促销、库存、流量和时间条件？','差异来自真正变量，还是基准选择不同？','需要看绝对值、同比/环比，还是同组相对表现？']],
    [/KPI|KGI|パラメータ|参数|指標|指标/i,
      '把业务问题拆成指标、寻找真正驱动结果的参数时。',
      ['最终业务结果是什么，能够拆成哪几个可观察参数？','哪些是领先指标，哪些只是结果指标？','这个指标变化时，是否真的能指导下一步行动？']],
    [/依頼|委譲|任せ|delegat|分工/i,
      '把任务交给成员、跨团队协作或需要明确交付标准时。',
      ['目标、截止时间、判断基准和最终交付物是否都说清楚？','对方缺的是信息、权限、能力还是优先级？','任务完成后由谁 review，什么状态才算真正结束？']],
    [/交渉|stakeholder|関係者|ベンダー|partner|協業/i,
      '涉及多个利益相关方、外部伙伴或需要谈判协调时。',
      ['每一方真正的目标、约束和不能接受的条件是什么？','有没有所有参与者都能受益的共同点？','决策权、执行权和信息同步责任分别在谁手里？']],
    [/レビュー|review|振り返|复盘|振返/i,
      '项目或动作执行后需要复盘，并决定是否沉淀成方法时。',
      ['实际结果和当初假设差在哪里？','成功/失败来自方法本身，还是条件与执行偏差？','这次经验能成为规则，还是只能作为特定案例？']]
  ];

  function genericQuestions(block){
    if(!block) return false;
    const t=block.textContent||'';
    return GENERIC_QUESTION_SNIPPETS.some(x=>t.includes(x));
  }
  function actualCardText(card){
    const clone=card.cloneNode(true);
    clone.querySelectorAll('.playbook-when,.system-questions,.system-maturity-reason,.playbook-evidence').forEach(x=>x.remove());
    return clone.textContent||'';
  }
  function contextFor(card){
    const text=actualCardText(card);
    for(const [re,when,questions] of CONTEXTS){ if(re.test(text)) return {when,questions}; }
    return null;
  }
  function insertWhen(card,when){
    const core=card.querySelector('.playbook-core'); if(!core)return;
    let box=card.querySelector('.playbook-when');
    if(!box){box=document.createElement('div');box.className='playbook-when';core.insertAdjacentElement('afterend',box);}
    box.innerHTML=`<b>什么时候用</b><span>${ew(when)}</span>`;
  }
  function insertQuestions(card,questions){
    let box=card.querySelector('.system-questions');
    if(!box){
      box=document.createElement('div');box.className='system-questions';
      const when=card.querySelector('.playbook-when'),boundary=card.querySelector('.system-boundary'),cols=card.querySelector('.playbook-columns');
      (boundary||when||card.querySelector('.playbook-core'))?.insertAdjacentElement('afterend',box);
      if(!box.isConnected&&cols)cols.insertAdjacentElement('beforebegin',box);
    }
    box.innerHTML=`<div class="playbook-label">调用前先问自己</div>${questions.map(x=>`<div>→ ${ew(x)}</div>`).join('')}`;
  }
  function postProcessCards(){
    document.querySelectorAll('#playbookList .system-rule-card').forEach(card=>{
      if(card.dataset.contextEnhanced==='1')return;
      const ctx=contextFor(card),when=card.querySelector('.playbook-when'),qs=card.querySelector('.system-questions');
      const currentWhen=when?.querySelector('span')?.textContent?.trim()||'';
      const whenIsGeneric=!currentWhen||GENERIC_WHENS.has(currentWhen);
      const qIsGeneric=!qs||genericQuestions(qs);
      if(ctx){
        if(whenIsGeneric)insertWhen(card,ctx.when);
        if(qIsGeneric)insertQuestions(card,ctx.questions);
      }else{
        if(when&&GENERIC_WHENS.has(currentWhen))when.remove();
        if(qs&&genericQuestions(qs))qs.remove();
      }
      card.dataset.contextEnhanced='1';
    });
  }
  function enhanceMap(){
    const box=document.getElementById('systemMap');if(!box)return;
    const p=box.querySelector('.section-head p');
    if(p)p.textContent='每行左侧是知识形态数量；右侧是成熟度：已验证=多来源支持，有条件=存在边界/冲突，已观察=已有部分证据，假设=仍待验证。';
    box.querySelectorAll('.system-map-row').forEach(row=>{
      const groups=row.querySelectorAll('.system-map-meta');if(groups.length<2)return;
      const labels=['已验证','有条件','已观察','假设'];
      [...groups[1].querySelectorAll('span')].forEach((s,i)=>{
        const n=(s.textContent.match(/\d+/)||['0'])[0];
        if(labels[i])s.textContent=`${labels[i]} ${n}`;
      });
    });
  }
  function updateResultsBar(){
    const bar=document.getElementById('systemResultsBar');if(!bar)return;
    const q=document.getElementById('playbookSearch')?.value.trim()||'';
    const rules=document.querySelectorAll('#playbookList .system-rule-card').length;
    const raw=document.querySelectorAll('#playbookList .raw-recall-item').length;
    if(q)bar.innerHTML=`<div><b>匹配结果</b><span>${ew(q)}</span></div><small>${rules} 条体系规则${raw?` · ${raw} 条原始知识`:''}</small>`;
    else bar.innerHTML=`<div><b>可调用知识</b><span>输入具体问题后会按意图重新排序</span></div><small>${rules} 条当前规则</small>`;
  }
  function applyModeLayout(){
    const results=document.getElementById('systemResults');
    if(results)results.classList.toggle('hidden',typeof systemMode!=='undefined'&&systemMode==='map');
    enhanceMap();postProcessCards();updateResultsBar();
  }

  document.addEventListener('DOMContentLoaded',()=>{
    const list=document.getElementById('playbookList');
    if(list){new MutationObserver(()=>{postProcessCards();updateResultsBar();}).observe(list,{childList:true,subtree:true});}
    const map=document.getElementById('systemMap');
    if(map){new MutationObserver(enhanceMap).observe(map,{childList:true,subtree:true});}
    const search=document.getElementById('playbookSearch');
    search?.addEventListener('input',()=>{
      if(search.value.trim()&&typeof systemMode!=='undefined'&&systemMode!=='invoke'){
        systemMode='invoke';
        if(typeof syncModeButtons==='function')syncModeButtons();
        if(typeof renderAll==='function')renderAll();
      }
      document.querySelector('.system-command')?.classList.toggle('query-active',!!search.value.trim());
      requestAnimationFrame(applyModeLayout);
    });
    document.querySelectorAll('[data-system-mode]').forEach(b=>b.addEventListener('click',()=>requestAnimationFrame(applyModeLayout)));
    const unlock=document.getElementById('unlockWorkSystem');unlock?.addEventListener('click',()=>setTimeout(applyModeLayout,50));
    setTimeout(applyModeLayout,100);
  });
})();
