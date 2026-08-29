// Weekly v21: estimated reading time + 30/60 minute value-aware focus budgets.
(() => {
  const BUDGET_KEY='weekly_intelligence_reading_budget_v21';
  const NEGATIVE=new Set(['bad','less']);
  const POSITIVE=new Set(['accurate','more']);
  const DAY=86400000;
  let budgetMode=localStorage.getItem(BUDGET_KEY)||'all';
  let focusCache=null;

  function hs(a){try{return st(a.id)||{};}catch(_){return state?.[a.id]||{};}}
  function safeScore(a){try{return Number(score(a))||5;}catch(_){return Number(a?.reading_score??5)||5;}}
  function safeGrade(a){try{return grade(safeScore(a));}catch(_){return a?.grade||'C';}}
  function articleTs(a){const x=Date.parse(a?.first_seen||a?.published||'');return Number.isFinite(x)?x:0;}
  function formats(a){return a?.learning_features?.formats||[];}
  function signals(a){return a?.learning_features?.signals||[];}

  function estimateMinutes(a){
    const explicit=Number(a?.reading_time_minutes||a?.estimated_reading_minutes||0);
    if(explicit>0)return Math.max(1,Math.min(20,Math.round(explicit)));
    const excerpt=String(a?.content_excerpt||'').replace(/\s+/g,'');
    let chars=Number(a?.content_char_count||0)||excerpt.length;
    const fs=formats(a).join(' '),ss=signals(a).join(' '),summary=String(a?.summary||'');
    let mins=0;
    if(a?.content_checked&&chars>0){
      if(!a?.content_char_count&&chars>=4800)chars=6500;
      mins=chars/600;
      if(/調査レポート|インタビュー|対談/.test(fs))mins*=1.12;
      if(/一次データ/.test(ss)||/調査|データ|統計|アンケート/.test(summary))mins+=0.6;
    }else{
      if(/インタビュー|対談/.test(fs))mins=9;
      else if(/調査レポート/.test(fs))mins=7;
      else if(/事例|ケース|解説|ハウツー/.test(fs))mins=6;
      else if(/ランキング|まとめ/.test(fs))mins=4;
      else if(/セミナー|イベント|新商品|新サービス|キャンペーン|販促/.test(fs))mins=2;
      else mins=4;
      if(summary.length>=900)mins+=1;
    }
    return Math.max(2,Math.min(15,Math.ceil(mins)));
  }
  function timeClass(m){return m<=3?'短读':m<=7?'中读':'深读';}

  function focusValue(a){
    if(window.weeklyFocusFeedbackV17?.focusValue){try{return Number(window.weeklyFocusFeedbackV17.focusValue(a))||safeScore(a);}catch(_){}}
    const kc=a?.knowledge_context||{};let v=safeScore(a),inc=kc.increment_type||'';
    if(safeGrade(a)==='S')v+=1.15;
    if(inc==='direct_work_use')v+=.55;
    if(inc==='knowledge_gap')v+=.48;
    if(inc==='rule_evidence')v+=.42;
    if(inc==='boundary_or_counterexample')v+=.45;
    if(inc==='mostly_duplicate')v-=.62;
    return v;
  }
  function isFocusCandidate(a){
    const s=hs(a),g=safeGrade(a),ts=articleTs(a);
    // Priority reading is intentionally S/A only. B remains available in normal/all views.
    if(!['S','A'].includes(g))return false;
    if(NEGATIVE.has(s.feedback))return false;
    if(['later','read','save','skip'].includes(s.status))return false;
    if(s.feedback&&!POSITIVE.has(s.feedback))return false;
    if(ts&&Date.now()-ts>=7*DAY)return false;
    return true;
  }
  function focusLimit(rows){const strong=rows.filter(a=>safeGrade(a)==='S'||safeScore(a)>=7.8).length;return Math.max(15,Math.min(30,Math.max(18,strong+8)));}
  function allFocusRows(){
    const rows=(data?.articles||[]).filter(isFocusCandidate).sort((a,b)=>focusValue(b)-focusValue(a));
    return rows.slice(0,focusLimit(rows));
  }
  function matchesUiFilters(a){
    const gf=document.getElementById('gradeFilter')?.value||'SAB',src=document.getElementById('sourceFilter')?.value||'all',sf=document.getElementById('statusFilter')?.value||'all',g=safeGrade(a);
    if(gf==='SA'&&!['S','A'].includes(g))return false;
    if(['S','A','B'].includes(gf)&&g!==gf)return false;
    if(gf==='SAB'&&!['S','A'].includes(g))return false;
    if(src!=='all'&&a.source!==src)return false;
    if(!['all','queue'].includes(sf))return false;
    return true;
  }
  function fitBudget(rows,minutes){
    if(!Number(minutes))return rows;
    const ranked=rows.slice().sort((a,b)=>{
      const da=(focusValue(a)+(safeGrade(a)==='S' ? .35 : 0))/Math.pow(estimateMinutes(a),.45);
      const db=(focusValue(b)+(safeGrade(b)==='S' ? .35 : 0))/Math.pow(estimateMinutes(b),.45);
      return db-da||focusValue(b)-focusValue(a);
    });
    const out=[];let used=0;
    for(const a of ranked){const m=estimateMinutes(a);if(used+m<=minutes){out.push(a);used+=m;}}
    if(!out.length&&ranked.length)out.push(ranked[0]);
    return out.sort((a,b)=>focusValue(b)-focusValue(a));
  }
  function currentFocus(){
    if(focusCache)return focusCache;
    const all=allFocusRows().filter(matchesUiFilters);
    const target=budgetMode==='30'?30:budgetMode==='60'?60:0;
    const selected=fitBudget(all,target);
    focusCache={all,selected,selectedIds:new Set(selected.map(a=>String(a.id))),target};return focusCache;
  }
  function invalidate(){focusCache=null;}

  if(window.weeklyFocusFeedbackV17)window.weeklyFocusFeedbackV17.focusRows=allFocusRows;

  if(typeof visible==='function'){
    const previousVisible=visible;
    visible=function(a){
      if(typeof readingProgress==='undefined'||readingProgress!=='focus')return previousVisible(a);
      if(!isFocusCandidate(a)||!matchesUiFilters(a))return false;
      return currentFocus().selectedIds.has(String(a.id));
    };
  }

  function articleFromCard(card){
    const link=card.querySelector('.article-title');if(!link)return null;
    const href=link.getAttribute('href'),title=link.textContent.trim();
    return (data?.articles||[]).find(a=>a.url===href||a.title===title)||null;
  }
  function annotateCards(){
    document.querySelectorAll('#articleList .article').forEach(card=>{
      const a=articleFromCard(card);if(!a)return;
      const scores=card.querySelector('.scores');if(!scores||scores.querySelector('.reading-time-score'))return;
      const m=estimateMinutes(a),x=document.createElement('span');x.className='score reading-time-score';x.textContent=`≈ ${m} 分钟 · ${timeClass(m)}`;scores.appendChild(x);
    });
  }
  function ensurePanel(){
    let panel=document.getElementById('weeklyReadingBudget');if(panel)return panel;
    panel=document.createElement('div');panel.id='weeklyReadingBudget';panel.className='reading-budget-panel';
    panel.innerHTML='<div class="reading-budget-summary"></div><div class="reading-budget-buttons"><button type="button" data-budget="all">全部优先</button><button type="button" data-budget="30">30分钟可读</button><button type="button" data-budget="60">60分钟可读</button></div><div class="reading-budget-note">优先阅读仅包含 S/A；时间为估算。有正文时按日文约600字符/分钟，并对调查/访谈增加阅读成本。</div>';
    const hint=document.getElementById('weeklyAttentionHint');
    if(hint)hint.insertAdjacentElement('afterend',panel);else document.querySelector('#articleList')?.previousElementSibling?.appendChild(panel);
    panel.querySelectorAll('[data-budget]').forEach(btn=>btn.addEventListener('click',()=>{
      budgetMode=btn.dataset.budget||'all';localStorage.setItem(BUDGET_KEY,budgetMode);invalidate();
      window.weeklyMobilePerformanceV18?.resetLimit?.();renderArticles();
    }));
    return panel;
  }
  function updatePanel(){
    const panel=ensurePanel(),focus=allFocusRows().filter(matchesUiFilters),cur=currentFocus();
    const allMin=focus.reduce((n,a)=>n+estimateMinutes(a),0),selMin=cur.selected.reduce((n,a)=>n+estimateMinutes(a),0);
    const active=typeof readingProgress!=='undefined'&&readingProgress==='focus';panel.hidden=!active;
    panel.querySelectorAll('[data-budget]').forEach(b=>b.classList.toggle('active',b.dataset.budget===budgetMode));
    const summary=panel.querySelector('.reading-budget-summary');
    if(summary)summary.innerHTML=active?`<b>${cur.selected.length} 篇</b> · 预计约 <b>${selMin} 分钟</b>${cur.target?` / ${cur.target} 分钟预算`:''}<span>全部优先 S/A：${focus.length} 篇 · 约 ${allMin} 分钟</span>`:'';
    const vc=document.getElementById('visibleCount');if(active&&vc)vc.textContent=`${cur.selected.length} 篇 · ≈${selMin}分钟`;
    const tab=document.querySelector('[data-progress="focus"] .segment-count');if(tab)tab.textContent=String(allFocusRows().length);
    const hint=document.getElementById('weeklyAttentionHint');
    if(active&&hint)hint.textContent=cur.target?`优先阅读仅看 S/A：按个人价值与预计阅读成本组合出 ${cur.target} 分钟内价值更高的一组文章。`:`优先阅读仅看 S/A：${focus.length} 篇预计约 ${allMin} 分钟；可切换 30 / 60 分钟阅读预算。`;
  }

  if(typeof renderArticles==='function'){
    const previousRender=renderArticles;
    renderArticles=function(){invalidate();previousRender();annotateCards();updatePanel();};
  }
  if(typeof setProgress==='function'){
    const previousSet=setProgress;
    setProgress=function(key){invalidate();const r=previousSet(key);setTimeout(updatePanel,0);return r;};
  }
  for(const id of ['gradeFilter','statusFilter','sourceFilter'])document.getElementById(id)?.addEventListener('change',invalidate,{capture:true});
  document.getElementById('personalizedSort')?.addEventListener('change',invalidate,{capture:true});

  if(typeof renderArticles==='function')renderArticles();
  window.weeklyReadingTimeV21={estimateMinutes,allFocusRows,currentFocus,fitBudget,invalidate};
})();
