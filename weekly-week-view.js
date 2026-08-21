// Stable weekly view: counts articles by first_seen since Monday 00:00 JST.
// This is intentionally independent of the latest fetch run, so retries cannot overwrite weekly totals with zero.
(() => {
  const JST_MS=9*60*60*1000;
  const VIEW_KEY='weekly_intelligence_view_v2';

  function weekStartMs(){
    const jst=new Date(Date.now()+JST_MS);
    const weekday=(jst.getUTCDay()+6)%7; // Monday=0
    return Date.UTC(jst.getUTCFullYear(),jst.getUTCMonth(),jst.getUTCDate()-weekday,0,0,0,0)-JST_MS;
  }

  function articleSeenMs(a){
    const raw=a?.first_seen||a?.published||a?.date||'';
    const ms=Date.parse(raw);
    return Number.isFinite(ms)?ms:0;
  }

  function isThisWeek(a){return articleSeenMs(a)>=weekStartMs();}
  function weekArticles(){return (Array.isArray(data?.articles)?data.articles:[]).filter(isThisWeek);}

  // Existing progress/source-audit layers all wrap visible(). For the special weekly view,
  // temporarily ask the previous stack for its "all" result, then apply only the week boundary.
  if(typeof visible==='function'){
    const previousVisible=visible;
    visible=function(a){
      if(typeof readingProgress==='undefined'||readingProgress!=='week')return previousVisible(a);
      const old=readingProgress;
      try{
        readingProgress='all';
        return previousVisible(a)&&isThisWeek(a);
      }finally{readingProgress=old;}
    };
  }

  if(typeof updateProgressTabs==='function'){
    const previousUpdateProgressTabs=updateProgressTabs;
    updateProgressTabs=function(){
      previousUpdateProgressTabs();
      const btn=document.querySelector('[data-progress="week"] .segment-count');
      if(btn)btn.textContent=String(weekArticles().length);
      document.querySelectorAll('[data-progress]').forEach(x=>x.classList.toggle('active',x.dataset.progress===readingProgress));
    };
  }

  // Replace run-level "新增 0" with a persistent Monday-to-now total.
  if(typeof renderMetrics==='function'){
    const previousRenderMetrics=renderMetrics;
    renderMetrics=function(){
      previousRenderMetrics();
      const n=weekArticles().length;
      const cards=document.querySelectorAll('#metrics .metric');
      if(cards[0]){
        const label=cards[0].querySelector('.metric-label');
        const value=cards[0].querySelector('.metric-value');
        const sub=cards[0].querySelector('.metric-sub');
        if(label)label.textContent='本周新增';
        if(value)value.textContent=String(n);
        if(sub)sub.textContent='周一 00:00 JST 起';
      }
      if(cards[1]){
        const label=cards[1].querySelector('.metric-label');
        const value=cards[1].querySelector('.metric-value');
        const sub=cards[1].querySelector('.metric-sub');
        if(label)label.textContent='本周唯一';
        if(value)value.textContent=String(n);
        if(sub)sub.textContent='已入库去重文章';
      }
      if(typeof updateProgressTabs==='function')updateProgressTabs();
    };
  }

  // weekly-progress.js predates the "week" bucket. Restore a saved weekly view after reload.
  try{
    const saved=JSON.parse(localStorage.getItem(VIEW_KEY)||'{}')||{};
    if(saved.progress==='week'&&typeof readingProgress!=='undefined')readingProgress='week';
  }catch(_){}

  window.weeklyWeekView={isThisWeek,weekStartMs,weekArticles};
  if(typeof updateProgressTabs==='function')updateProgressTabs();
})();
