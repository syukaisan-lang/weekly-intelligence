// Weekly v11.1 attention: rolling preference memory + adaptive S/A attention budget.
(() => {
  const FEEDBACK_WINDOW_MS=84*24*60*60*1000;
  const MIN_BUDGET=8, BASE_BUDGET=14, MAX_BUDGET=20;
  const baseRebuild=rebuildPrefs;
  const baseRender=renderArticles;

  function articleTs(a){
    const stv=state?.[a.id];
    const touched=Number(stv?.updated_at||0);
    if(touched)return touched;
    const d=Date.parse(a.published||a.first_seen||'');
    return Number.isFinite(d)?d:0;
  }
  function inRollingWindow(a){
    const ts=articleTs(a);return !ts||Date.now()-ts<=FEEDBACK_WINDOW_MS;
  }
  rebuildPrefs=function(){
    const all=data.articles||[];
    data.articles=all.filter(a=>inRollingWindow(a));
    try{baseRebuild();}finally{data.articles=all;}
  };

  function feedbackStats(){
    let pos=0,neg=0,n=0;
    for(const a of data.articles||[]){
      if(!inRollingWindow(a))continue;
      const s=st(a.id),fb=s.feedback,status=s.status;
      let p=0,m=0;
      if(fb==='more')p+=1;
      else if(fb==='accurate')p+=.45;
      else if(fb==='less')m+=1;
      else if(fb==='bad')m+=.55;
      if(status==='save')p+=.8;
      else if(status==='read'&&s.status_action==='status'&&!['bad','less'].includes(fb))p+=.2;
      else if(status==='skip')m+=.7;
      if(p||m){pos+=p;neg+=m;n++;}
    }
    return {pos,neg,n};
  }
  function queueUnread(a){
    const api=window.weeklySourceAuditV11||window.weeklySourceAuditV10;
    if(api?.isRecommendedUnread){
      try{return api.isRecommendedUnread(a)&&['S','A'].includes(grade(score(a)));}catch(_){}
    }
    return progressBucketFor(a)==='unread'&&['S','A'].includes(grade(score(a)));
  }
  function attentionBudget(){
    const f=feedbackStats();let b=BASE_BUDGET;
    if(f.n>=4){
      const ratio=f.pos/(f.pos+f.neg||1);
      if(ratio>=.68)b+=4;
      else if(ratio>=.56)b+=2;
      else if(ratio<=.32)b-=5;
      else if(ratio<=.44)b-=3;
    }
    const unread=(data.articles||[]).filter(queueUnread);
    const sCount=unread.filter(a=>grade(score(a))==='S').length;
    if(sCount>=6)b+=2;
    return Math.max(MIN_BUDGET,Math.min(MAX_BUDGET,Math.max(b,sCount)));
  }
  function ensureHint(){
    let x=document.getElementById('weeklyAttentionHint');
    if(x)return x;
    const head=document.querySelector('#articleList')?.previousElementSibling;
    if(!head)return null;
    x=document.createElement('div');x.id='weeklyAttentionHint';x.className='muted small';x.style.marginTop='6px';
    head.querySelector('div')?.appendChild(x);return x;
  }
  function articleForCard(card){
    const link=card.querySelector('.article-title');if(!link)return null;
    const href=link.getAttribute('href'),title=link.textContent.trim();
    return (data.articles||[]).find(a=>a.url===href||a.title===title)||null;
  }
  function applyBudget(){
    const hint=ensureHint(),gf=document.getElementById('gradeFilter');
    if(readingProgress!=='unread'||!['SAB','SA','ALL'].includes(gf?.value||'')){
      document.querySelectorAll('#articleList .article').forEach(c=>c.style.display='');
      if(hint)hint.textContent='';return;
    }
    const cards=[...document.querySelectorAll('#articleList .article')];
    const budget=attentionBudget();let kept=0;
    for(const card of cards){
      const a=articleForCard(card);
      const eligible=a&&['S','A'].includes(grade(score(a)));
      const isS=eligible&&grade(score(a))==='S';
      const show=eligible&&(isS||kept<budget);
      card.style.display=show?'':'none';if(show)kept++;
    }
    const shown=cards.filter(c=>c.style.display!=='none').length;
    const vc=document.getElementById('visibleCount');if(vc)vc.textContent=`${shown} 篇待处理${cards.length>shown?` / ${cards.length} 候选`:''}`;
    const f=feedbackStats();
    if(hint)hint.textContent=`动态注意力预算：优先显示约 ${budget} 篇 S/A；最近12周反馈会滚动调整内容与数量，S级始终保留，B/C 不进入优先队列。${f.n<4?' 当前反馈样本较少，先使用中性预算。':''}`;
  }
  renderArticles=function(){baseRender();applyBudget();};

  rebuildPrefs();
  if(typeof render==='function')render();else renderArticles();
})();
