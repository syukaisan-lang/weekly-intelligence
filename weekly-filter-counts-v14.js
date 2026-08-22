// v14.2: final filter guard + live faceted counts, aligned with the top progress/reconciliation logic.
(() => {
  const SEMANTIC_STATUS=new Set(['queue','later','done','skip','c']);
  const NEGATIVE=new Set(['bad','less']);
  function gradeAllowed(filter,g){if(filter==='ALL')return true;if(filter==='SAB')return ['S','A','B'].includes(g);if(filter==='SA')return ['S','A'].includes(g);return g===filter;}
  function human(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function semanticBucket(a){
    if(window.weeklyReconciliationV16?.bucket)return window.weeklyReconciliationV16.bucket(a);
    const s=human(a),status=s.status||'new';
    if(status==='later')return 'later';if(status==='skip')return 'skip';
    if(status==='read'||status==='save'||NEGATIVE.has(s.feedback))return 'done';
    let g='C';try{g=grade(score(a));}catch(_){}return g==='C'?'c':'queue';
  }
  function installStatusOptions(){
    const sel=document.getElementById('statusFilter');if(!sel)return;
    const old=sel.value;
    sel.innerHTML='<option value="all">全部状态</option><option value="queue">待处理 S/A/B</option><option value="later">稍后看</option><option value="done">已处理/保存</option><option value="skip">已跳过</option><option value="c">C级隐藏</option>';
    const mapped={new:'queue',read:'done',save:'done'}[old]||old;
    sel.value=[...sel.options].some(o=>o.value===mapped)?mapped:'all';
  }
  installStatusOptions();

  if(typeof visible==='function'){
    const previousVisible=visible;
    visible=function(a){
      const sfEl=document.getElementById('statusFilter'),sf=sfEl?.value||'all';
      let base=false;
      // Legacy visible() only understands raw statuses. Neutralize it while applying
      // the new mutually-exclusive semantic status below.
      if(sfEl&&SEMANTIC_STATUS.has(sf)){
        const old=sfEl.value;sfEl.value='all';
        try{base=previousVisible(a);}finally{sfEl.value=old;}
      }else base=previousVisible(a);
      if(!base)return false;
      const gf=document.getElementById('gradeFilter')?.value||'ALL';
      let g='C';try{g=grade(score(a));}catch(_){}
      if(!gradeAllowed(gf,g))return false;
      if(SEMANTIC_STATUS.has(sf)&&semanticBucket(a)!==sf)return false;
      return true;
    };
  }

  const labels={
    gradeFilter:{SAB:'S + A + B',SA:'S + A',S:'只看 S',A:'只看 A',B:'只看 B',ALL:'全部'},
    statusFilter:{all:'全部状态',queue:'待处理 S/A/B',later:'稍后看',done:'已处理/保存',skip:'已跳过',c:'C级隐藏'},
  };
  function plainLabel(selectId,opt){const fixed=labels[selectId]?.[opt.value];if(fixed)return fixed;if(selectId==='sourceFilter'){if(opt.value==='all')return '全部来源';return opt.dataset.baseLabel||opt.textContent.replace(/\s*\(\d+\)\s*$/,'');}return opt.textContent.replace(/\s*\(\d+\)\s*$/,'');}
  function withScoreMemo(fn){if(typeof score!=='function')return fn();const original=score,cache=new Map();score=function(a){const key=String(a?.id||'');if(cache.has(key))return cache.get(key);const v=original(a);cache.set(key,v);return v;};try{return fn();}finally{score=original;}}
  function countWith(select,value){const old=select.value;select.value=value;let n=0;try{for(const a of data.articles||[])if(visible(a))n++;}finally{select.value=old;}return n;}
  function updateSelectCounts(selectId){const sel=document.getElementById(selectId);if(!sel)return;for(const opt of sel.options){const base=plainLabel(selectId,opt);if(selectId==='sourceFilter'&&!opt.dataset.baseLabel)opt.dataset.baseLabel=base;const n=countWith(sel,opt.value);opt.textContent=`${base} (${n})`;}}
  let pending=false;
  function updateAllFilterCounts(){pending=false;withScoreMemo(()=>{updateSelectCounts('gradeFilter');updateSelectCounts('statusFilter');updateSelectCounts('sourceFilter');});}
  function scheduleCounts(){if(pending)return;pending=true;const run=()=>updateAllFilterCounts();if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:350});else setTimeout(run,60);}

  // A top-level progress tab defines a new main scope. Do not silently carry a
  // stale lower status filter into it; this was the source of “本周205 / 下方182”.
  if(typeof setProgress==='function'){
    const previousSetProgress=setProgress;
    window.setProgress=setProgress=function(key){const sf=document.getElementById('statusFilter');if(sf)sf.value='all';const out=previousSetProgress(key);scheduleCounts();return out;};
  }
  if(typeof renderArticles==='function'){const previousRenderArticles=renderArticles;renderArticles=function(){previousRenderArticles();scheduleCounts();};}
  for(const id of ['gradeFilter','statusFilter','sourceFilter'])document.getElementById(id)?.addEventListener('change',scheduleCounts);
  window.weeklyFilterV14={gradeAllowed,semanticBucket,updateAllFilterCounts,scheduleCounts};scheduleCounts();
})();
