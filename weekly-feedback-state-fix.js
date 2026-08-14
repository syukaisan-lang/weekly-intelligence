// Reconcile feedback with the reading queue on every device.
// Hard invariant: once learning feedback exists, the article must never appear in unread/pending.
(() => {
  const TRUSTED_STATUS_ORIGIN='human_v10';

  function hasFeedback(aOrId){
    const id=typeof aOrId==='object'?aOrId?.id:aOrId;
    if(!id)return false;
    try{return !!st(id).feedback;}catch(_){return !!state?.[id]?.feedback;}
  }

  function markFeedbackProcessed(id){
    const cur=state?.[id];
    if(!cur||!cur.feedback)return false;
    if(cur.status!=='new'&&cur.status!=='later')return false;
    const now=Date.now();
    cur.status='read';
    cur.status_origin=TRUSTED_STATUS_ORIGIN;
    cur.status_action='feedback';
    cur.status_updated_at=now;
    cur.updated_at=now;
    state[id]=cur;
    return true;
  }

  // Repair existing records created while feedback and unread/later diverged.
  let migrated=false;
  for(const id of Object.keys(state||{}))migrated=markFeedbackProcessed(id)||migrated;
  if(migrated&&typeof save==='function')save();

  // Queue bucket guard used by the progress layer.
  if(typeof progressBucketFor==='function'){
    const previousProgressBucketFor=progressBucketFor;
    progressBucketFor=function(a){
      if(hasFeedback(a))return 'read';
      return previousProgressBucketFor(a);
    };
  }

  // Source-audit/attention API has its own unread classifier. Patch the exported API too.
  for(const key of ['weeklySourceAuditV11','weeklySourceAuditV10']){
    const api=window[key];
    if(api&&typeof api.isRecommendedUnread==='function'&&!api.__feedbackPendingFix){
      const previous=api.isRecommendedUnread.bind(api);
      api.isRecommendedUnread=function(a){return hasFeedback(a)?false:previous(a);};
      api.__feedbackPendingFix=true;
    }
  }

  // The source-audit layer also closes over its original unread classifier inside visible().
  // This final wrapper guarantees that no feedback-labelled item can leak into the unread view.
  if(typeof visible==='function'){
    const previousVisible=visible;
    visible=function(a){
      if(typeof readingProgress!=='undefined'&&readingProgress==='unread'&&hasFeedback(a))return false;
      return previousVisible(a);
    };
  }

  // Correct tab counts even if an older source-audit script is still present in cache.
  if(typeof updateProgressTabs==='function'){
    const previousUpdateProgressTabs=updateProgressTabs;
    updateProgressTabs=function(){
      previousUpdateProgressTabs();
      const arts=Array.isArray(data?.articles)?data.articles:[];
      const unread=arts.filter(a=>{
        if(hasFeedback(a))return false;
        const api=window.weeklySourceAuditV11||window.weeklySourceAuditV10;
        if(api?.isRecommendedUnread)return api.isRecommendedUnread(a);
        try{return progressBucketFor(a)==='unread'&&['S','A','B'].includes(grade(score(a)));}catch(_){return false;}
      }).length;
      const btn=document.querySelector('[data-progress="unread"] .segment-count');
      if(btn)btn.textContent=String(unread);
    };
  }

  // Preserve existing feedback learning, then persist the processed/read state immediately.
  if(typeof feedback==='function'){
    const previousFeedback=feedback;
    window.feedback=feedback=function(a,v){
      previousFeedback(a,v);
      const cur=state?.[a.id];
      if(cur?.feedback){
        markFeedbackProcessed(a.id);
        save();
      }
      if(typeof rebuildPrefs==='function')rebuildPrefs();
      if(typeof render==='function')render();
      else if(typeof renderArticles==='function')renderArticles();
      if(typeof updateProgressTabs==='function')updateProgressTabs();
    };
  }

  if(migrated){
    if(typeof rebuildPrefs==='function')rebuildPrefs();
    if(typeof render==='function')render();
  }
  if(typeof updateProgressTabs==='function')updateProgressTabs();
})();
