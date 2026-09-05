// Weekly v35: final runtime invariants for navigation, Priority Reading, and private-data isolation.
// This layer intentionally owns the last word on:
// 1) Priority count == Priority list == reading-time summary;
// 2) top-level view changes start from clean subordinate filters;
// 3) Later never triggers cloud recovery/password prompts;
// 4) Weekly never loads Knowledge / Work System / semantic-index private payloads client-side.
(() => {
  const IS_WEEKLY=!!document.querySelector('.reading-progress')&&!!document.getElementById('articleList');
  if(!IS_WEEKLY)return;

  const BLOCKED_PRIVATE_RE=/knowledge|work-system|system-model|semantic-index/i;
  let explicitPrivateUntil=0;
  let globalPriority=[];
  let activePriority=[];
  let activePriorityIds=new Set();
  let focusObserver=null;
  let syncingCount=false;

  function blockedPrivateResult(){return {meta:{encrypted_full_data:true},locked:true,weekly_blocked:true};}
  function privateAllowed(){return Date.now()<explicitPrivateUntil;}

  // Only an explicit click on Weekly backup/restore tools may open the password dialog.
  // Background rendering, Later navigation, historical recovery helpers and relation loaders may not.
  document.addEventListener('click',e=>{
    const b=e.target instanceof Element?e.target.closest('button'):null;if(!b)return;
    const t=String(b.textContent||'');
    if(b.id==='backupWeeklyStateBtn'||/恢复云端/.test(t))explicitPrivateUntil=Date.now()+120000;
  },true);

  const originalDecrypt=window.decryptPrivateEnvelopeData;
  if(typeof originalDecrypt==='function'&&!originalDecrypt.__weeklyV35){
    const guarded=async function(env,options={}){
      if(options?.prompt!==false&&!privateAllowed())throw new Error('Unlock cancelled');
      return originalDecrypt(env,options);
    };
    guarded.__weeklyV35=true;window.decryptPrivateEnvelopeData=guarded;
  }

  // Weekly does not need raw Knowledge / Work System data. Server-side article fields already contain
  // the semantic/increment judgement needed for ranking, so always block these private loaders here.
  for(const name of ['loadKnowledgeData','loadWorkSystemData','loadSystemModelData']){
    const fn=window[name];
    if(typeof fn==='function'&&!fn.__weeklyV35){
      const blocked=async()=>blockedPrivateResult();blocked.__weeklyV35=true;window[name]=blocked;
    }
  }
  const originalLoadEncrypted=window.loadEncryptedData;
  if(typeof originalLoadEncrypted==='function'&&!originalLoadEncrypted.__weeklyV35){
    const guarded=async function(metaUrl,encUrl,options={}){
      if(BLOCKED_PRIVATE_RE.test(String(metaUrl||''))||BLOCKED_PRIVATE_RE.test(String(encUrl||'')))return blockedPrivateResult();
      return originalLoadEncrypted(metaUrl,encUrl,options);
    };
    guarded.__weeklyV35=true;window.loadEncryptedData=guarded;
  }

  // Historical Later restoration stays available through the explicit Restore action, but simply
  // entering the Later view must be local-only. Neutralize the old automatic recovery API.
  function disableAutomaticLaterRecovery(){
    const api=window.weeklyStateIntegrityV22;if(!api||api.__weeklyV35AutoRecoveryDisabled)return false;
    api.recoverHistoricalLater=async()=>({restoredLater:0,updated:0,disabled_on_weekly:true});
    api.__weeklyV35AutoRecoveryDisabled=true;return true;
  }
  disableAutomaticLaterRecovery();
  [80,250,800,1800].forEach(ms=>setTimeout(disableAutomaticLaterRecovery,ms));

  function allRows(){
    try{const rows=window.weeklyUiFixesV25?.allRows?.();if(Array.isArray(rows)&&rows.length)return rows;}catch(_){}
    return Array.isArray(data?.articles)?data.articles:[];
  }
  function filterEls(){return {
    grade:document.getElementById('gradeFilter'),
    status:document.getElementById('statusFilter'),
    source:document.getElementById('sourceFilter')
  };}
  function normalizeNavFilters(key){
    const {grade,status,source}=filterEls();
    if(status)status.value='all';if(source)source.value='all';
    if(grade)grade.value=(key==='focus'||key==='unread')?'SA':'ALL';
  }
  function computePriority({respectFilters=false}={}){
    const api=window.weeklyReadingTimeV21;if(!api?.currentFocus)return [];
    const rows=allRows();if(!rows.length)return [];
    const originalRows=data.articles;
    const {grade,status,source}=filterEls();
    const old={grade:grade?.value,status:status?.value,source:source?.value};
    try{
      data.articles=rows;
      if(!respectFilters){if(grade)grade.value='SA';if(status)status.value='all';if(source)source.value='all';}
      api.invalidate?.();
      const selected=api.currentFocus()?.selected||[];
      return selected.slice();
    }catch(_){return [];}
    finally{
      data.articles=originalRows;
      if(!respectFilters){if(grade&&old.grade!=null)grade.value=old.grade;if(status&&old.status!=null)status.value=old.status;if(source&&old.source!=null)source.value=old.source;}
    }
  }
  function refreshPrioritySnapshots(){
    globalPriority=computePriority({respectFilters:false});
    if(typeof readingProgress!=='undefined'&&readingProgress==='focus')activePriority=computePriority({respectFilters:true});
    else activePriority=globalPriority.slice();
    activePriorityIds=new Set(activePriority.map(a=>String(a.id)));
    return typeof readingProgress!=='undefined'&&readingProgress==='focus'?activePriority:globalPriority;
  }
  function priorityMinutes(rows){
    const fn=window.weeklyReadingTimeV21?.estimateMinutes;
    return rows.reduce((n,a)=>n+(fn?Number(fn(a)||0):0),0);
  }
  function expectedPriorityRows(){return typeof readingProgress!=='undefined'&&readingProgress==='focus'?activePriority:globalPriority;}
  function syncPriorityUi(){
    const rows=expectedPriorityRows(),n=rows.length,mins=priorityMinutes(rows);
    const count=document.querySelector('[data-progress="focus"] .segment-count');
    if(count&&count.textContent!==String(n)){syncingCount=true;count.textContent=String(n);syncingCount=false;}
    if(typeof readingProgress!=='undefined'&&readingProgress==='focus'){
      const vc=document.getElementById('visibleCount');if(vc)vc.textContent=`${n} 篇优先阅读 · ≈${mins}分钟`;
      const panel=document.getElementById('weeklyReadingBudget'),summary=panel?.querySelector('.reading-budget-summary');
      const q=window.weeklyQueueClarityV29?.queueRows?.().length||0;
      const mode=localStorage.getItem('weekly_intelligence_reading_budget_v21')||'all';
      if(summary)summary.innerHTML=`<b>${n} 篇优先阅读</b> · 预计约 <b>${mins} 分钟</b>${mode==='30'||mode==='60'?` / ${mode} 分钟预算`:''}<span>来源：待处理 S/A ${q} 篇中再筛选</span>`;
    }
  }
  function scheduleSync(){
    [0,80,350,1100].forEach(ms=>setTimeout(()=>{disableAutomaticLaterRecovery();syncPriorityUi();},ms));
  }

  // Final visibility rule for Priority. It uses a snapshot computed from the canonical full article set,
  // so mobile pagination cannot accidentally recompute Priority against a temporary data.articles slice.
  if(typeof visible==='function'){
    const previousVisible=visible;
    visible=function(a){
      if(typeof readingProgress!=='undefined'&&readingProgress==='focus')return activePriorityIds.has(String(a?.id));
      return previousVisible(a);
    };
  }

  if(typeof renderArticles==='function'){
    const previousRender=renderArticles;
    renderArticles=function(){
      refreshPrioritySnapshots();
      const out=previousRender();
      scheduleSync();return out;
    };
  }
  if(typeof setProgress==='function'){
    const previousSet=setProgress;
    window.setProgress=setProgress=function(key){
      normalizeNavFilters(key);
      const out=previousSet(key);
      refreshPrioritySnapshots();scheduleSync();return out;
    };
  }

  // Filter changes inside Priority are legitimate. Recompute before target-level handlers render,
  // then the final render wrapper recomputes once more after all score/cache invalidations.
  document.addEventListener('change',e=>{
    const id=e.target?.id;
    if(!['gradeFilter','statusFilter','sourceFilter','personalizedSort'].includes(id))return;
    if(typeof readingProgress!=='undefined'&&readingProgress==='focus')refreshPrioritySnapshots();
    scheduleSync();
  },true);

  function installCountObserver(){
    const node=document.querySelector('[data-progress="focus"] .segment-count');
    if(!node||focusObserver)return false;
    focusObserver=new MutationObserver(()=>{
      if(syncingCount)return;
      const expected=String(expectedPriorityRows().length);
      if(node.textContent!==expected){syncingCount=true;node.textContent=expected;syncingCount=false;}
    });
    focusObserver.observe(node,{childList:true,characterData:true,subtree:true});return true;
  }
  installCountObserver();[100,500,1500].forEach(ms=>setTimeout(installCountObserver,ms));

  // Cosmetic safety: if a private dialog is legitimately opened for Weekly backup/restore,
  // describe what is being unlocked rather than claiming the Weekly page is loading Knowledge.
  const dialogObserver=new MutationObserver(ms=>{
    for(const m of ms)for(const n of m.addedNodes){
      if(!(n instanceof Element)||n.id!=='privateUnlockDialog')continue;
      const h=n.querySelector('h2'),p=n.querySelector('p');
      if(h)h.textContent='解锁加密阅读状态';
      if(p)p.textContent='密码只用于本次 Weekly 加密备份/恢复，保留在当前页面内存，不加载个人 Knowledge / Work System 明细。';
    }
  });
  dialogObserver.observe(document.body,{childList:true});

  refreshPrioritySnapshots();syncPriorityUi();scheduleSync();
  window.weeklyRuntimeConsistencyV35={
    refreshPrioritySnapshots,
    globalPriority:()=>globalPriority.slice(),
    activePriority:()=>activePriority.slice(),
    privacyBlocked:()=>true,
    audit:()=>({
      view:typeof readingProgress!=='undefined'?readingProgress:null,
      global_priority:globalPriority.length,
      active_priority:activePriority.length,
      rendered_cards:document.querySelectorAll('#articleList .article').length,
      filters:{grade:filterEls().grade?.value||null,status:filterEls().status?.value||null,source:filterEls().source?.value||null},
      private_data_blocked:true,
      automatic_later_recovery:false
    })
  };
})();
