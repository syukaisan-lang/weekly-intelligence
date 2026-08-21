// v18: hard mobile performance layer.
// Only a small slice of the filtered list enters the expensive card-render pipeline.
(() => {
  const MOBILE_STEP=20, DESKTOP_STEP=60;
  let limit=window.matchMedia('(max-width: 700px)').matches?MOBILE_STEP:DESKTOP_STEP;
  let rendering=false;
  const finalScore=typeof score==='function'?score:null;
  const scoreMemo=new Map();

  if(finalScore){
    score=function(a){
      const id=String(a?.id||'');
      if(scoreMemo.has(id))return scoreMemo.get(id);
      const v=finalScore(a);scoreMemo.set(id,v);return v;
    };
  }
  function invalidateScores(){scoreMemo.clear();}

  // Feedback changes personalization. Clear memo BEFORE the existing feedback pipeline renders.
  if(typeof feedback==='function'){
    const prev=feedback;
    feedback=function(a,v){invalidateScores();return prev(a,v);};
  }
  if(typeof setStatus==='function'){
    const prev=setStatus;
    setStatus=function(a,v){return prev(a,v);};
  }
  document.getElementById('resetLearning')?.addEventListener('click',invalidateScores,{capture:true});

  function step(){return window.matchMedia('(max-width: 700px)').matches?MOBILE_STEP:DESKTOP_STEP;}
  function resetLimit(){limit=step();}
  function allRows(){return Array.isArray(data?.articles)?data.articles:[];}
  function selectedRows(rows){
    if(typeof readingProgress!=='undefined'&&readingProgress==='focus'&&window.weeklyFocusFeedbackV17?.focusRows){
      const focus=window.weeklyFocusFeedbackV17.focusRows();
      // focusRows already applies the queue ranking; still respect source/status/grade guard through visible.
      return focus.filter(a=>{try{return visible(a);}catch(_){return true;}});
    }
    return rows.filter(a=>{try{return visible(a);}catch(_){return true;}});
  }
  function sortRows(rows){
    if(!document.getElementById('personalizedSort')?.checked)return rows;
    return rows.slice().sort((a,b)=>score(b)-score(a));
  }
  function ensureMoreButton(){
    let b=document.getElementById('mobileLoadMore');
    if(b)return b;
    b=document.createElement('button');b.id='mobileLoadMore';b.type='button';b.className='btn secondary load-more mobile-load-more';
    b.addEventListener('click',()=>{limit+=step();renderArticles();});
    document.getElementById('articleList')?.insertAdjacentElement('afterend',b);
    return b;
  }

  if(typeof renderArticles==='function'){
    const prevRender=renderArticles;
    renderArticles=function(){
      if(rendering)return;
      const full=allRows();
      // Compute the filtered result once with memoized final scores.
      const selected=sortRows(selectedRows(full));
      const total=selected.length,shown=Math.min(limit,total),slice=selected.slice(0,shown);
      rendering=true;
      try{
        data.articles=slice;
        prevRender();
      }finally{
        data.articles=full;
        rendering=false;
      }
      const vc=document.getElementById('visibleCount');
      if(vc)vc.textContent=total>shown?`显示 ${shown} / ${total} 篇`:`${total} 篇`;
      const b=ensureMoreButton();
      if(b){
        b.hidden=shown>=total;
        b.textContent=shown<total?`加载更多（剩 ${total-shown}）`:'已全部显示';
      }
      // Counts and focus labels must use the restored full dataset, but can wait until idle.
      const idle=()=>{
        window.weeklyFilterV14?.updateAllFilterCounts?.();
        window.weeklyFocusFeedbackV17?.updateFocusTab?.();
        window.weeklyReconciliationV16?.render?.();
      };
      if('requestIdleCallback'in window)requestIdleCallback(idle,{timeout:900});else setTimeout(idle,120);
    };
  }

  // Changing the view/filter starts again from a small first page.
  for(const id of ['gradeFilter','statusFilter','sourceFilter']){
    document.getElementById(id)?.addEventListener('change',resetLimit,{capture:true});
  }
  document.getElementById('personalizedSort')?.addEventListener('change',()=>{resetLimit();invalidateScores();},{capture:true});
  if(typeof setProgress==='function'){
    const prev=setProgress;
    setProgress=function(key){resetLimit();return prev(key);};
  }

  window.weeklyMobilePerformanceV18={resetLimit,invalidateScores,scoreMemo};
})();
