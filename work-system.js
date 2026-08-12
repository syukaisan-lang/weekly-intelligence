let WS=null,WK=null,SM=null,activeDomain='all',systemMode='invoke';
const $w=id=>document.getElementById(id);
const ew=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const TYPE_LABEL={principle:'Principle · 原则',framework:'Framework · 框架',playbook:'Playbook · 操作',guardrail:'Guardrail · 约束'};
const MAT_LABEL={hypothesis:'Hypothesis · 假设',observed:'Observed · 已观察',validated:'Validated · 已验证',conditional:'Conditional · 有条件成立'};
const MAT_ORDER={validated:4,conditional:3,observed:2,hypothesis:1};

const INTENTS=[
  {id:'career',label:'转职 / Career',re:/转职|転職|换工作|換工作|跳槽|职业|職業|キャリア|面试|面試|面接|offer|オファー|年收|年収|待遇|入职|入職|入社|离职|離職|退職|職務経歴|志望動機|求人|職種/i,
   terms:['转职','転職','换工作','跳槽','职业','職業','キャリア','職務経歴','職歴','面试','面接','面談','interview','offer','オファー','求人','職種','年收','年収','給与','待遇','報酬','入职','入社','离职','退職','志望動機'],domains:['职业 / 转职 / Career','判断与问题定义','执行 / 管理 / Stakeholder']},
  {id:'decision',label:'判断 / 决策',re:/判断|決策|决策|比較|比较|選択|选择|優先|优先|仮説|假设|根拠|依据|目的/i,
   terms:['判断','决策','意思決定','比較','比较','選択','选择','優先順位','优先级','仮説','假设','根拠','依据','目的'],domains:['判断与问题定义']},
  {id:'market',label:'市场 / GTM / Positioning',re:/市场|市場|gtm|定位|ポジショニング|进入市场|参入|競合|竞争|差別|差异化/i,
   terms:['市场','市場','GTM','定位','ポジショニング','参入','競合','竞争','代替','差別化','差异化','market','positioning'],domains:['市场 / GTM / Positioning']},
  {id:'brand',label:'消费者 / 品牌 / CEP',re:/消费者|消費者|生活者|品牌|ブランド|cep|想起|认知|認知|渗透|浸透|购买|購買|用户/i,
   terms:['消费者','消費者','生活者','品牌','ブランド','CEP','想起','认知','認知','渗透率','浸透率','购买','購買','用户','顧客','consumer','brand'],domains:['消费者 / 品牌 / CEP']},
  {id:'product',label:'商品 / 新品上市',re:/新品|新商品|新製品|launch|ローンチ|商品开发|商品開発|sku|定价|価格|价格/i,
   terms:['新品','新商品','新製品','launch','ローンチ','商品开发','商品開発','SKU','价格','価格','定价','pricing'],domains:['商品 / 新品上市','市场 / GTM / Positioning']},
  {id:'ec',label:'EC / Amazon / 流通',re:/amazon|楽天|ec|电商|電商|商城|モール|cvr|转化|転換|コンバージョン|库存|在庫|レビュー|搜索|検索/i,
   terms:['Amazon','楽天','EC','电商','モール','CVR','转化','コンバージョン','库存','在庫','レビュー','搜索','検索','セール','クーポン','流量','traffic'],domains:['EC / Amazon / 流通']},
  {id:'media',label:'广告 / PR / 内容',re:/广告|廣告|広告|pr|媒体|メディア|sns|tiktok|ugc|roas|投放|创意|クリエイティブ|キャンペーン/i,
   terms:['广告','広告','PR','媒体','メディア','SNS','TikTok','UGC','ROAS','投放','创意','クリエイティブ','キャンペーン','reach','リーチ'],domains:['广告 / PR / 内容']},
  {id:'data',label:'数据 / KPI / 测量',re:/数据|數據|データ|分析|kpi|kgi|指标|指標|测量|測定|预测|予測|参数|パラメータ|roi/i,
   terms:['数据','データ','分析','KPI','KGI','指标','指標','测量','測定','预测','予測','参数','パラメータ','ROI','analytics'],domains:['数据 / KPI / 测量']},
  {id:'management',label:'执行 / 管理 / Stakeholder',re:/管理|マネジメント|团队|團隊|チーム|上司|部下|成员|メンバー|沟通|交渉|stakeholder|相关方|関係者|执行|実行/i,
   terms:['管理','マネジメント','团队','チーム','上司','部下','成员','メンバー','沟通','交渉','stakeholder','関係者','执行','実行','レビュー'],domains:['执行 / 管理 / Stakeholder']},
  {id:'ai',label:'AI / 工作效率',re:/\bai\b|人工智能|生成ai|生成AI|llm|agent|智能体|自動化|自动化|效率|効率/i,
   terms:['AI','人工智能','生成AI','LLM','Agent','智能体','自動化','自动化','效率','効率','workflow'],domains:['AI / 工作效率']},
  {id:'customer',label:'客户 / CX / 留存',re:/客户|客戶|カスタマー|cx|客服|問い合わせ|返品|退货|体验|体験|留存|复购|復購|リピート|ltv|离脱|離脱/i,
   terms:['客户','カスタマー','CX','客服','問い合わせ','返品','退货','体验','体験','留存','复购','リピート','LTV','离脱','離脱'],domains:['客户服务 / 体验','消费者 / 品牌 / CEP']},
  {id:'overseas',label:'海外 / 渠道扩张',re:/海外|全球|グローバル|越境|中国|美国|米国|出海|跨境/i,
   terms:['海外','全球','グローバル','越境','中国','美国','米国','出海','跨境'],domains:['海外 / 渠道扩张','市场 / GTM / Positioning']}
];

const ALIAS_GROUPS=[
 ['转职','転職','换工作','跳槽','job change','career','キャリア'],
 ['职业','職業','キャリア','職務経歴','職歴'],
 ['年收','年収','薪资','薪酬','工资','給与','待遇','报酬','報酬','salary','compensation'],
 ['面试','面試','面接','面談','interview'],
 ['离职','離職','退職','辞職','辞める'],
 ['入职','入職','入社','onboarding'],
 ['广告','廣告','広告','ad','media','メディア','投放'],
 ['市场','市場','market'],
 ['竞争','競争','競合','竞争对手','competitor'],
 ['新品','新商品','新製品','launch','ローンチ'],
 ['消费者','消費者','生活者','consumer'],
 ['品牌','品牌认知','品牌認知','ブランド','brand'],
 ['转化','轉化','CVR','コンバージョン','conversion'],
 ['销售','銷售','売上','売上高','sales'],
 ['价格','價格','価格','値段','pricing'],
 ['数据','數據','データ','data','analytics','分析'],
 ['管理','マネジメント','manager','团队','團隊','チーム'],
 ['复购','復購','リピート','repeat','留存','継続','LTV'],
 ['人工智能','AI','生成AI','LLM','Agent','智能体']
];

function normalize(s){return String(s||'').toLowerCase().replace(/[\s　]+/g,' ').trim();}
function basicTokens(text){
  const latin=(String(text||'').match(/[A-Za-z][A-Za-z0-9+./-]{1,}/g)||[]);
  const cjk=(String(text||'').match(/[一-龯ぁ-んァ-ヶ]{2,10}/g)||[]);
  return [...new Set([...latin,...cjk].map(normalize).filter(x=>x.length>1))];
}
function makeQueryContext(q){
  const raw=normalize(q),terms=new Set(basicTokens(q));
  if(raw)terms.add(raw);
  const intents=INTENTS.filter(x=>x.re.test(q));
  intents.forEach(x=>x.terms.forEach(t=>terms.add(normalize(t))));
  ALIAS_GROUPS.forEach(g=>{
    if(g.some(t=>raw.includes(normalize(t))))g.forEach(t=>terms.add(normalize(t)));
  });
  return {raw,intents,terms:[...terms].filter(Boolean).sort((a,b)=>b.length-a.length).slice(0,80)};
}
function noteMap(){const m=new Map();(WS?.notes||[]).forEach(n=>m.set(n.id,n));return m;}
function knowledgeMap(){const m=new Map();(WK?.items||[]).forEach(n=>m.set(n.id,n));return m;}
function legacyRules(){
  if((WS?.rules||[]).length)return WS.rules.map(r=>({id:r.id,type:r.steps?.length>=3?'playbook':'principle',domain:r.domain||'其他',title:r.title,decision_rule:r.principle,when:r.when,not_when:[],questions:[],steps:r.steps||[],metrics:r.metrics||[],traps:r.traps||[],tensions:r.tensions||[],maturity:r.confidence==='high'?'observed':'hypothesis',maturity_reason:'旧版规则，等待统一体系重建',private_evidence_ids:r.evidence_ids||[],private_source_kinds:[],notion_evidence:[]}));
  return (WS?.candidate_principles||[]).map(x=>({id:x.id,type:'principle',domain:x.domains?.[0]?.name||'其他',title:x.title,decision_rule:x.detail,when:'同类问题发生时先核对前提。',not_when:[],questions:[],steps:[],metrics:[],traps:[],tensions:[],maturity:'hypothesis',maturity_reason:'单条笔记候选，等待进一步验证',private_evidence_ids:x.evidence_ids||[],private_source_kinds:x.source_kinds||[],notion_evidence:[]}));
}
function allRules(){return (SM?.rules||[]).length?SM.rules:legacyRules();}
function domains(){const c={};allRules().forEach(r=>c[r.domain||'其他']=(c[r.domain||'其他']||0)+1);return Object.entries(c).sort((a,b)=>b[1]-a[1]);}
function ruleText(r){return `${r.domain||''} ${r.title||''} ${r.decision_rule||''} ${r.when||''} ${(r.not_when||[]).join(' ')} ${(r.questions||[]).join(' ')} ${(r.steps||[]).join(' ')} ${(r.metrics||[]).join(' ')} ${(r.traps||[]).join(' ')} ${(r.tensions||[]).join(' ')} ${(r.keywords||[]).join(' ')}`;}
function containsTerm(text,term){return term.length>=2&&normalize(text).includes(term);}
function queryScore(r,ctx){
  if(!ctx?.raw)return (MAT_ORDER[r.maturity]||0)*.15+(r.type==='framework'?.15:r.type==='playbook'?.1:0);
  const title=normalize(r.title),domain=normalize(r.domain),when=normalize([r.when,...(r.questions||[])].join(' ')),body=normalize(ruleText(r));
  let score=0,seen=0;
  for(const t of ctx.terms){
    if(t.length<2)continue;
    let add=0;
    if(title.includes(t))add=7;
    else if(domain.includes(t))add=4.5;
    else if(when.includes(t))add=3.3;
    else if(body.includes(t))add=1.7;
    if(add){score+=add;seen++;}
    if(seen>=10)break;
  }
  for(const it of ctx.intents){
    if((it.domains||[]).includes(r.domain))score+=7.5;
    if(it.terms.some(t=>title.includes(normalize(t))))score+=3;
  }
  if(r.maturity==='validated')score+=.5;
  return score;
}
function sourceEvidence(r){const m=noteMap();return (r.private_evidence_ids||[]).map(id=>m.get(id)).filter(Boolean).slice(0,10);}
function notionEvidence(r){const m=knowledgeMap();return (r.notion_evidence||[]).map(x=>({meta:x,a:m.get(x.id)})).filter(x=>x.a).slice(0,6);}
function noteText(n){return `${n.source_label||''} ${n.section||''} ${n.title||''} ${n.text||''} ${(n.domains||[]).map(x=>x.name||'').join(' ')}`;}
function knowledgeText(a){const comments=(a.comments||[]).map(c=>c.text||'').join(' ');return `${a.category||''} ${a.title||''} ${a.summary||''} ${a.page_body||''} ${(a.topics||[]).join(' ')} ${comments}`;}
function rawScore(title,body,domains,ctx){
  const nt=normalize(title),nb=normalize(body),nd=normalize(domains);let score=0,hits=0;
  for(const t of ctx.terms){
    if(t.length<2)continue;
    let add=0;
    if(nt.includes(t))add=7;
    else if(nd.includes(t))add=4;
    else if(nb.includes(t))add=1.8;
    if(add){score+=add;hits++;}
    if(hits>=10)break;
  }
  for(const it of ctx.intents){if(it.terms.some(t=>nb.includes(normalize(t))))score+=2.5;}
  return score;
}
function excerpt(text,ctx,max=360){
  const original=String(text||'').replace(/\s+/g,' ').trim();if(original.length<=max)return original;
  const low=normalize(original);let pos=-1;
  for(const t of ctx.terms){const p=low.indexOf(t);if(p>=0&&(pos<0||p<pos))pos=p;}
  if(pos<0)return original.slice(0,max)+'…';
  const start=Math.max(0,pos-Math.floor(max*.28)),end=Math.min(original.length,start+max);
  return (start?'…':'')+original.slice(start,end)+(end<original.length?'…':'');
}
function rawResults(ctx,excluded=new Set(),limit=10){
  if(!ctx.raw)return [];
  const rows=[];
  for(const n of (WS?.notes||[])){
    if(excluded.has('n:'+n.id))continue;
    const d=(n.domains||[]).map(x=>x.name||'').join(' '),s=rawScore(n.title||'',noteText(n),d,ctx);
    if(s>0)rows.push({kind:'private',id:n.id,score:s,title:n.title||n.section||'工作笔记',subtitle:`${n.source_label||'私人资料'} · ${n.section||''}`,text:n.text||'',note:n});
  }
  for(const a of (WK?.items||[])){
    if(excluded.has('k:'+a.id))continue;
    const s=rawScore(a.title||'',knowledgeText(a),`${a.category||''} ${(a.topics||[]).join(' ')}`,ctx);
    if(s>0)rows.push({kind:'notion',id:a.id,score:s,title:a.title||'Notion Knowledge',subtitle:`Notion · ${a.category||'未分类'}`,text:a.summary||a.page_body||'',article:a});
  }
  return rows.sort((a,b)=>b.score-a.score).slice(0,limit);
}
function sourceUrl(n){
  if(!n?.file_id)return'';
  return n.source_kind==='field_manual'?`https://docs.google.com/document/d/${encodeURIComponent(n.file_id)}/edit`:`https://docs.google.com/spreadsheets/d/${encodeURIComponent(n.file_id)}/edit`;
}
function renderMetrics(){
  const rules=allRules(),m=rules.reduce((o,r)=>(o[r.maturity]=(o[r.maturity]||0)+1,o),{}),vals=[['体系规则',rules.length,'统一后的可调用知识'],['已验证',m.validated||0,'多来源互相支持'],['有条件成立',m.conditional||0,'存在边界/冲突'],['待验证',(m.hypothesis||0)+(m.observed||0),'继续用实践与新知识验证']];
  $w('workSystemMetrics').innerHTML=vals.map(v=>`<div class="metric"><div class="metric-label">${v[0]}</div><div class="metric-value">${v[1]}</div><div class="metric-sub">${v[2]}</div></div>`).join('');
}
function renderSources(){
  const labels={experience:'工作经验',book:'读书笔记',field_manual:'EC/Amazon实战'};
  const cards=(WS?.sources||[]).map(s=>`<div class="source-layer"><b>${ew(labels[s.kind]||s.label||s.name)}</b><span>${ew(s.name||s.label||'')}</span><small>${s.modifiedTime?`更新 ${ew(String(s.modifiedTime).slice(0,10))}`:'等待首次同步'}</small></div>`);
  cards.push(`<div class="source-layer"><b>Notion Knowledge</b><span>外部文章、正文、Comment</span><small>${WK?.meta?.snapshot_at?`更新 ${ew(String(WK.meta.snapshot_at).slice(0,10))}`:'未解锁'}</small></div>`);
  $w('workSystemSources').innerHTML=cards.join('');
}
function renderChips(){
  const ds=domains();
  $w('scenarioChips').innerHTML=`<button class="scenario-chip ${activeDomain==='all'?'active':''}" data-domain="all">全部</button>`+ds.map(([d,n])=>`<button class="scenario-chip ${activeDomain===d?'active':''}" data-domain="${ew(d)}">${ew(d)} · ${n}</button>`).join('');
  $w('scenarioChips').querySelectorAll('[data-domain]').forEach(b=>b.onclick=()=>{activeDomain=b.dataset.domain;renderChips();renderAll();});
}
function renderHealth(){
  const rules=allRules(),tc={},mc={};rules.forEach(r=>{tc[r.type]=(tc[r.type]||0)+1;mc[r.maturity]=(mc[r.maturity]||0)+1;});
  const gaps=SM?.gaps||[];
  $w('systemHealth').innerHTML=`<div class="section-head slim"><div><h2>体系健康度</h2><p class="muted small">目标不是规则越多越好，而是减少“没有边界、没有证据、不能执行”的知识。</p></div><span class="pill">${SM?.meta?.synthesis==='openai'?'跨来源综合':'基础结构模式'}</span></div><div class="system-health-grid"><div><b>知识形态</b><p>${Object.entries(TYPE_LABEL).map(([k,v])=>`${v} ${tc[k]||0}`).join('　')}</p></div><div><b>成熟度</b><p>Validated ${mc.validated||0}　Conditional ${mc.conditional||0}　Observed ${mc.observed||0}　Hypothesis ${mc.hypothesis||0}</p></div><div><b>当前待验证</b><p>${gaps.length||rules.filter(r=>r.maturity!=='validated').length} 项；Weekly 优先找补证据、补边界或反驳现有判断的内容。</p></div></div>`;
}
function renderMap(){
  const box=$w('systemMap');if(systemMode!=='map'){box.classList.add('hidden');return;}box.classList.remove('hidden');
  const rows=domains().map(([d,n])=>{const rs=allRules().filter(r=>r.domain===d),types={},mats={};rs.forEach(r=>{types[r.type]=(types[r.type]||0)+1;mats[r.maturity]=(mats[r.maturity]||0)+1;});return `<button class="system-map-row" type="button" data-map-domain="${ew(d)}"><div><b>${ew(d)}</b><span>${n} 条</span></div><div class="system-map-meta"><span>原则 ${types.principle||0}</span><span>框架 ${types.framework||0}</span><span>Playbook ${types.playbook||0}</span><span>约束 ${types.guardrail||0}</span></div><div class="system-map-meta"><span>✓ ${mats.validated||0}</span><span>△ ${mats.conditional||0}</span><span>○ ${mats.observed||0}</span><span>· ${mats.hypothesis||0}</span></div></button>`;}).join('');
  box.innerHTML=`<div class="section-head slim"><div><h2>体系地图</h2><p class="muted small">看知识结构是否偏科；点击领域进入具体规则。</p></div></div><div class="system-map-list">${rows}</div>`;
  box.querySelectorAll('[data-map-domain]').forEach(b=>b.onclick=()=>{activeDomain=b.dataset.mapDomain;systemMode='invoke';syncModeButtons();renderChips();renderAll();$w('playbookList').scrollIntoView({behavior:'smooth'});});
}
function arrayBlock(label,arr){if(!arr?.length)return'';return `<div class="playbook-col"><div class="playbook-label">${label}</div><ul>${arr.map(x=>`<li>${ew(x)}</li>`).join('')}</ul></div>`;}
function renderIntentHint(ctx,ruleCount,rawCount){
  const box=$w('queryIntentHint');if(!box)return;
  if(!ctx.raw){box.classList.add('hidden');box.innerHTML='';return;}
  const labels=ctx.intents.map(x=>x.label);
  const focus=labels.length?`理解为：<b>${labels.map(ew).join(' + ')}</b>`:'已做中日同义词与相关概念扩展';
  box.innerHTML=`${focus}<span>${ruleCount} 条体系规则 · ${rawCount} 条原始知识召回</span>`;box.classList.remove('hidden');
}
function renderRaw(rows){
  if(!rows.length)return'';
  return `<section class="raw-recall"><div class="section-head slim"><div><h2>相关原始知识</h2><p class="muted small">这些内容与当前问题有关，但尚未全部整理成稳定规则。先召回，后续可进入体系化。</p></div></div><div class="raw-recall-list">${rows.map(x=>{
    if(x.kind==='notion')return `<a class="raw-recall-item" href="knowledge.html?open=${encodeURIComponent(x.id||'')}"><div><span class="raw-kind">Notion</span><b>${ew(x.title)}</b><small>${ew(x.subtitle)} · 匹配 ${x.score.toFixed(1)}</small></div><p>${ew(excerpt(x.text,makeQueryContext($w('playbookSearch')?.value||''),300))}</p></a>`;
    const url=sourceUrl(x.note);return `<div class="raw-recall-item"><div><span class="raw-kind">私人资料</span><b>${ew(x.title)}</b><small>${ew(x.subtitle)} · 匹配 ${x.score.toFixed(1)}</small></div><p>${ew(excerpt(x.text,makeQueryContext($w('playbookSearch')?.value||''),300))}</p>${url?`<a class="raw-source-link" href="${ew(url)}" target="_blank" rel="noopener noreferrer">打开原资料 ↗</a>`:''}</div>`;
  }).join('')}</div></section>`;
}
function renderRules(){
  const q=($w('playbookSearch')?.value||'').trim(),ctx=makeQueryContext(q);let rows=allRules().filter(r=>activeDomain==='all'||r.domain===activeDomain);
  if(systemMode==='verify')rows=rows.filter(r=>['hypothesis','conditional','observed'].includes(r.maturity));
  rows=rows.map(r=>({r,score:queryScore(r,ctx)})).filter(x=>!ctx.raw||x.score>0).sort((a,b)=>b.score-a.score||(MAT_ORDER[b.r.maturity]||0)-(MAT_ORDER[a.r.maturity]||0));
  const topRules=rows.map(x=>x.r),excluded=new Set();
  topRules.slice(0,12).forEach(r=>{(r.private_evidence_ids||[]).forEach(id=>excluded.add('n:'+id));(r.notion_evidence||[]).forEach(x=>excluded.add('k:'+x.id));});
  const raw=ctx.raw?rawResults(ctx,excluded,topRules.length<3?12:7):[];
  renderIntentHint(ctx,topRules.length,raw.length);
  const ruleHtml=topRules.map((r,i)=>{
    const se=sourceEvidence(r),ne=notionEvidence(r),match=ctx.raw?queryScore(r,ctx):0;
    return `<article class="card playbook-card system-rule-card"><div class="playbook-card-head"><div><div class="system-rule-meta"><span class="system-type ${ew(r.type)}">${ew(TYPE_LABEL[r.type]||r.type)}</span><span>${ew(r.domain||'其他')}</span><span class="system-maturity ${ew(r.maturity)}">${ew(MAT_LABEL[r.maturity]||r.maturity)}</span></div><h2><span class="playbook-num">${String(i+1).padStart(2,'0')}</span>${ew(r.title)}</h2></div><span class="evidence-count">${se.length} 私人依据 · ${ne.length} 外部证据${ctx.raw&&match?` · 匹配 ${match.toFixed(1)}`:''}</span></div>
      <div class="playbook-core"><div class="playbook-label">我的判断</div><p>${ew(r.decision_rule||'')}</p></div>
      ${r.when?`<div class="playbook-when"><b>什么时候用</b><span>${ew(r.when)}</span></div>`:''}
      ${(r.not_when||[]).length?`<div class="system-boundary"><b>不适用 / 先别套用</b><ul>${r.not_when.map(x=>`<li>${ew(x)}</li>`).join('')}</ul></div>`:''}
      ${(r.questions||[]).length?`<div class="system-questions"><div class="playbook-label">调用前先问自己</div>${r.questions.map(x=>`<div>→ ${ew(x)}</div>`).join('')}</div>`:''}
      <div class="playbook-columns">${arrayBlock('怎么做',r.steps)}${arrayBlock('看什么指标',r.metrics)}${arrayBlock('避免什么',r.traps)}</div>
      ${(r.tensions||[]).length?`<div class="system-tension"><b>⚖ 冲突 / 边界 / 待验证</b>${r.tensions.map(x=>`<div>${ew(x)}</div>`).join('')}</div>`:''}
      <div class="system-maturity-reason">成熟度依据：${ew(r.maturity_reason||'等待统一模型重新计算')}</div>
      <details class="playbook-evidence"><summary>查看依据：工作经验 / 读书 / 实战 / Notion</summary><div class="evidence-sources">${se.map(n=>`<div class="system-source-note"><b>${ew(n.source_label)} · ${ew(n.section)}</b><p>${ew((n.text||'').length>520?n.text.slice(0,520)+'…':n.text||'')}</p></div>`).join('')}${ne.map(x=>`<a class="playbook-source" href="knowledge.html?open=${encodeURIComponent(x.a.id||'')}" target="_self"><span>${ew(x.a.title)}</span><small>Notion · ${ew(x.a.category||'未分类')} · ${ew((x.meta.hits||[]).slice(0,4).join(' / '))}${x.meta.has_comment?' · 有Comment':''}</small></a>`).join('')}</div></details></article>`;
  }).join('');
  if(!ctx.raw)$w('playbookList').innerHTML=ruleHtml||'<div class="empty"><h3>暂无体系规则</h3><p>等待统一体系生成。</p></div>';
  else $w('playbookList').innerHTML=(ruleHtml||'<div class="empty compact"><h3>还没有形成对应的稳定规则</h3><p>下面先从原始工作经验、读书笔记和 Notion 中召回相关内容。</p></div>')+renderRaw(raw);
}
function syncModeButtons(){document.querySelectorAll('[data-system-mode]').forEach(b=>b.classList.toggle('active',b.dataset.systemMode===systemMode));}
function renderAll(){renderMetrics();renderHealth();renderMap();renderRules();}
async function unlock(){
  try{
    WS=await loadWorkSystemData({prompt:true});if(WS.locked){$w('workSystemStatus').textContent='Work System 尚未生成或未解锁。';return;}
    WK=await loadKnowledgeData({prompt:false});if(WK?.locked)WK=null;
    try{SM=await loadSystemModelData({prompt:false});if(SM?.locked)SM=null;}catch(e){SM=null;}
    $w('workSystemGate').classList.add('hidden');$w('workSystemContent').classList.remove('hidden');$w('lockWorkSystem')?.classList.remove('hidden');
    $w('workSystemStatus').textContent=SM?.meta?.snapshot_at?`统一体系 ${new Date(SM.meta.snapshot_at).toLocaleString('ja-JP')} · ${SM.meta.synthesis==='openai'?'跨来源综合':'基础结构'}`:`Google/Notion 已解锁 · 原始知识可直接意图检索`;
    renderSources();renderChips();renderAll();
  }catch(e){console.error(e);$w('workSystemStatus').textContent='读取失败：'+e.message;}
}
document.addEventListener('DOMContentLoaded',()=>{
  $w('unlockWorkSystem')?.addEventListener('click',unlock);
  $w('playbookSearch')?.addEventListener('input',renderRules);
  $w('lockWorkSystem')?.addEventListener('click',()=>lockPrivateData(true));
  document.querySelectorAll('[data-system-mode]').forEach(b=>b.addEventListener('click',()=>{systemMode=b.dataset.systemMode;syncModeButtons();renderAll();}));
});
