// v16: make weekly totals auditable and mutually exclusive.
(() => {
  function weekRows(){return window.weeklyWeekView?.weekArticles?.()||[];}
  function human(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function g(a){try{return grade(score(a));}catch(_){return a.grade||'C';}}
  function bucket(a){
    const s=human(a),status=s.status||'new';
    if(status==='later')return 'later';
    if(status==='skip')return 'skip';
    if(status==='read'||status==='save'||s.feedback)return 'done';
    if(g(a)==='C')return 'c';
    return 'queue';
  }
  function breakdown(){
    const out={total:0,queue:0,later:0,done:0,skip:0,c:0};
    for(const a of weekRows()){out.total++;out[bucket(a)]++;}
    return out;
  }
  function ensure(){
    let root=document.getElementById('weeklyReconciliation');
    if(root)return root;
    const progress=document.querySelector('.reading-progress');if(!progress)return null;
    root=document.createElement('div');root.id='weeklyReconciliation';root.className='weekly-reconciliation';
    progress.appendChild(root);return root;
  }
  function render(){
    const r=breakdown(),root=ensure();if(!root)return;
    root.innerHTML=`<div class="weekly-recon-title"><b>本周 ${r.total}</b><span>可对账：以下 5 项互斥，相加 = 本周总数</span></div><div class="weekly-recon-grid"><button data-recon="queue">待处理 <b>${r.queue}</b></button><button data-recon="later">稍后看 <b>${r.later}</b></button><button data-recon="done">已处理/保存 <b>${r.done}</b></button><button data-recon="skip">已跳过 <b>${r.skip}</b></button><button data-recon="c">C级隐藏 <b>${r.c}</b></button></div><div class="weekly-recon-check">${r.queue}+${r.later}+${r.done}+${r.skip}+${r.c} = ${r.total}</div>`;
    root.querySelectorAll('[data-recon]').forEach(btn=>btn.addEventListener('click',()=>{
      const k=btn.dataset.recon;
      if(k==='queue')setProgress?.('unread');
      else if(k==='later')setProgress?.('later');
      else if(k==='skip')setProgress?.('skip');
      else if(k==='done')setProgress?.('read');
      else {setProgress?.('week');const gf=document.getElementById('gradeFilter');if(gf){gf.value='ALL';renderArticles?.();}}
    }));
    const unread=document.querySelector('[data-progress="unread"]');
    if(unread){unread.childNodes[0].nodeValue='当前队列 ';unread.title='全局当前 S/A/B 待处理队列，不等于本周总数';}
  }
  const prevMetrics=typeof renderMetrics==='function'?renderMetrics:null;
  if(prevMetrics)renderMetrics=function(){prevMetrics();render();};
  const prevTabs=typeof updateProgressTabs==='function'?updateProgressTabs:null;
  if(prevTabs)updateProgressTabs=function(){prevTabs();render();};
  window.weeklyReconciliationV16={breakdown,render,bucket};
  render();
})();
