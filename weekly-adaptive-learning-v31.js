// Weekly v31: one source of truth for Priority Reading + adaptive feedback UI + weak learning from repeated explicit skips.
(() => {
  const DAY=86400000;
  const NEGATIVE=new Set(['bad','less']);
  const NEG_REASON_KEYS=new Set(['too_generic','promo','not_work','known','no_evidence','topic']);
  let installed=false, profileCache=null, scoreCache=new Map(), revision=0;

  function hs(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function allRows(){return window.weeklyUiFixesV25?.allRows?.()||(Array.isArray(data?.articles)?data.articles:[]);}
  function subjects(a){
    try{return window.weeklyPreferenceGuardV30?.subjects?.(a)||[];}catch(_){return [];}
  }
  function ownLater(a){const s=hs(a);return s.status==='later'||s.feedback_reason==='later_interest'||Number(s.later_interest_at||0)>0;}
  function ageWeight(ts){
    if(!ts)return .65;
    const age=Math.max(0,(Date.now()-ts)/DAY);
    if(age<=90)return 1;
    if(age<=180)return .82;
    if(age<=365)return .62;
    return 0;
  }
  function ent(map,key){if(!map[key])map[key]={neg:0,pos:0,lastNeg:0,lastPos:0};return map[key];}

  // Explicit Skip without a reason is useful, but weaker than a reasoned negative signal.
  // We only suppress a subject after repeated skips; mere non-click / unread is never negative evidence.
  function buildSkipProfile(){
    const map={};
    for(const a of allRows()){
      const s=hs(a),keys=subjects(a);if(!keys.length)continue;
      const ts=Number(s.status_updated_at||s.updated_at||0)||Date.parse(a?.first_seen||a?.published||'')||0;
      if(s.status==='skip'){
        const w=.42*ageWeight(ts);if(!w)continue;
        for(const k of keys){const e=ent(map,k);e.neg+=w;e.lastNeg=Math.max(e.lastNeg,ts);}
      }
      if(ownLater(a)){
        const pts=Number(s.later_interest_at||s.status_updated_at||s.updated_at||0)||ts;
        const w=1.15*ageWeight(pts);if(!w)continue;
        for(const k of keys){const e=ent(map,k);e.pos+=w;e.lastPos=Math.max(e.lastPos,pts);}
      }
    }
    profileCache=map;return map;
  }
  function skipProfile(){return profileCache||buildSkipProfile();}
  function skipSuppression(a){
    if(ownLater(a))return {penalty:0,cap:10,keys:[]};
    const p=skipProfile(),matched=[];let strength=0;
    for(const k of subjects(a)){
      const e=p[k];if(!e)continue;
      const effective=e.lastPos>e.lastNeg?Math.max(0,e.neg-1.2*e.pos):Math.max(0,e.neg-.55*e.pos);
      if(effective<.72)continue;
      matched.push(k);strength+=effective;
    }
    if(!strength)return {penalty:0,cap:10,keys:[]};
    const penalty=-Math.min(.78,.24*strength);
    // About four recent explicit skips on the same subject are enough to keep it out of S/A.
    const cap=strength>=1.6?6.95:10;
    return {penalty,cap,keys:matched};
  }

  function reasonUsage(){
    const counts={},last={},labels={};let total=0;
    for(const a of allRows()){
      const s=hs(a),k=s.feedback_reason;
      if(!NEG_REASON_KEYS.has(k)||!NEGATIVE.has(s.feedback))continue;
      counts[k]=(counts[k]||0)+1;total++;
      const ts=Number(s.feedback_reason_updated_at||s.status_updated_at||s.updated_at||0)||0;
      last[k]=Math.max(last[k]||0,ts);
    }
    return {counts,last,total,labels};
  }

  function adaptReasonPicker(box){
    if(!box||box.dataset.adaptiveV31==='1')return;
    const label=box.querySelector('.feedback-reason-label');
    if(!label||!/为什么不要/.test(label.textContent||''))return;
    const buttons=[...box.querySelectorAll('button[data-reason]')];
    const reasonButtons=buttons.filter(b=>NEG_REASON_KEYS.has(b.dataset.reason));
    if(!reasonButtons.length)return;
    const usage=reasonUsage();
    const byKey=new Map(reasonButtons.map(b=>[b.dataset.reason,b]));
    const order=[...byKey.keys()].sort((a,b)=>(usage.counts[b]||0)-(usage.counts[a]||0)||(usage.last[b]||0)-(usage.last[a]||0));
    // Before enough history exists, keep all reasons visible. Afterwards show only the four most useful.
    const mainCount=usage.total>=8?Math.min(4,order.length):order.length;
    const main=new Set(order.slice(0,mainCount));
    for(const k of order)if(main.has(k))box.appendChild(byKey.get(k));
    const hidden=order.filter(k=>!main.has(k));
    const skipBtn=buttons.find(b=>!b.dataset.reason);
    if(hidden.length||skipBtn){
      const details=document.createElement('details');details.className='adaptive-feedback-more';details.style.marginTop='6px';
      const summary=document.createElement('summary');summary.textContent='更多原因';summary.style.cursor='pointer';summary.style.fontSize='12px';details.appendChild(summary);
      const inner=document.createElement('div');inner.style.display='flex';inner.style.flexWrap='wrap';inner.style.gap='6px';inner.style.marginTop='6px';
      hidden.forEach(k=>inner.appendChild(byKey.get(k)));if(skipBtn)inner.appendChild(skipBtn);details.appendChild(inner);box.appendChild(details);
    }
    if(usage.total>=8)label.textContent='为什么不要？（常用原因优先）';
    box.dataset.adaptiveV31='1';
  }

  function priorityRows(){
    const api=window.weeklyReadingTimeV21;if(!api?.currentFocus)return [];
    try{return api.currentFocus()?.selected||[];}catch(_){return [];}
  }
  function priorityMinutes(rows){
    const fn=window.weeklyReadingTimeV21?.estimateMinutes;
    return rows.reduce((n,a)=>n+(fn?Number(fn(a)||0):0),0);
  }
  function queueCount(){
    try{return window.weeklyQueueClarityV29?.queueRows?.().length||0;}catch(_){return 0;}
  }
  function syncPriority(){
    if(typeof readingProgress==='undefined')return;
    const rows=priorityRows(),mins=priorityMinutes(rows);
    const top=document.querySelector('[data-progress="focus"] .segment-count');if(top)top.textContent=String(rows.length);
    const note=document.getElementById('queueHierarchyNote');if(note)note.textContent=` 待处理 S/A ${queueCount()} 篇 → 优先阅读 ${rows.length} 篇（从待处理队列中再筛一层）。`;
    if(readingProgress==='focus'){
      const panel=document.getElementById('weeklyReadingBudget');
      const mode=localStorage.getItem('weekly_intelligence_reading_budget_v21')||'all';
      const summary=panel?.querySelector('.reading-budget-summary');
      if(summary)summary.innerHTML=`<b>${rows.length} 篇优先阅读</b> · 预计约 <b>${mins} 分钟</b>${mode==='30'||mode==='60'?` / ${mode} 分钟预算`:''}<span>来源：待处理 S/A ${queueCount()} 篇中再筛选</span>`;
      const vc=document.getElementById('visibleCount');if(vc)vc.textContent=`${rows.length} 篇优先阅读 · ≈${mins}分钟`;
    }
  }

  function feedbackUsageNote(){
    const root=document.getElementById('learnedPrefs');if(!root||root.querySelector('.adaptive-learning-note-v31'))return;
    const u=reasonUsage(),pairs=Object.entries(u.counts).sort((a,b)=>b[1]-a[1]);
    const label={topic:'主题不感兴趣',promo:'活动/宣传',not_work:'和工作无关',too_generic:'太泛',no_evidence:'缺数据/案例',known:'已经知道'};
    const top=pairs.slice(0,3).map(([k,n])=>`${label[k]||k} ${n}`).join(' / ');
    const n=document.createElement('div');n.className='muted small precision-learning-note adaptive-learning-note-v31';
    n.textContent=`反馈自适应：${u.total?`常用负反馈 ${top||'尚未形成'}`:'尚无足够负反馈样本'}。使用很少的原因会自动折叠到“更多原因”；未处理/没点击不会被当成负反馈，只有明确跳过会作为弱信号，重复跳过同主题才会明显降权。`;
    root.appendChild(n);
  }

  function invalidate(){
    revision++;profileCache=null;scoreCache.clear();
    try{window.weeklyReadingTimeV21?.invalidate?.();}catch(_){}
    try{window.weeklyQueueClarityV29?.sync?.();}catch(_){}
  }

  function install(){
    if(installed||!window.weeklyPreferenceGuardV30)return false;installed=true;
    const prevScore=typeof score==='function'?score:null;
    if(prevScore){
      score=function(a){
        const key=String(a?.id||a?.url||a?.title||''),hit=key?scoreCache.get(key):null;
        if(hit&&hit.rev===revision)return hit.value;
        const base=Number(prevScore(a))||Number(a?.reading_score??5)||5;
        const s=skipSuppression(a);const value=Math.max(0,Math.min(10,Math.min(base+s.penalty,s.cap)));
        if(key)scoreCache.set(key,{rev:revision,value});return value;
      };
    }
    if(typeof save==='function'){
      const prevSave=save;save=function(){invalidate();return prevSave();};
    }
    if(typeof renderPrefs==='function'){
      const prev=renderPrefs;renderPrefs=function(){prev();feedbackUsageNote();};
    }
    if(typeof renderArticles==='function'){
      const prev=renderArticles;renderArticles=function(){const out=prev();setTimeout(syncPriority,0);setTimeout(syncPriority,60);return out;};
    }
    if(typeof updateProgressTabs==='function'){
      const prev=updateProgressTabs;updateProgressTabs=function(){const out=prev();setTimeout(syncPriority,0);return out;};
    }
    if(typeof setProgress==='function'){
      const prev=setProgress;window.setProgress=setProgress=function(key){const out=prev(key);setTimeout(syncPriority,0);return out;};
    }

    const list=document.getElementById('articleList');
    if(list){
      const obs=new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(!(n instanceof Element))continue;if(n.matches?.('.feedback-reasons'))adaptReasonPicker(n);n.querySelectorAll?.('.feedback-reasons').forEach(adaptReasonPicker);}requestAnimationFrame(syncPriority);});
      obs.observe(list,{childList:true,subtree:true});
    }
    document.addEventListener('click',()=>setTimeout(()=>document.querySelectorAll('.feedback-reasons').forEach(adaptReasonPicker),0),true);

    // v21 may have cached the pre-v30 priority set. Drop it once and render from the final score chain.
    invalidate();
    try{renderPrefs?.();}catch(_){}
    try{renderArticles?.();}catch(_){}
    setTimeout(syncPriority,80);
    window.weeklyAdaptiveLearningV31={invalidate,skipSuppression,reasonUsage,priorityRows,syncPriority};
    return true;
  }

  function boot(attempt=0){if(install())return;if(attempt<50)setTimeout(()=>boot(attempt+1),40);}
  boot();
})();
