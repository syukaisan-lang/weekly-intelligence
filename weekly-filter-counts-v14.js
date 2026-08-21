// Final filter guard + live option counts.
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

  function countWith(select,value){
    const old=select.value;
    select.value=value;
    let n=0;
    try{n=(data.articles||[]).filter(a=>visible(a)).length;}finally{select.value=old;}
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

  function updateAllFilterCounts(){
    updateSelectCounts('gradeFilter');
    updateSelectCounts('statusFilter');
    updateSelectCounts('sourceFilter');
  }

  if(typeof renderArticles==='function'){
    const previousRenderArticles=renderArticles;
    renderArticles=function(){
      previousRenderArticles();
      updateAllFilterCounts();
    };
  }

  for(const id of ['gradeFilter','statusFilter','sourceFilter']){
    document.getElementById(id)?.addEventListener('change',()=>{
      // Existing listeners perform the render; this runs afterward as a safe count refresh.
      setTimeout(updateAllFilterCounts,0);
    });
  }

  window.weeklyFilterV14={gradeAllowed,updateAllFilterCounts};
  updateAllFilterCounts();
})();
