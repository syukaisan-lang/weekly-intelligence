// Weekly v29: make Priority Reading vs Pending S/A semantics explicit and keep counts/list labels aligned.
(() => {
  const BUDGET_KEY='weekly_intelligence_reading_budget_v21';

  function setButtonLabel(key,label,title=''){
    const btn=document.querySelector(`[data-progress="${key}"]`);if(!btn)return;
    const count=btn.querySelector('.segment-count');
    [...btn.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).forEach(n=>n.remove());
    btn.insertBefore(document.createTextNode(label+' '),count||btn.firstChild);
    if(title)btn.title=title;
  }
  function hs(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function safeGrade(a){try{return grade(score(a));}catch(_){return a?.grade||'C';}}
  function allRows(){return window.weeklyUiFixesV25?.allRows?.()||(Array.isArray(data?.articles)?data.articles:[]);}
  function queueRows(){
    return allRows().filter(a=>{
      const s=hs(a),status=s.status||'new';
      if(status!=='new')return false;
      if(['bad','less'].includes(s.feedback))return false;
      return ['S','A'].includes(safeGrade(a));
    });
  }
  function priorityRows(){
    const api=window.weeklyReadingTimeV21;if(!api?.allFocusRows)return [];
    let rows=api.allFocusRows();
    const mode=localStorage.getItem(BUDGET_KEY)||'all';
    if((mode==='30'||mode==='60')&&api.fitBudget)rows=api.fitBudget(rows,Number(mode));
    return rows;
  }
  function priorityMinutes(rows){
    const fn=window.weeklyReadingTimeV21?.estimateMinutes;
    return rows.reduce((n,a)=>n+(fn?Number(fn(a)||0):0),0);
  }
  function ensureRelationNote(){
    let x=document.getElementById('queueHierarchyNote');if(x)return x;
    const host=document.querySelector('.reading-progress-head>div .muted.small');if(!host)return null;
    x=document.createElement('span');x.id='queueHierarchyNote';host.appendChild(x);return x;
  }
  function updateHierarchy(){
    setButtonLabel('focus','优先阅读','待处理 S/A 中再筛出的最高优先级子集；这里的数字就是当前优先清单规模');
    setButtonLabel('unread','待处理 S/A','尚未处理的完整 S/A 队列；优先阅读只是其中一部分');
    const q=queueRows(),p=priorityRows();
    const focusCount=document.querySelector('[data-progress="focus"] .segment-count');if(focusCount)focusCount.textContent=String(p.length);
    const unreadCount=document.querySelector('[data-progress="unread"] .segment-count');if(unreadCount)unreadCount.textContent=String(q.length);
    const note=ensureRelationNote();
    if(note)note.textContent=` 待处理 S/A ${q.length} 篇 → 优先阅读 ${p.length} 篇（从待处理队列中再筛一层）。`;
  }
  function updateReconciliation(){
    const root=document.getElementById('weeklyReconciliation');if(!root)return;
    const active=typeof readingProgress!=='undefined'&&readingProgress==='week';
    root.hidden=!active;
    const title=root.querySelector('.weekly-recon-title b');if(title&&/^本周\s/.test(title.textContent||''))title.textContent=title.textContent.replace(/^本周\s*/,'本周状态 ');
    const q=root.querySelector('[data-recon="queue"]');if(q){const b=q.querySelector('b');q.childNodes.forEach(n=>{if(n.nodeType===Node.TEXT_NODE)n.textContent='';});q.insertBefore(document.createTextNode('本周待处理 S/A '),b||q.firstChild);}
  }
  function sectionCopy(){
    const head=document.querySelector('.layout>section>.section-head');if(!head)return;
    const h=head.querySelector('h2'),p=head.querySelector('p');
    const rp=typeof readingProgress!=='undefined'?readingProgress:'';
    const copy={
      focus:['优先阅读','这里只显示“待处理 S/A”里再次排序后的优先子集；下面的阅读时间和篇数就是当前实际优先清单。'],
      unread:['待处理 S/A','这是完整的未处理 S/A 队列；“优先阅读”只是从这里再挑出最值得先看的部分。'],
      week:['本周文章','本周新入库文章的状态分布；“本周待处理 S/A”与跨周的“待处理 S/A”不是同一个范围。'],
      later:['稍后看','你主动留下的阅读清单；这是最高权重的推荐学习信号。'],
      archive:['未处理归档','超过处理窗口但仍可回看的历史待处理文章。'],
      marked:['已标记','所有已有状态或反馈的文章。'],
      read:['已读 / 已保存','已经完成阅读处理或保存的文章。'],
      skip:['已跳过','明确跳过的文章。'],
      all:['全部文章','完整文章库。']
    };
    const c=copy[rp]||['文章列表',''];if(h)h.textContent=c[0];if(p)p.textContent=c[1];
  }
  function updateBudgetPanel(){
    const panel=document.getElementById('weeklyReadingBudget');if(!panel)return;
    const active=typeof readingProgress!=='undefined'&&readingProgress==='focus';
    if(!active)return;
    const rows=priorityRows(),mins=priorityMinutes(rows),mode=localStorage.getItem(BUDGET_KEY)||'all';
    const summary=panel.querySelector('.reading-budget-summary');
    if(summary)summary.innerHTML=`<b>${rows.length} 篇优先阅读</b> · 预计约 <b>${mins} 分钟</b>${mode==='30'||mode==='60'?` / ${mode} 分钟预算`:''}<span>来源：待处理 S/A ${queueRows().length} 篇中再筛选</span>`;
    const note=panel.querySelector('.reading-budget-note');if(note)note.textContent='这里的篇数就是下方实际显示的“优先阅读”清单，不等于全部待处理 S/A。';
    const vc=document.getElementById('visibleCount');if(vc)vc.textContent=`${rows.length} 篇优先阅读 · ≈${mins}分钟`;
  }
  function sync(){updateHierarchy();updateReconciliation();sectionCopy();updateBudgetPanel();}

  if(typeof setProgress==='function'){
    const previous=setProgress;
    window.setProgress=setProgress=function(key){
      const gf=document.getElementById('gradeFilter'),sf=document.getElementById('statusFilter');
      if(key==='focus'||key==='unread'){if(gf)gf.value='SA';if(sf)sf.value='all';}
      const out=previous(key);setTimeout(sync,0);return out;
    };
  }
  if(typeof renderArticles==='function'){
    const previous=renderArticles;
    renderArticles=function(){const out=previous();setTimeout(sync,0);return out;};
  }
  if(typeof updateProgressTabs==='function'){
    const previous=updateProgressTabs;
    updateProgressTabs=function(){const out=previous();setTimeout(sync,0);return out;};
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-budget]')||e.target.closest('[data-recon]'))setTimeout(sync,0);});
  ['gradeFilter','statusFilter','sourceFilter','personalizedSort'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>setTimeout(sync,0)));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(sync,0));else setTimeout(sync,0);
  window.weeklyQueueClarityV29={queueRows,priorityRows,sync};

  function loadAdaptiveLearning(){
    if(document.querySelector('script[data-weekly-adaptive-learning-v31]'))return;
    const x=document.createElement('script');x.src='weekly-adaptive-learning-v31.js?v=20260905-0945';x.dataset.weeklyAdaptiveLearningV31='1';x.async=false;document.body.appendChild(x);
  }
  // v30 must run after v28/v29 so it can apply the final score guard; v31 then clears stale priority caches and learns from usage.
  function loadPreferenceGuard(){
    if(document.querySelector('script[data-weekly-preference-guard-v30]')){loadAdaptiveLearning();return;}
    const s=document.createElement('script');s.src='weekly-preference-guard-v30.js?v=20260905-0930';s.dataset.weeklyPreferenceGuardV30='1';s.async=false;s.addEventListener('load',loadAdaptiveLearning,{once:true});document.body.appendChild(s);
  }
  if(document.readyState==='complete')setTimeout(loadPreferenceGuard,0);else window.addEventListener('load',()=>setTimeout(loadPreferenceGuard,0),{once:true});
})();
