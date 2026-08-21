// Reconcile feedback with reading state.
// Positive feedback is recommendation training only; negative feedback is a processing action.
(() => {
  const TRUSTED_STATUS_ORIGIN='human_v10';
  const POSITIVE=new Set(['accurate','more']);
  const NEGATIVE=new Set(['bad','less']);
  function feedbackOf(aOrId){const id=typeof aOrId==='object'?aOrId?.id:aOrId;if(!id)return null;try{return st(id).feedback||null;}catch(_){return state?.[id]?.feedback||null;}}
  function isPositive(aOrId){return POSITIVE.has(feedbackOf(aOrId));}
  function isNegative(aOrId){return NEGATIVE.has(feedbackOf(aOrId));}
  function markNegativeProcessed(id){const cur=state?.[id];if(!cur||!NEGATIVE.has(cur.feedback))return false;if(cur.status==='later')return false;if(cur.status!=='new')return false;const now=Date.now();cur.status='read';cur.status_origin=TRUSTED_STATUS_ORIGIN;cur.status_action='negative_feedback';cur.status_updated_at=now;cur.updated_at=now;state[id]=cur;return true;}
  // Do not auto-migrate old positive feedback. Only negative feedback may become processed.
  let migrated=false;for(const id of Object.keys(state||{}))migrated=markNegativeProcessed(id)||migrated;if(migrated&&typeof save==='function')save();
  if(typeof progressBucketFor==='function'){const previous=progressBucketFor;progressBucketFor=function(a){const s=st(a.id).status;if(s==='later')return 'later';if(isNegative(a)&&s==='new')return 'read';return previous(a);};}
  for(const key of ['weeklySourceAuditV11','weeklySourceAuditV10']){const api=window[key];if(api&&typeof api.isRecommendedUnread==='function'&&!api.__feedbackPendingFix){const previous=api.isRecommendedUnread.bind(api);api.isRecommendedUnread=function(a){return isNegative(a)?false:previous(a);};api.__feedbackPendingFix=true;}}
  if(typeof visible==='function'){const previous=visible;visible=function(a){if(typeof readingProgress!=='undefined'&&readingProgress==='unread'&&isNegative(a))return false;return previous(a);};}
  if(typeof updateProgressTabs==='function'){const previous=updateProgressTabs;updateProgressTabs=function(){previous();const arts=Array.isArray(data?.articles)?data.articles:[];const unread=arts.filter(a=>{if(isNegative(a))return false;const api=window.weeklySourceAuditV11||window.weeklySourceAuditV10;if(api?.isRecommendedUnread)return api.isRecommendedUnread(a);try{return progressBucketFor(a)==='unread'&&['S','A','B'].includes(grade(score(a)));}catch(_){return false;}}).length;const btn=document.querySelector('[data-progress="unread"] .segment-count');if(btn)btn.textContent=String(unread);};}
  if(typeof feedback==='function'){const previous=feedback;window.feedback=feedback=function(a,v){previous(a,v);if(NEGATIVE.has(v)){markNegativeProcessed(a.id);save();}else if(POSITIVE.has(v)){const cur=state?.[a.id];if(cur&&cur.status_action==='feedback'&&cur.status==='read'){cur.status='new';cur.status_action='positive_feedback_only';cur.status_updated_at=Date.now();cur.updated_at=Date.now();state[a.id]=cur;save();}}if(typeof rebuildPrefs==='function')rebuildPrefs();if(typeof render==='function')render();else if(typeof renderArticles==='function')renderArticles();if(typeof updateProgressTabs==='function')updateProgressTabs();};}
  if(migrated){if(typeof rebuildPrefs==='function')rebuildPrefs();if(typeof render==='function')render();}if(typeof updateProgressTabs==='function')updateProgressTabs();
})();
