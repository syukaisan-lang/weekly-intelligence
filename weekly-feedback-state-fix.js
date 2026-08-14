// Reconcile feedback with the reading queue on every device.
// A learning feedback click means the article has been processed; it must not remain in unread.
(() => {
  const TRUSTED_STATUS_ORIGIN='human_v10';

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

  // Repair existing mobile/local records created while feedback and unread state diverged.
  let migrated=false;
  for(const id of Object.keys(state||{})) migrated=markFeedbackProcessed(id)||migrated;
  if(migrated&&typeof save==='function')save();

  // Defensive queue classification: even before/without migration, feedback never belongs in unread.
  if(typeof progressBucketFor==='function'){
    const previousProgressBucketFor=progressBucketFor;
    progressBucketFor=function(a){
      const cur=st(a.id);
      if(cur.feedback&&(cur.status==='new'||cur.status==='later'))return 'read';
      return previousProgressBucketFor(a);
    };
  }

  // Preserve all existing feedback learning / cloud-stamp behavior, then reconcile read state.
  if(typeof feedback==='function'){
    const previousFeedback=feedback;
    window.feedback=feedback=function(a,v){
      previousFeedback(a,v);
      const changed=markFeedbackProcessed(a.id);
      if(changed){
        save();
        if(typeof rebuildPrefs==='function')rebuildPrefs();
        if(typeof render==='function')render();
        else if(typeof renderArticles==='function')renderArticles();
        if(typeof updateProgressTabs==='function')updateProgressTabs();
      }
    };
  }

  if(migrated){
    if(typeof rebuildPrefs==='function')rebuildPrefs();
    if(typeof render==='function')render();
    if(typeof updateProgressTabs==='function')updateProgressTabs();
  }
})();
