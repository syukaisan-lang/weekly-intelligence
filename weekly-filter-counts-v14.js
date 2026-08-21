// Final filter guard + live option counts, optimized for mobile.
// Fixes legacy bug where gradeFilter=SAB was treated as no grade filter.
(() => {
  function gradeAllowed(filter,g){
    if(filter==='ALL')return true;
    if(filter==='SAB')return ['S','A','B'].includes(g);
    if(filter==='SA')return ['S','A'].includes(g);
    return g===filter;
  }

  if(typeof visible==='function'){
    const previousVisible=visible;
    visible=function(a){
      if(!previousVisible(a))return false;
      const gf=document.getElementById('gradeFilter')?.value||'ALL';
      return gradeAllowed(gf,grade(score(a)));
    };
  }

  const labels={
    gradeFilter:{SAB:'S + A + B',SA:'S + A',S:'只看 S',A:'只看 A',B:'只看 B',ALL:'全部'},
    statusFilter:{all:'全部状态',new:'未处理',later:'稍后看',read:'已读',save:'进 Notion',skip:'已跳过'},
  };

  function plainLabel(selectId,opt){
    const fixed=labels[selectId]?.[opt.value];
    if(fixed)return fixed;
    if(selectId==='sourceFilter'){
      if(opt.value==='all')return '全部来源';
      return opt.dataset.baseLabel||opt.textContent.replace(/\s*\(\d+\)\s*$/,'');
    }
    return opt.textContent.replace(/\s*\(\d+\)\s*$/,'');
  }

  // A single count refresh used to call semantic score hundreds/thousands of times.
  // Temporarily memoize the final score function for this refresh only.
  function withScoreMemo(fn){
    if(typeof score!=='function')return fn();
    const original=score,cache=new Map();
    score=function(a){
      const key=String(a?.id||'');
      if(cache.has(key))return cache.get(key);
      const v=original(a);cache.set(key,v);return v;
    };
    try{return fn();}finally{score=original;}
  }

  function countWith(select,value){
    const old=select.value;
    select.value=value;
    let n=0;
    try{for(const a of data.articles||[])if(visible(a))n++;}finally{select.value=old;}
    return n;
  }

  function updateSelectCounts(selectId){
    const sel=document.getElementById(selectId);if(!sel)return;
    for(const opt of sel.options){
      const base=plainLabel(selectId,opt);
      if(selectId==='sourceFilter'&&!opt.dataset.baseLabel)opt.dataset.baseLabel=base;
      const n=countWith(sel,opt.value);
      opt.textContent=`${base} (${n})`;
    }
  }

  let pending=false;
  function updateAllFilterCounts(){
    pending=false;
    withScoreMemo(()=>{
      updateSelectCounts('gradeFilter');
      updateSelectCounts('statusFilter');
      updateSelectCounts('sourceFilter');
    });
  }
  function scheduleCounts(){
    if(pending)return;pending=true;
    const run=()=>updateAllFilterCounts();
    if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:350});
    else setTimeout(run,60);
  }

  if(typeof renderArticles==='function'){
    const previousRenderArticles=renderArticles;
    renderArticles=function(){
      previousRenderArticles();
      scheduleCounts();
    };
  }

  for(const id of ['gradeFilter','statusFilter','sourceFilter']){
    document.getElementById(id)?.addEventListener('change',scheduleCounts);
  }

  window.weeklyFilterV14={gradeAllowed,updateAllFilterCounts,scheduleCounts};
  scheduleCounts();
})();
