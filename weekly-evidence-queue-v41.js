// Keep missing evidence visible without promoting it to Priority.
(() => {
  const rows=()=>window.weeklyUiFixesV25?.allRows?.()||(data?.articles||[]);
  function candidates(){
    return rows().filter(a=>window.weeklyWeekView?.isThisWeek?.(a)&&
      window.weeklyPriorityPolicy?.assess?.(a)?.decision==='待核验'&&
      !['read','save','skip','later'].includes(st(a.id)?.status||'new'));
  }
  if(typeof visible==='function'){
    const previous=visible;
    visible=function(a){
      if(typeof readingProgress==='undefined'||readingProgress!=='verify')return previous(a);
      return window.weeklyWeekView?.isThisWeek?.(a)&&window.weeklyPriorityPolicy?.assess?.(a)?.decision==='待核验'&&
        !['read','save','skip','later'].includes(st(a.id)?.status||'new');
    };
  }
  function sync(){
    const seg=document.querySelector('.segmented');if(!seg)return;
    let button=document.querySelector('[data-progress="verify"]');
    if(!button){
      button=document.createElement('button');button.type='button';button.className='segment-btn';button.dataset.progress='verify';
      button.innerHTML='待核验 <span class="segment-count">0</span>';
      button.addEventListener('click',()=>setProgress('verify'));seg.appendChild(button);
    }
    button.querySelector('.segment-count').textContent=String(candidates().length);
    button.classList.toggle('active',readingProgress==='verify');
    if(readingProgress==='verify'){
      const title=document.getElementById('weeklyQuickTitle'),sub=document.getElementById('weeklyQuickSubtitle');
      if(title)title.textContent='待核验候选';
      if(sub)sub.textContent='这些文章的依据还不足，供你快速补漏；未读到正文不代表价值低。';
    }
    document.querySelectorAll('#articleList .article[data-bulk-article-id]').forEach(card=>{
      const a=window.weeklyPerformanceV28?.findArticle?.({id:card.dataset.bulkArticleId});if(!a||a.content_completeness==='full')return;
      const target=card.querySelector('.scores');if(!target||target.querySelector('.evidence-queue-status'))return;
      const mark=document.createElement('span');mark.className='score evidence-queue-status';
      const status=a.free_public_retry_status;
      mark.textContent=status==='paywall'?'会员/付费限制：仅公开内容':status==='access_restricted'?'公开页面访问受限':status==='robots_or_unavailable'?'抓取规则限制或规则不可用':
        status==='unavailable'?'正文补抓失败，等待重试':a.content_completeness==='partial'?'正文仅部分，待补齐':'正文待补抓';
      target.appendChild(mark);
    });
  }
  if(typeof renderArticles==='function'){
    const previous=renderArticles;renderArticles=function(){const out=previous();sync();return out;};
  }
  if(typeof updateProgressTabs==='function'){
    const previous=updateProgressTabs;updateProgressTabs=function(){const out=previous();sync();return out;};
  }
  sync();window.weeklyEvidenceQueueV41={candidates,sync};
})();
