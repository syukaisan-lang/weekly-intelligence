// Weekly v9: local-only source audit + clean unread queue.
// Human skip/feedback stays private in browser state; this script never uploads source-level preference stats.
(() => {
  const NEGATIVE=new Set(['bad','less']);
  const POSITIVE=new Set(['accurate','more']);

  function currentGrade(a){try{return grade(score(a));}catch(_){return a.grade||'C';}}
  function articleRows(){return Array.isArray(data?.articles)?data.articles:[];}
  function humanState(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function isRecommendedUnread(a){
    const s=humanState(a),status=s.status||'new';
    if(status==='later')return true; // explicit human choice always stays in the queue
    if(status!=='new')return false;
    return ['S','A'].includes(currentGrade(a));
  }
  function isRead(a){const x=humanState(a).status;return x==='read'||x==='save';}
  function isSkipped(a){return humanState(a).status==='skip';}
  function isSaved(a){return humanState(a).status==='save';}
  function isMarkedLocal(a){const s=humanState(a);return (s.status&&s.status!=='new')||!!s.feedback;}

  function sourceStats(){
    const map=new Map();
    for(const a of articleRows()){
      const name=a.source||'来源不明';
      if(!map.has(name))map.set(name,{source:name,total:0,skip:0,negative:0,positive:0,sa:0,bc:0,read:0,save:0,unread:0});
      const r=map.get(name),s=humanState(a),g=currentGrade(a);
      r.total++;
      if(isSkipped(a))r.skip++;
      if(NEGATIVE.has(s.feedback))r.negative++;
      if(POSITIVE.has(s.feedback))r.positive++;
      if(['S','A'].includes(g))r.sa++;else r.bc++;
      if(isRead(a))r.read++;
      if(isSaved(a))r.save++;
      if(isRecommendedUnread(a))r.unread++;
    }
    const rows=[...map.values()];
    for(const r of rows){
      r.skipRate=r.total?r.skip/r.total:0;
      r.lowRate=r.total?r.bc/r.total:0;
      r.valueRate=r.total?(r.save*2+r.read+r.positive+r.sa*.35)/r.total:0;
      if(r.total>=8&&r.skipRate>=.70&&r.save===0&&r.sa<=2)r.action='建议停用';
      else if(r.total>=8&&r.skipRate>=.50&&r.save===0)r.action='优先审查';
      else if(r.total>=8&&r.lowRate>=.80&&r.save===0&&r.positive===0)r.action='考虑降频';
      else r.action='保留观察';
    }
    return rows.sort((a,b)=>b.skip-a.skip||b.skipRate-a.skipRate||b.total-a.total||a.source.localeCompare(b.source,'ja'));
  }

  function fmtPct(x){return `${Math.round((x||0)*100)}%`;}
  function escV9(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[m]));}

  function ensureUi(){
    let note=document.getElementById('autoArchiveNote');
    if(!note){
      const progress=document.querySelector('.reading-progress .reading-progress-head>div');
      if(progress){note=document.createElement('div');note.id='autoArchiveNote';note.className='muted small';note.style.marginTop='4px';progress.appendChild(note);}
    }
    if(document.getElementById('sourceAuditCard'))return;
    const coverage=document.getElementById('sourceCoverage')?.closest('.card');
    if(!coverage)return;
    const card=document.createElement('section');card.className='card';card.id='sourceAuditCard';
    card.innerHTML=`<div class="section-head slim"><div><h2>来源质量</h2><div id="sourceAuditSummary" class="muted small">读取本机标记…</div></div><div id="sourceAuditPill" class="pill">0 停用候选</div></div>
      <p class="muted small">这里的“跳过”只统计你亲手标记的跳过；B/C只是自动归档，不会被当作负反馈。统计只在本机计算，不上传明文。</p>
      <div id="sourceAuditTable" class="source-audit-table"></div>
      <div class="controls" style="margin-top:10px"><button id="copySourceAudit" class="btn secondary" type="button">复制来源统计</button></div>`;
    coverage.insertAdjacentElement('afterend',card);
    const style=document.createElement('style');style.textContent=`
      .source-audit-table{display:grid;gap:8px}.source-audit-row{padding:9px 0;border-top:1px solid var(--line,#ddd)}
      .source-audit-row:first-child{border-top:0}.source-audit-main{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
      .source-audit-main b{font-size:13px}.source-audit-action{font-size:11px;white-space:nowrap;padding:2px 6px;border-radius:999px;background:rgba(127,127,127,.12)}
      .source-audit-action.danger{font-weight:700}.source-audit-action.warn{font-weight:600}.source-audit-numbers{display:flex;flex-wrap:wrap;gap:5px 10px;margin-top:5px;font-size:11px;opacity:.8}`;
    document.head.appendChild(style);
  }

  function renderSourceAudit(){
    ensureUi();
    const root=document.getElementById('sourceAuditTable');if(!root)return;
    const rows=sourceStats();
    const totals=rows.reduce((o,r)=>{o.total+=r.total;o.skip+=r.skip;o.bc+=r.bc;o.sa+=r.sa;o.save+=r.save;o.unread+=r.unread;return o;},{total:0,skip:0,bc:0,sa:0,save:0,unread:0});
    const summary=document.getElementById('sourceAuditSummary');
    if(summary)summary.textContent=`本机统计：跳过 ${totals.skip} · B/C自动归档 ${totals.bc} · 当前未读推荐 ${totals.unread}`;
    root.innerHTML=rows.map(r=>`<div class="source-audit-row" data-source-audit="${escV9(r.source)}">
      <div class="source-audit-main"><b>${escV9(r.source)}</b><span class="source-audit-action ${r.action==='建议停用'?'danger':r.action==='优先审查'?'warn':''}">${r.action}</span></div>
      <div class="source-audit-numbers"><span>跳过 <b>${r.skip}</b>/${r.total} (${fmtPct(r.skipRate)})</span><span>B/C ${r.bc}</span><span>S/A ${r.sa}</span><span>保存 ${r.save}</span><span>待看 ${r.unread}</span></div>
    </div>`).join('');
    const pill=document.getElementById('sourceAuditPill');if(pill)pill.textContent=`${rows.filter(r=>r.action==='建议停用').length} 停用候选`;
  }

  async function copyStats(){
    const rows=sourceStats(),totSkip=rows.reduce((s,r)=>s+r.skip,0);
    const lines=[`Weekly来源统计｜跳过合计 ${totSkip}`,'媒体\t跳过/总数\t跳过率\tB/C\tS/A\t保存\t待看\t建议'];
    for(const r of rows)lines.push(`${r.source}\t${r.skip}/${r.total}\t${fmtPct(r.skipRate)}\t${r.bc}\t${r.sa}\t${r.save}\t${r.unread}\t${r.action}`);
    const text=lines.join('\n');
    try{await navigator.clipboard.writeText(text);const b=document.getElementById('copySourceAudit');if(b){const old=b.textContent;b.textContent='已复制';setTimeout(()=>b.textContent=old,1800);}}
    catch(_){window.prompt('复制下面的来源统计：',text);}
  }

  // Redefine only the visual progress counts. B/C auto-archive is not a human skip and therefore
  // never becomes negative training data. Explicit "later" remains visible regardless of grade.
  const baseUpdateProgress=typeof updateProgressTabs==='function'?updateProgressTabs:null;
  updateProgressTabs=function(){
    if(baseUpdateProgress)baseUpdateProgress();
    const arts=articleRows();
    const counts={unread:0,marked:0,read:0,skip:0,all:arts.length};
    for(const a of arts){
      if(isRecommendedUnread(a))counts.unread++;
      if(isMarkedLocal(a))counts.marked++;
      if(isRead(a))counts.read++;
      if(isSkipped(a))counts.skip++;
    }
    document.querySelectorAll('[data-progress]').forEach(btn=>{
      const key=btn.dataset.progress,count=btn.querySelector('.segment-count');
      if(count)count.textContent=counts[key]??0;
    });
    const autoArchived=arts.filter(a=>{const s=humanState(a);return (s.status||'new')==='new'&&!['S','A'].includes(currentGrade(a));}).length;
    const note=document.getElementById('autoArchiveNote');if(note)note.textContent=`B/C 自动归档 ${autoArchived} 篇（不算负反馈）`;
  };

  const baseRenderArticles=typeof renderArticles==='function'?renderArticles:null;
  if(baseRenderArticles){renderArticles=function(){baseRenderArticles();updateProgressTabs();renderSourceAudit();};}
  const baseRenderMetrics=typeof renderMetrics==='function'?renderMetrics:null;
  if(baseRenderMetrics){renderMetrics=function(){baseRenderMetrics();updateProgressTabs();};}

  function mount(){
    ensureUi();
    document.getElementById('copySourceAudit')?.addEventListener('click',copyStats);
    const unreadBtn=document.querySelector('[data-progress="unread"]');
    if(unreadBtn&&unreadBtn.firstChild?.nodeType===Node.TEXT_NODE)unreadBtn.firstChild.textContent='未读推荐 ';
    renderSourceAudit();updateProgressTabs();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  window.weeklySourceAuditV9={sourceStats,render:renderSourceAudit,copy:copyStats};
})();
