// Weekly v21.4: official-first, completeness-aware reading time + 30/60 minute value-aware focus budgets.
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
  function intents(a){return a?.learning_features?.intents||[];}
  function compactChars(v){return String(v||'').replace(/\s+/g,'').length;}
  function clampMinutes(v,max=60){return Math.max(1,Math.min(max,Math.round(Number(v)||0)));}
  function roundedMinutes(v,min=1,max=60){return Math.max(min,Math.min(max,Math.floor(Number(v||0)+.5)));}

  function sourcePrior(a){
    const s=String(a?.source||'');
    if(/Agenda note/.test(s))return 6;
    if(/MarkeZine/.test(s))return 5;
    if(/日経クロストレンド/.test(s))return 5;
    if(/ウェブ電通報/.test(s))return 5;
    if(/wisdom-evolution/.test(s))return 5;
    if(/ネットショップ担当者/.test(s))return 4;
    if(/ITmedia マーケティング/.test(s))return 4;
    if(/AdverTimes/.test(s))return 4;
    if(/ITmedia ビジネス/.test(s))return 4;
    return 4;
  }
  function priorForFormat(a,fs){
    let m=sourcePrior(a);
    if(/インタビュー|対談/.test(fs))m=Math.max(m,8);
    else if(/調査レポート/.test(fs))m=Math.max(m,7);
    else if(/事例|ケース|解説|ハウツー/.test(fs))m=Math.max(m,6);
    else if(/ランキング|まとめ/.test(fs))m=Math.max(m,5);
    else if(/セミナー|イベント|キャンペーン|販促/.test(fs))m=Math.min(m,2);
    else if(/新商品|新サービス/.test(fs))m=Math.min(m,3);
    return m;
  }
  function readingSpeed(chars,fs,is){
    if(chars<=1800||(chars<=3000&&/調査結果共有/.test(is)))return 800;
    if(chars<=3000)return 750;
    if(chars>=3500&&/インタビュー|対談/.test(fs))return 600;
    if(chars>=4000&&/調査レポート/.test(fs))return 625;
    if(chars>=4500&&/事例|ケース|解説|ハウツー/.test(fs))return 650;
    return 700;
  }
  function fallbackCompleteness(a,chars,excerpt){
    const c=String(a?.content_completeness||'').toLowerCase();
    if(['full','partial','unknown'].includes(c))return c;
    if(/ここから先は|続き(?:は|を).{0,18}(?:会員|ログイン|購読|有料|登録)|(?:会員|有料会員|購読者)限定|残り\s*\d+\s*(?:文字|ページ)|次のページ/.test(excerpt))return 'partial';
    if(chars>=11800||compactChars(excerpt)>=4900)return 'unknown';
    return 'unknown';
  }

  function readingTimeInfo(a){
    const official=Number(a?.reading_time_minutes||0);
    if(official>0){
      const isXtrend=a?.reading_time_source==='xtrend_official';
      return {minutes:clampMinutes(official,120),kind:isXtrend?'xtrend_official':'official',label:isXtrend?'XTrend官方':'官方',confidence:'official',exact:true};
    }
    const serverEstimate=Number(a?.estimated_reading_minutes||0);
    if(serverEstimate>0){
      const src=String(a?.reading_time_estimate_source||'server_estimate');
      const confidence=String(a?.reading_time_estimate_confidence||'low');
      let label='估算',kind='estimate';
      if(src==='body_full'){label='正文完整';kind='body_full';}
      else if(src==='body_partial'){label='正文部分';kind='body_partial';}
      else if(src==='body_unknown'||src==='body_excerpt'){label='正文未确认完整';kind='body_unknown';}
      return {minutes:clampMinutes(serverEstimate,60),kind,label,confidence,exact:false};
    }

    const fs=formats(a).join(' '),is=intents(a).join(' '),summary=String(a?.summary||'');
    const fullChars=Number(a?.content_char_count||0);
    const excerpt=String(a?.content_excerpt||'');
    const excerptChars=compactChars(excerpt);
    const chars=fullChars||excerptChars;

    if(a?.content_checked&&chars>0){
      const completeness=fallbackCompleteness(a,chars,excerpt),speed=readingSpeed(chars,fs,is),observed=roundedMinutes(chars/speed,1,60);
      if(completeness==='full')return {minutes:observed,kind:'body_full',label:'正文完整',confidence:'high',exact:false};
      if(completeness==='partial'){
        const mins=Math.max(observed+1,roundedMinutes(priorForFormat(a,fs),2,30));
        return {minutes:Math.min(60,mins),kind:'body_partial',label:'正文部分',confidence:'medium',exact:false};
      }
      return {minutes:Math.min(60,observed+(chars>=8000?1:0)),kind:'body_unknown',label:'正文未确认完整',confidence:'medium',exact:false};
    }

    let mins=priorForFormat(a,fs),summaryChars=compactChars(summary);
    if(summaryChars>=800)mins+=.5;if(summaryChars>=1300)mins+=.5;
    return {minutes:roundedMinutes(mins,2,30),kind:'estimate',label:'估算',confidence:'low',exact:false};
  }
  function estimateMinutes(a){return readingTimeInfo(a).minutes;}
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
      const info=readingTimeInfo(a),x=document.createElement('span');x.className='score reading-time-score';
      x.textContent=info.exact?`🕒 ${info.minutes} 分钟 · ${info.label}`:`≈ ${info.minutes} 分钟 · ${info.label}/${timeClass(info.minutes)}`;
      x.title=info.exact?'站点官方标注的阅读时间':info.kind==='body_full'?'按已确认完整正文长度估算':info.kind==='body_partial'?'正文只抓到部分，结合已读部分与文章形式估算全文':'正文完整度无法确认，时间为近似值';
      scores.appendChild(x);
    });
  }
  function ensurePanel(){
    let panel=document.getElementById('weeklyReadingBudget');if(panel)return panel;
    panel=document.createElement('div');panel.id='weeklyReadingBudget';panel.className='reading-budget-panel';
    panel.innerHTML='<div class="reading-budget-summary"></div><div class="reading-budget-buttons"><button type="button" data-budget="all">全部优先</button><button type="button" data-budget="30">30分钟可读</button><button type="button" data-budget="60">60分钟可读</button></div><div class="reading-budget-note">阅读时间优先级：站点官方时间 ＞ 已确认完整正文 ＞ 部分/未确认正文 ＞ 来源与文章形式估算。部分正文不会把已抓到的片段误当成全文。</div>';
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
    if(active&&hint)hint.textContent=cur.target?`优先阅读仅看 S/A：按个人价值与阅读成本组合出 ${cur.target} 分钟内价值更高的一组文章。`:`优先阅读仅看 S/A：${focus.length} 篇预计约 ${allMin} 分钟；可切换 30 / 60 分钟阅读预算。`;
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
  window.weeklyReadingTimeV21={estimateMinutes,readingTimeInfo,allFocusRows,currentFocus,fitBudget,invalidate};
})();
