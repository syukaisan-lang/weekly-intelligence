// Weekly v40: make the highest-frequency action immediate. A Later click writes
// canonical state once, updates the visible card synchronously, then coalesces
// all expensive score/list work into one idle refresh.
(() => {
  const STATE_KEY='weekly_intelligence_state_v1';
  const DIRTY_KEY='weekly_intelligence_dirty_since_v1';
  const TRUSTED_STATUS_ORIGIN='human_v10';
  const previousSetStatus=window.setStatus;
  if(typeof previousSetStatus!=='function')return;

  let scheduled=false,actions=0,batches=0,lastBatchMs=0,pendingActions=0;

  function toast(text){
    let box=document.getElementById('weeklyStateToast');
    if(!box){box=document.createElement('div');box.id='weeklyStateToast';box.className='save-toast';document.body.appendChild(box);}
    box.textContent=text;box.classList.add('show');clearTimeout(box._timer);
    box._timer=setTimeout(()=>box.classList.remove('show'),1600);
  }
  function cardsFor(id){
    return [...document.querySelectorAll('#articleList .article[data-bulk-article-id]')]
      .filter(card=>String(card.dataset.bulkArticleId)===String(id));
  }
  function updateLaterCount(delta){
    const count=document.querySelector('[data-progress="later"] .segment-count');
    if(!count)return;
    const value=Number.parseInt(count.textContent||'0',10);
    if(Number.isFinite(value))count.textContent=String(Math.max(0,value+delta));
  }
  function acknowledge(a,next,before){
    const active=next==='later';
    for(const card of cardsFor(a.id)){
      card.querySelectorAll('button.btn').forEach(button=>{
        if(button.textContent.trim()==='稍后看')button.classList.toggle('active',active);
      });
      const pill=card.querySelector('.article-top .meta .pill');
      if(pill)pill.textContent=active?'稍后看':'未处理';
      card.classList.add('weekly-status-pending');
      if(typeof readingProgress!=='undefined'&&readingProgress==='later'&&!active){
        card.style.opacity='.45';card.style.pointerEvents='none';
      }
    }
    if(before!==next)updateLaterCount(active?1:-1);
    const cloud=document.getElementById('weeklyCloudStatus');
    if(cloud)cloud.textContent='本机已自动保存 · 建议每周备份一次';
    toast(active?'已加入稍后看':'已移出稍后看');
  }
  function invalidateOnce(){
    // Preference Memory fans out to the score and reading-time caches. The
    // remaining caches are independent and inexpensive to invalidate once.
    try{window.weeklyPreferenceMemoryV32?.invalidate?.();}catch(_){}
    try{window.weeklyFeedbackRuntimeV38?.invalidate?.();}catch(_){}
    try{window.weeklyLaterManagerV23?.invalidate?.();}catch(_){}
    try{window.weeklyLaterLearningV27?.invalidate?.();}catch(_){}
    try{window.weeklyPerformanceV28?.invalidate?.();}catch(_){}
  }
  function flush(){
    scheduled=false;const started=performance.now();pendingActions=0;invalidateOnce();
    try{if(typeof updateProgressTabs==='function')updateProgressTabs();}catch(_){}
    try{if(typeof renderArticles==='function')renderArticles();}catch(_){}
    try{if(typeof renderMetrics==='function')renderMetrics();}catch(_){}
    try{if(typeof renderPrefs==='function')renderPrefs();}catch(_){}
    batches++;lastBatchMs=Math.round((performance.now()-started)*10)/10;
  }
  function scheduleFlush(){
    pendingActions++;if(scheduled)return;scheduled=true;
    if(typeof requestIdleCallback==='function')requestIdleCallback(flush,{timeout:650});
    else setTimeout(flush,80);
  }
  function fastLater(a){
    const id=String(a?.id||'');if(!id)return previousSetStatus(a,'later');
    const existed=Object.prototype.hasOwnProperty.call(state,id),old=existed?state[id]:undefined;
    const effective=typeof st==='function'?st(id):(old||{}),before=effective?.status||'new';
    const next=before==='later'?'new':'later',now=Date.now();
    const cur={...(old&&typeof old==='object'?old:effective||{}),status:next};
    cur.status_origin=TRUSTED_STATUS_ORIGIN;cur.status_action='status';cur.status_updated_at=now;
    cur.updated_at=Math.max(Number(cur.updated_at||0),now);
    if(next==='later'&&!['bad','less'].includes(cur.feedback)){
      cur.later_interest_at=Math.max(Number(cur.later_interest_at||0),now);
      if(!cur.feedback_reason||cur.feedback_reason==='later_interest'){
        cur.feedback_reason='later_interest';cur.feedback_reason_updated_at=now;
      }
    }
    state[id]=cur;
    try{
      localStorage.setItem(STATE_KEY,JSON.stringify(state));
      if(!localStorage.getItem(DIRTY_KEY))localStorage.setItem(DIRTY_KEY,String(now));
    }catch(_){
      if(existed)state[id]=old;else delete state[id];
      return previousSetStatus(a,'later');
    }
    actions++;acknowledge(a,next,before);scheduleFlush();return next;
  }

  window.setStatus=setStatus=function(a,v){return v==='later'?fastLater(a):previousSetStatus(a,v);};
  window.weeklyInteractionPerformanceV40={
    flush,
    stats:()=>({actions,batches,pending_actions:pendingActions,scheduled,last_batch_ms:lastBatchMs,
      mode:'one-write + immediate-card + idle-batch'})
  };
})();
