// Weekly v33.2: final UI stability layer.
// - no client-side Knowledge/Work-System loading on Weekly
// - one source of truth for Priority count/list/time
// - explicit pre-this-week Later history view
// - compact sticky status navigation while scrolling
// - invalidate legacy caches without touching user reading state
(() => {
  const BUILD='20260905-1055-v33-2';
  const BUILD_KEY='weekly_intelligence_ui_build_v33';
  const JST=9*60*60*1000;
  let laterHistoryOnly=false,historySwitching=false;

  function hs(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function allRows(){return window.weeklyUiFixesV25?.allRows?.()||(Array.isArray(data?.articles)?data.articles:[]);}
  function weekStartMs(){const j=new Date(Date.now()+JST),wd=(j.getUTCDay()+6)%7;return Date.UTC(j.getUTCFullYear(),j.getUTCMonth(),j.getUTCDate()-wd,0,0,0,0)-JST;}
  function laterSince(a){
    const s=hs(a);
    const laterAt=Number(s.later_interest_at||0);if(laterAt>0)return laterAt;
    const statusAt=Number(s.status_updated_at||0);if(s.status==='later'&&statusAt>0)return statusAt;
    const updated=Number(s.updated_at||0);if(updated>0)return updated;
    return Date.parse(a?.first_seen||a?.published||'')||0;
  }
  function historicalLaterRows(){return allRows().filter(a=>hs(a).status==='later'&&laterSince(a)<weekStartMs());}

  function disableKnowledgeUi(){
    document.body.classList.add('weekly-no-knowledge');
    document.getElementById('knowledgeRelationUnlockCard')?.remove();
    document.querySelectorAll('#articleList .related-knowledge').forEach(x=>x.remove());
  }

  if(typeof visible==='function'){
    const prev=visible;
    visible=function(a){if(readingProgress==='later'&&laterHistoryOnly){if(!prev(a))return false;return hs(a).status==='later'&&laterSince(a)<weekStartMs();}return prev(a);};
  }

  function ensureHistoryTab(){
    const tabs=document.querySelector('#weeklyLaterManager .later-manager-tabs');if(!tabs)return null;
    let b=tabs.querySelector('[data-later-history]');if(b)return b;
    b=document.createElement('button');b.type='button';b.dataset.laterHistory='1';b.innerHTML='<span>本周前保存</span><b>0</b><small>历史稍后看</small>';
    const all=tabs.querySelector('[data-later-mode="all"]');tabs.insertBefore(b,all||null);
    b.addEventListener('click',()=>{
      laterHistoryOnly=true;
      const allBtn=tabs.querySelector('[data-later-mode="all"]');
      if(allBtn){
        historySwitching=true;
        try{allBtn.click();}finally{historySwitching=false;laterHistoryOnly=true;}
      }else renderArticles?.();
      setTimeout(syncLaterHistory,0);
    });
    tabs.querySelectorAll('[data-later-mode]').forEach(x=>x.addEventListener('click',()=>{if(!historySwitching)laterHistoryOnly=false;},{capture:true}));
    return b;
  }
  function syncLaterHistory(){
    const b=ensureHistoryTab();if(!b)return;
    const rows=historicalLaterRows(),n=b.querySelector('b');if(n)n.textContent=String(rows.length);
    if(!(readingProgress==='later'&&laterHistoryOnly)){b.classList.remove('active');return;}
    document.querySelectorAll('#weeklyLaterManager [data-later-mode]').forEach(x=>x.classList.remove('active'));b.classList.add('active');
    const mins=rows.reduce((s,a)=>s+(Number(window.weeklyReadingTimeV21?.estimateMinutes?.(a)||4)),0);
    const note=document.querySelector('#weeklyLaterManager .later-manager-note');if(note)note.textContent=`本周之前加入“稍后看”的完整历史：${rows.length} 篇 · 预计约 ${mins} 分钟。`;
    const vc=document.getElementById('visibleCount');if(vc)vc.textContent=`${rows.length} 篇历史稍后看 · ≈${mins}分钟`;
    const quick=document.getElementById('weeklyLaterQuickSummary');if(quick){quick.hidden=false;const s=quick.querySelector('.reading-budget-summary');if(s)s.innerHTML=`<b>${rows.length} 篇历史稍后看</b> · 预计约 <b>${mins} 分钟</b><span>只显示本周之前保存的 Later</span>`;}
  }

  function truePriority(){
    const api=window.weeklyReadingTimeV21;if(!api?.currentFocus)return [];
    // v21/v28/v30-v32 already invalidate on real state/filter mutations. Reuse that cache here;
    // forcing a new full priority scan on every UI sync made scrolling/filtering unnecessarily expensive.
    try{return api.currentFocus()?.selected||[];}catch(_){return [];}
  }
  function syncPriority(){
    const rows=truePriority(),mins=rows.reduce((n,a)=>n+Number(window.weeklyReadingTimeV21?.estimateMinutes?.(a)||0),0);
    const top=document.querySelector('[data-progress="focus"] .segment-count');if(top)top.textContent=String(rows.length);
    if(readingProgress==='focus'){
      const vc=document.getElementById('visibleCount');if(vc)vc.textContent=`${rows.length} 篇优先阅读 · ≈${mins}分钟`;
      const panel=document.getElementById('weeklyReadingBudget'),summary=panel?.querySelector('.reading-budget-summary');
      const q=window.weeklyQueueClarityV29?.queueRows?.().length||0,mode=localStorage.getItem('weekly_intelligence_reading_budget_v21')||'all';
      if(summary)summary.innerHTML=`<b>${rows.length} 篇优先阅读</b> · 预计约 <b>${mins} 分钟</b>${mode==='30'||mode==='60'?` / ${mode} 分钟预算`:''}<span>来源：待处理 S/A ${q} 篇中再筛选</span>`;
    }
  }

  function ensureSticky(){
    let bar=document.getElementById('weeklyStickyStatus');if(bar)return bar;
    bar=document.createElement('div');bar.id='weeklyStickyStatus';bar.className='weekly-sticky-status';bar.hidden=true;
    bar.innerHTML='<div class="sticky-status-label">阅读状态</div><div class="sticky-status-buttons"></div>';
    document.body.appendChild(bar);
    const host=bar.querySelector('.sticky-status-buttons');
    const defs=[['focus','优先'],['week','本周'],['unread','待处理'],['later','稍后看'],['read','已读'],['all','全部']];
    for(const [k,label] of defs){const b=document.createElement('button');b.type='button';b.dataset.stickyProgress=k;b.innerHTML=`${label} <b>0</b>`;b.addEventListener('click',()=>setProgress?.(k));host.appendChild(b);}
    return bar;
  }
  function syncSticky(){
    const bar=ensureSticky();
    bar.querySelectorAll('[data-sticky-progress]').forEach(b=>{const k=b.dataset.stickyProgress,src=document.querySelector(`[data-progress="${k}"] .segment-count`),n=b.querySelector('b');if(n)n.textContent=src?.textContent||'0';b.classList.toggle('active',k===readingProgress);});
  }
  function installStickyVisibility(){
    const bar=ensureSticky(),target=document.querySelector('.reading-progress');if(!target)return;
    if('IntersectionObserver'in window){const io=new IntersectionObserver(es=>{const e=es[0];bar.hidden=!!e?.isIntersecting;},{threshold:.05});io.observe(target);}else{window.addEventListener('scroll',()=>{bar.hidden=target.getBoundingClientRect().bottom>0;},{passive:true});}
  }

  function repairCaches(){
    const old=localStorage.getItem(BUILD_KEY);if(old===BUILD)return;
    ['weekly_intelligence_later_recycle_v23'].forEach(k=>localStorage.removeItem(k));
    localStorage.setItem(BUILD_KEY,BUILD);
    try{window.weeklyPerformanceV28?.invalidate?.({features:true});}catch(_){}
    try{window.weeklyPreferenceGuardV30?.invalidate?.();}catch(_){}
    try{window.weeklyAdaptiveLearningV31?.invalidate?.();}catch(_){}
    try{window.weeklyPreferenceMemoryV32?.invalidate?.();}catch(_){}
    try{window.weeklyReadingTimeV21?.invalidate?.();}catch(_){}
    try{window.weeklyLaterManagerV23?.invalidate?.();}catch(_){}
  }
  function sync(){disableKnowledgeUi();syncPriority();syncLaterHistory();syncSticky();}

  if(typeof renderArticles==='function'){
    const prev=renderArticles;renderArticles=function(){const out=prev();disableKnowledgeUi();setTimeout(sync,0);return out;};
  }
  if(typeof updateProgressTabs==='function'){
    const prev=updateProgressTabs;updateProgressTabs=function(){const out=prev();setTimeout(sync,0);return out;};
  }
  if(typeof setProgress==='function'){
    const prev=setProgress;window.setProgress=setProgress=function(k){if(k!=='later')laterHistoryOnly=false;const out=prev(k);setTimeout(sync,0);return out;};
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-budget],[data-recon],[data-later-mode]'))setTimeout(sync,0);});
  ['gradeFilter','statusFilter','sourceFilter','personalizedSort'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>setTimeout(sync,0)));

  repairCaches();disableKnowledgeUi();ensureHistoryTab();ensureSticky();installStickyVisibility();
  setTimeout(()=>{try{window.weeklyPreferenceMemoryV32?.buildMemory?.();}catch(_){};sync();},80);
  window.weeklyUiStabilityV33={sync,truePriority,historicalLaterRows,repairCaches};
})();
