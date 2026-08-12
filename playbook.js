const PLAYBOOKS=[
  {
    id:'gtm',scenario:'新品 / GTM',title:'先找“进入购买的场景”，再谈卖点',
    when:'新品上市、进入新市场、增长停滞、品牌很难被想起时。',
    core:'增长不是只在比较页抢转化。消费者产生需求的那一刻，能否进入候选集合更关键。先识别真实的 Category Entry Points（CEPs）和触发场景，再决定卖点、渠道与内容。',
    steps:['列出用户“什么时候会开始找这个品类”的具体情境，而不是先写品牌卖点。','把情境按规模、竞争强度、自身优势、可触达性排序，优先2–4个入口。','为每个入口定义：要形成的品牌联想、对应内容、渠道和证明素材。','上线后分别看入口覆盖宽度与第一想起深度，不只看短期CV。'],
    metrics:['CEP覆盖数','第一想起率','品牌搜索量','新客占比','入口→购买转化'],
    traps:['把企业想讲的卖点当成用户真实入口','只盯最后一步CV导致持续收割存量','同时占太多入口，资源被摊薄'],
    patterns:/CEP|想起|カテゴリー・エントリー|第一想起|新市場|GTM|ポジショニング|市場参入/i
  },
  {
    id:'brand',scenario:'品牌增长',title:'品牌建设要管理“想起的宽度 × 深度”',
    when:'品牌认知有了但销量不增长、广告很多却难以形成首选、需要做年度品牌策略时。',
    core:'品牌资产不是抽象好感度，而是消费者在更多购买场景下能否想起你，以及在关键场景下是否更早想起你。品牌传播应围绕具体入口反复强化一致联想。',
    steps:['把品牌增长拆成“更多场景被想起”和“关键场景排名更靠前”。','先测当前各CEP的品牌想起地图，找空白、弱势和优势入口。','传播内容保持核心联想稳定，但根据不同CEP改变情境表达。','品牌指标与销售指标并行，避免只用CTR/CVR评价长期建设。'],
    metrics:['提示/非提示想起','第一想起','CEP渗透','品牌搜索','新增购买者','长期销售增量'],
    traps:['把“喜欢品牌”误当成“购买时会想到品牌”','频繁换传播主题造成记忆无法累积','品牌广告完全用短期ROAS判断'],
    patterns:/ブランド|想起|CEP|認知|第一想起|ロイヤル|浸透率|ブランド指標/i
  },
  {
    id:'ec',scenario:'EC / 转化',title:'转化低时，先定位旅程中的“离脱点”',
    when:'CVR下降、复购差、广告加预算但销售不动、团队第一反应是研究竞品时。',
    core:'竞争分析只能告诉你外部发生了什么；真正导致顾客离开的原因，往往藏在自己的购买旅程和数据里。先找离脱点，再决定是否需要看竞争。',
    steps:['画出发现→理解→比较→购买→使用→复购的关键节点。','用搜索、访问、点击、加购、结账、退货、客服、复购数据找异常掉点。','对最大掉点提出3个以内可验证假设，优先修复高流量×高损失节点。','修复后做前后对照或实验，再决定是否扩大。'],
    metrics:['节点转化率','加购率','结账完成率','退货/取消率','复购率','流失用户规模'],
    traps:['一上来做竞品功能表','同时优化所有页面而无法识别因果','只看平均CVR，不拆新老客/渠道/商品'],
    patterns:/離脱|カスタマージャーニー|CVR|コンバージョン|購入|購買|EC売上|離脱ポイント|自社データ/i
  },
  {
    id:'tiktok',scenario:'内容电商 / TikTok Shop',title:'短视频负责“发现”，直播负责“集中转化”',
    when:'做TikTok Shop、短视频电商、直播电商或需要从内容端获取新客时。',
    core:'内容电商不是单一素材打法。短视频创造新用户发现和兴趣，直播快速拉升GMV；广告和Creator管理用于放大已经验证的内容与人群。',
    steps:['短视频持续供给，围绕潜在人群的痛点和自我代入设计创意。','先优化前三秒Hook，再看共感/留存，再展示Before/After等价值证明。','直播承担集中成交与活动爆发，不替代长期发现。','用广告放大已验证素材，用Creator扩充内容供给与第三方可信度。'],
    metrics:['3秒留存','完播率','商品点击率','直播进房率','GMV/小时','Creator产出效率','新客占比'],
    traps:['只追热点不沉淀胜利模板','直播和短视频用同一套创意逻辑','广告先于内容验证，导致付费放大低效素材'],
    patterns:/TikTok Shop|ショート動画|ライブ配信|クリエイター|GMV|UGC|SNS/i
  },
  {
    id:'media',scenario:'广告 / Media',title:'没有“万能最好渠道”，预算要和商品任务匹配',
    when:'制定媒体预算、比较品牌广告与效果广告、ROAS下降、需要重新分配渠道时。',
    core:'媒体效果取决于产品类型、购买周期、预算规模、目标阶段和创意质量。先明确任务，再决定Reach、Frequency、搜索承接和转化媒体的组合。',
    steps:['先确定本次预算解决的是新增触达、想起强化、需求承接还是成交。','按人群规模和购买周期估算需要的Reach/Frequency，而非复制行业配比。','品牌触达与搜索/EC承接要联动，避免上层制造需求但下层接不住。','把创意作为独立变量评估，不把素材问题误判为渠道问题。'],
    metrics:['增量Reach','有效Frequency','品牌搜索增量','自然流量','增量CV','CAC/ROAS','创意疲劳'],
    traps:['只用末次点击评价所有媒体','把高ROAS渠道无限加预算','渠道与创意同时变化导致无法判断原因'],
    patterns:/広告効果|メディア|広告|リーチ|フリークエンシー|予算|ROAS|CPA|メディア投資/i
  },
  {
    id:'ai',scenario:'AI Search / AI Commerce',title:'AI时代要优化“被正确提及并进入候选”的概率',
    when:'AEO/AIO、生成AI搜索、AI购物助手、Agentic Commerce开始影响流量与购买时。',
    core:'AI可能把搜索、比较甚至购买代理化。目标不只是传统SEO排名，而是让品牌在AI回答中被正确理解、被高质量提及，并能把用户顺利带到可购买信息。',
    steps:['先监测核心购买问题中，AI是否提到品牌、如何描述、与谁一起出现。','补齐官网/商品页的结构化事实：适用场景、差异、价格、规格、证据、FAQ。','把消费者真实问题和CEP写入内容，而不是堆泛关键词。','单独追踪AI来源的访问、辅助转化与最终购买，逐步建立AI型购买漏斗。'],
    metrics:['AI提及率','提及准确度/质量','AI来源流量','AI辅助CV','品牌×问题覆盖','可抓取商品信息完整度'],
    traps:['把AEO当成SEO换名字','只追“被提及”不看提及内容是否正确','没有可验证的一方信息，完全依赖第三方内容'],
    patterns:/AEO|AIO|GEO|AI検索|AI型購買|AI経由|エージェンティック|Agentic|AIショッピング/i
  },
  {
    id:'consumer',scenario:'消费者研究',title:'研究的目标不是“知道更多”，而是缩小决策空间',
    when:'做消费者访谈、问卷、N=1、购买行为分析、产品定位和需求验证时。',
    core:'好的消费者研究最终要改变一个决策：选谁、解决什么、在哪个场景出现、用什么信息说服。优先寻找行为差异和离脱差异，而不是堆人口属性。',
    steps:['先写出要做的业务决策，再定义研究问题。','行为数据先找差异，定性研究解释“为什么”，定量研究验证规模。','把“说什么”与“实际做什么”分开记录，购买/搜索/离脱行为优先。','输出必须落到可执行假设：人群×场景×障碍×触发因素。'],
    metrics:['关键行为差异','场景发生率','障碍发生率','假设验证率','研究结论被行动采用率'],
    traps:['先发问卷后想业务问题','用年龄性别代替需求场景','把单个用户故事直接外推为市场结论'],
    patterns:/消費者|生活者|インサイト|顧客理解|調査|アンケート|N.?=.?1|購買行動|ユーザー/i
  },
  {
    id:'execution',scenario:'战略 / KPI / 执行',title:'把战略翻译成可计算的行为变化',
    when:'战略听起来正确但团队不知道下一步做什么、KPI很多但互相无关、项目推进停滞时。',
    core:'战略要落地，必须变成“哪个人群的哪个行为，要从A变到B，由什么动作驱动”。指标不是汇报装饰，而是验证因果链是否成立。',
    steps:['把目标写成业务结果：销售、用户、利润或份额。','向前拆成关键行为：曝光→想起→访问→购买→复购等。','每个行为只选1–2个真正能驱动结果的指标，并明确负责人。','每周复盘“假设→动作→指标变化→下一步”，而不是只报完成率。'],
    metrics:['北极星结果指标','关键行为指标','领先指标','实验命中率','行动关闭周期'],
    traps:['KPI数量过多','把可测量当成重要','目标、动作、指标之间没有因果关系'],
    patterns:/KPI|KGI|算数思考|戦略|組織|実行|目標|効果測定|マネジメント/i
  }
];

let PB_K=null,activeScenario='all';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
function knowledgeText(a){return `${a.title||''} ${a.summary||''} ${a.page_body||''} ${(a.comments||[]).map(c=>c.text||'').join(' ')}`;}
function evidenceFor(p){if(!PB_K||PB_K.locked)return[];return (PB_K.items||[]).filter(a=>p.patterns.test(knowledgeText(a))).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,6);}
function renderScenarios(){const box=$('scenarioChips');box.innerHTML=`<button class="scenario-chip ${activeScenario==='all'?'active':''}" data-scenario="all">全部</button>`+PLAYBOOKS.map(p=>`<button class="scenario-chip ${activeScenario===p.id?'active':''}" data-scenario="${p.id}">${esc(p.scenario)}</button>`).join('');box.querySelectorAll('[data-scenario]').forEach(b=>b.onclick=()=>{activeScenario=b.dataset.scenario;renderScenarios();renderPlaybooks();});}
function listHtml(label,arr){return `<div class="playbook-col"><div class="playbook-label">${label}</div><ul>${arr.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;}
function renderPlaybooks(){const q=($('playbookSearch')?.value||'').trim().toLowerCase();const rows=PLAYBOOKS.filter(p=>(activeScenario==='all'||p.id===activeScenario)&&(!q||`${p.scenario} ${p.title} ${p.when} ${p.core} ${p.steps.join(' ')} ${p.metrics.join(' ')}`.toLowerCase().includes(q)));$('playbookList').innerHTML=rows.map((p,i)=>{const ev=evidenceFor(p);return `<article class="playbook-card card"><div class="playbook-card-head"><div><span class="playbook-num">${String(i+1).padStart(2,'0')}</span><span class="pill">${esc(p.scenario)}</span><h2>${esc(p.title)}</h2></div><div class="evidence-count">${PB_K&&PB_K.locked?'🔐 解锁后显示证据':`${ev.length} 条相关证据`}</div></div><div class="playbook-when"><b>什么时候用</b><span>${esc(p.when)}</span></div><div class="playbook-core"><div class="playbook-label">核心判断</div><p>${esc(p.core)}</p></div><div class="playbook-columns">${listHtml('执行步骤',p.steps)}${listHtml('观测指标',p.metrics)}${listHtml('常见误区',p.traps)}</div><details class="playbook-evidence"><summary>查看你知识库里的证据 ${ev.length?`· ${ev.length}篇`:''}</summary><div>${PB_K&&PB_K.locked?'<p class="muted">Knowledge 尚未解锁。刷新页面后输入 Dashboard 密码即可匹配 Notion 证据。</p>':ev.length?ev.map(a=>`<a class="playbook-source" href="knowledge.html?id=${encodeURIComponent(a.id||'')}"><span>${esc(a.title)}</span><small>${esc(a.category||'未分类')} · ${esc(a.date||'')}</small></a>`).join(''):'<p class="muted">当前知识库里没有足够强的匹配证据；这个规则应保持低置信度，等待后续资料补强。</p>'}</div></details></article>`}).join('')||'<div class="empty"><h3>没有匹配的 Playbook</h3><p>换一个场景或搜索词。</p></div>';}
async function init(){renderScenarios();renderPlaybooks();try{PB_K=await loadKnowledgeData({prompt:true});const snap=PB_K?.meta?.snapshot_at;$('playbookUpdated').textContent=PB_K.locked?'Knowledge 未解锁':snap?`证据同步 ${new Date(snap).toLocaleString('ja-JP')}`:'Knowledge 已加载';renderPlaybooks();}catch(e){$('playbookUpdated').textContent='Knowledge 读取失败';console.error(e)}}
$('playbookSearch')?.addEventListener('input',renderPlaybooks);init();
