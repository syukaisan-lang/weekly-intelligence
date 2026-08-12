let WS=null,WK=null,SM=null,activeDomain='all',systemMode='invoke';
const $w=id=>document.getElementById(id);
const ew=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const TYPE_LABEL={principle:'Principle · 原则',framework:'Framework · 框架',playbook:'Playbook · 操作',guardrail:'Guardrail · 约束'};
const MAT_LABEL={hypothesis:'Hypothesis · 假设',observed:'Observed · 已观察',validated:'Validated · 已验证',conditional:'Conditional · 有条件成立'};
const MAT_ORDER={validated:4,conditional:3,observed:2,hypothesis:1};
function noteMap(){const m=new Map();(WS?.notes||[]).forEach(n=>m.set(n.id,n));return m;}
function knowledgeMap(){const m=new Map();(WK?.items||[]).forEach(n=>m.set(n.id,n));return m;}
function tokens(text){return [...new Set((String(text||'').match(/[A-Za-z][A-Za-z0-9+./-]{2,}|[一-龯ぁ-んァ-ヶ]{2,12}/g)||[]).map(x=>x.toLowerCase()).filter(x=>!['什么','怎么','这个','ため','こと','する','ある','いる','ます','です','これ','その','から','より','など','工作','问题','the','and','with'].includes(x)))].slice(0,100);}
function legacyRules(){
  if((WS?.rules||[]).length)return WS.rules.map(r=>({id:r.id,type:r.steps?.length>=3?'playbook':'principle',domain:r.domain||'其他',title:r.title,decision_rule:r.principle,when:r.when,not_when:[],questions:[],steps:r.steps||[],metrics:r.metrics||[],traps:r.traps||[],tensions:r.tensions||[],maturity:r.confidence==='high'?'observed':'hypothesis',maturity_reason:'旧版规则，等待统一体系重建',private_evidence_ids:r.evidence_ids||[],private_source_kinds:[],notion_evidence:[]}));
  return (WS?.candidate_principles||[]).map(x=>({id:x.id,type:'principle',domain:x.domains?.[0]?.name||'其他',title:x.title,decision_rule:x.detail,when:'同类问题发生时先核对前提。',not_when:[],questions:[],steps:[],metrics:[],traps:[],tensions:[],maturity:'hypothesis',maturity_reason:'单条笔记候选，等待进一步验证',private_evidence_ids:x.evidence_ids||[],private_source_kinds:x.source_kinds||[],notion_evidence:[]}));
}
function allRules(){return (SM?.rules||[]).length?SM.rules:legacyRules();}
function domains(){const c={};allRules().forEach(r=>c[r.domain||'其他']=(c[r.domain||'其他']||0)+1);return Object.entries(c).sort((a,b)=>b[1]-a[1]);}
function ruleText(r){return `${r.domain||''} ${r.title||''} ${r.decision_rule||''} ${r.when||''} ${(r.not_when||[]).join(' ')} ${(r.questions||[]).join(' ')} ${(r.steps||[]).join(' ')} ${(r.metrics||[]).join(' ')} ${(r.traps||[]).join(' ')} ${(r.tensions||[]).join(' ')} ${(r.keywords||[]).join(' ')}`;}
function queryScore(r,q){
  if(!q)return (MAT_ORDER[r.maturity]||0)*.15+(r.type==='framework'?.15:r.type==='playbook'?.1:0);
  const qs=tokens(q),body=ruleText(r).toLowerCase(),title=(r.title||'').toLowerCase(),domain=(r.domain||'').toLowerCase();let score=0;
  qs.forEach(t=>{if(title.includes(t))score+=5;else if(domain.includes(t))score+=3;else if(body.includes(t))score+=1.5;});
  const phrases=[r.when,...(r.questions||[])].join(' ').toLowerCase();qs.forEach(t=>{if(phrases.includes(t))score+=1.2;});
  return score;
}
function sourceEvidence(r){const m=noteMap();return (r.private_evidence_ids||[]).map(id=>m.get(id)).filter(Boolean).slice(0,10);}
function notionEvidence(r){const m=knowledgeMap();return (r.notion_evidence||[]).map(x=>({meta:x,a:m.get(x.id)})).filter(x=>x.a).slice(0,6);}
function renderMetrics(){
  const rules=allRules(),m=rules.reduce((o,r)=>(o[r.maturity]=(o[r.maturity]||0)+1,o),{}),vals=[['体系规则',rules.length,'统一后的可调用知识'],['已验证',m.validated||0,'多来源互相支持'],['有条件成立',m.conditional||0,'存在边界/冲突'],['待验证',(m.hypothesis||0)+(m.observed||0),'继续用实践与新知识验证']];
  $w('workSystemMetrics').innerHTML=vals.map(v=>`<div class="metric"><div class="metric-label">${v[0]}</div><div class="metric-value">${v[1]}</div><div class="metric-sub">${v[2]}</div></div>`).join('');
}
function renderSources(){const labels={experience:'工作经验',book:'读书笔记',field_manual:'EC/Amazon实战'};const cards=(WS?.sources||[]).map(s=>`<div class="source-layer"><b>${ew(labels[s.kind]||s.label||s.name)}</b><span>${ew(s.name||s.label||'')}</span><small>${s.modifiedTime?`更新 ${ew(String(s.modifiedTime).slice(0,10))}`:'等待首次同步'}</small></div>`);cards.push(`<div class="source-layer"><b>Notion Knowledge</b><span>外部文章、正文、Comment</span><small>${WK?.meta?.snapshot_at?`更新 ${ew(String(WK.meta.snapshot_at).slice(0,10))}`:'未解锁'}</small></div>`);$w('workSystemSources').innerHTML=cards.join('');}
function renderChips(){const ds=domains();$w('scenarioChips').innerHTML=`<button class="scenario-chip ${activeDomain==='all'?'active':''}" data-domain="all">全部</button>`+ds.map(([d,n])=>`<button class="scenario-chip ${activeDomain===d?'active':''}" data-domain="${ew(d)}">${ew(d)} · ${n}</button>`).join('');$w('scenarioChips').querySelectorAll('[data-domain]').forEach(b=>b.onclick=()=>{activeDomain=b.dataset.domain;renderChips();renderAll();});}
function renderHealth(){
  const rules=allRules(),tc={},mc={};rules.forEach(r=>{tc[r.type]=(tc[r.type]||0)+1;mc[r.maturity]=(mc[r.maturity]||0)+1;});
  const gaps=SM?.gaps||[];const html=`<div class="section-head slim"><div><h2>体系健康度</h2><p class="muted small">不是追求规则越多越好，而是逐步减少“没有边界、没有证据、不能执行”的知识。</p></div><span class="pill">${SM?.meta?.synthesis==='openai'?'已进行跨来源综合':'基础结构模式'}</span></div><div class="system-health-grid"><div><b>知识形态</b><p>${Object.entries(TYPE_LABEL).map(([k,v])=>`${v} ${tc[k]||0}`).join('　')}</p></div><div><b>成熟度</b><p>Validated ${mc.validated||0}　Conditional ${mc.conditional||0}　Observed ${mc.observed||0}　Hypothesis ${mc.hypothesis||0}</p></div><div><b>当前待验证</b><p>${gaps.length||rules.filter(r=>r.maturity!=='validated').length} 项；Weekly 会优先寻找能补证据、补边界或反驳这些判断的新内容。</p></div></div>`;$w('systemHealth').innerHTML=html;
}
function renderMap(){
  const box=$w('systemMap');if(systemMode!=='map'){box.classList.add('hidden');return;}box.classList.remove('hidden');
  const rows=domains().map(([d,n])=>{const rs=allRules().filter(r=>r.domain===d),types={},mats={};rs.forEach(r=>{types[r.type]=(types[r.type]||0)+1;mats[r.maturity]=(mats[r.maturity]||0)+1;});return `<button class="system-map-row" type="button" data-map-domain="${ew(d)}"><div><b>${ew(d)}</b><span>${n} 条</span></div><div class="system-map-meta"><span>原则 ${types.principle||0}</span><span>框架 ${types.framework||0}</span><span>Playbook ${types.playbook||0}</span><span>约束 ${types.guardrail||0}</span></div><div class="system-map-meta"><span>✓ ${mats.validated||0}</span><span>△ ${mats.conditional||0}</span><span>○ ${mats.observed||0}</span><span>· ${mats.hypothesis||0}</span></div></button>`;}).join('');box.innerHTML=`<div class="section-head slim"><div><h2>体系地图</h2><p class="muted small">看你的知识结构是否偏科；点击一个领域进入具体规则。</p></div></div><div class="system-map-list">${rows}</div>`;box.querySelectorAll('[data-map-domain]').forEach(b=>b.onclick=()=>{activeDomain=b.dataset.mapDomain;systemMode='invoke';syncModeButtons();renderChips();renderAll();$w('playbookList').scrollIntoView({behavior:'smooth'});});
}
function arrayBlock(label,arr){if(!arr?.length)return'';return `<div class="playbook-col"><div class="playbook-label">${label}</div><ul>${arr.map(x=>`<li>${ew(x)}</li>`).join('')}</ul></div>`;}
function renderRules(){
  const q=($w('playbookSearch')?.value||'').trim();let rows=allRules().filter(r=>activeDomain==='all'||r.domain===activeDomain);
  if(systemMode==='verify')rows=rows.filter(r=>['hypothesis','conditional','observed'].includes(r.maturity));
  rows=rows.map(r=>({r,score:queryScore(r,q)})).filter(x=>!q||x.score>0).sort((a,b)=>b.score-a.score||(MAT_ORDER[b.r.maturity]||0)-(MAT_ORDER[a.r.maturity]||0)).map(x=>x.r);
  $w('playbookList').innerHTML=rows.map((r,i)=>{
    const se=sourceEvidence(r),ne=notionEvidence(r),match=q?queryScore(r,q):0;
    return `<article class="card playbook-card system-rule-card"><div class="playbook-card-head"><div><div class="system-rule-meta"><span class="system-type ${ew(r.type)}">${ew(TYPE_LABEL[r.type]||r.type)}</span><span>${ew(r.domain||'其他')}</span><span class="system-maturity ${ew(r.maturity)}">${ew(MAT_LABEL[r.maturity]||r.maturity)}</span></div><h2><span class="playbook-num">${String(i+1).padStart(2,'0')}</span>${ew(r.title)}</h2></div><span class="evidence-count">${se.length} 私人依据 · ${ne.length} 外部证据${q&&match?` · 匹配 ${match.toFixed(1)}`:''}</span></div>
      <div class="playbook-core"><div class="playbook-label">我的判断</div><p>${ew(r.decision_rule||'')}</p></div>
      ${r.when?`<div class="playbook-when"><b>什么时候用</b><span>${ew(r.when)}</span></div>`:''}
      ${(r.not_when||[]).length?`<div class="system-boundary"><b>不适用 / 先别套用</b><ul>${r.not_when.map(x=>`<li>${ew(x)}</li>`).join('')}</ul></div>`:''}
      ${(r.questions||[]).length?`<div class="system-questions"><div class="playbook-label">调用前先问自己</div>${r.questions.map(x=>`<div>→ ${ew(x)}</div>`).join('')}</div>`:''}
      <div class="playbook-columns">${arrayBlock('怎么做',r.steps)}${arrayBlock('看什么指标',r.metrics)}${arrayBlock('避免什么',r.traps)}</div>
      ${(r.tensions||[]).length?`<div class="system-tension"><b>⚖ 冲突 / 边界 / 待验证</b>${r.tensions.map(x=>`<div>${ew(x)}</div>`).join('')}</div>`:''}
      <div class="system-maturity-reason">成熟度依据：${ew(r.maturity_reason||'等待统一模型重新计算')}</div>
      <details class="playbook-evidence"><summary>查看依据：工作经验 / 读书 / 实战 / Notion</summary><div class="evidence-sources">${se.map(n=>`<div class="system-source-note"><b>${ew(n.source_label)} · ${ew(n.section)}</b><p>${ew(n.text.length>520?n.text.slice(0,520)+'…':n.text)}</p></div>`).join('')}${ne.map(x=>`<a class="playbook-source" href="knowledge.html?open=${encodeURIComponent(x.a.id||'')}" target="_self"><span>${ew(x.a.title)}</span><small>Notion · ${ew(x.a.category||'未分类')} · ${ew((x.meta.hits||[]).slice(0,4).join(' / '))}${x.meta.has_comment?' · 有Comment':''}</small></a>`).join('')}</div></details></article>`;
  }).join('')||'<div class="empty"><h3>没有匹配的工作规则</h3><p>换一种问题描述，或者切换到“体系地图”找到对应领域。</p></div>';
}
function syncModeButtons(){document.querySelectorAll('[data-system-mode]').forEach(b=>b.classList.toggle('active',b.dataset.systemMode===systemMode));}
function renderAll(){renderMetrics();renderHealth();renderMap();renderRules();}
async function unlock(){
  try{
    WS=await loadWorkSystemData({prompt:true});if(WS.locked){$w('workSystemStatus').textContent='Work System 尚未生成或未解锁。';return;}
    WK=await loadKnowledgeData({prompt:false});
    try{SM=await loadSystemModelData({prompt:false});if(SM?.locked)SM=null;}catch(e){SM=null;}
    $w('workSystemGate').classList.add('hidden');$w('workSystemContent').classList.remove('hidden');$w('lockWorkSystem')?.classList.remove('hidden');
    $w('workSystemStatus').textContent=SM?.meta?.snapshot_at?`统一体系 ${new Date(SM.meta.snapshot_at).toLocaleString('ja-JP')} · ${SM.meta.synthesis==='openai'?'跨来源综合':'基础结构'}`:`Google/Notion 已解锁 · 统一体系将在下次周更生成`;
    renderSources();renderChips();renderAll();
  }catch(e){console.error(e);$w('workSystemStatus').textContent='读取失败：'+e.message;}
}
document.addEventListener('DOMContentLoaded',()=>{
  $w('unlockWorkSystem')?.addEventListener('click',unlock);
  $w('playbookSearch')?.addEventListener('input',renderRules);
  $w('lockWorkSystem')?.addEventListener('click',()=>lockPrivateData(true));
  document.querySelectorAll('[data-system-mode]').forEach(b=>b.addEventListener('click',()=>{systemMode=b.dataset.systemMode;syncModeButtons();renderAll();}));
});
