// Put the reading decision first; preserve the existing selection, status and
// feedback handlers as the single source of truth.
(() => {
  const PRIMARY=new Set(['focus','week','later']);
  const $=id=>document.getElementById(id);
  document.body.classList.add('weekly-compact-ui');
  let articlesById=new Map(),articlesLength=-1,scheduled=false;

  function allRows(){return window.weeklyUiFixesV25?.allRows?.()||(data?.articles||[]);}
  function article(id){
    const rows=allRows();
    if(rows.length!==articlesLength){
      articlesById=new Map(rows.map(a=>[String(a.id),a]));articlesLength=rows.length;
    }
    return articlesById.get(String(id));
  }
  function mode(){return typeof readingProgress==='undefined'?'focus':readingProgress;}
  function minutes(a){return Number(window.weeklyReadingTimeV21?.estimateMinutes?.(a)||0);}
  function focus(){try{return window.weeklyReadingTimeV21?.currentFocus?.().selected||[];}catch(_){return [];}}

  function notice(){
    const box=$('weeklyReviewNotice'),audit=data?.meta?.priority_review_audit;
    if(!box)return;
    if(!allRows().length){box.hidden=true;return;}
    if(audit?.status==='complete'){box.hidden=true;return;}
    box.hidden=false;
    if(!audit){box.textContent='本次复核状态未知；优先阅读还不能视为完整的漏选检查。';return;}
    const total=Math.max(0,Number(audit.total||0)),done=Math.max(0,Number(audit.reviewed||0));
    box.textContent=audit.model_configured
      ?`内容复核尚未完成：${done}/${total} 篇已有明确结论，${audit.unresolved} 篇仍需核验；优先清单可能有漏选。`
      :`内容复核未运行：${done}/${total} 篇已有明确结论。当前优先清单依据正文规则，尚不能保证没有漏选。`;
  }
  function summary(){
    const active=mode(),rows=focus(),mins=rows.reduce((n,a)=>n+minutes(a),0);
    const title=$('weeklyQuickTitle'),subtitle=$('weeklyQuickSubtitle');
    if(!title||!subtitle)return;
    if(active==='focus'){
      const filteredOut=!rows.length&&Number(window.weeklyReadingTimeV21?.allFocusRows?.().length||0)>0;
      title.textContent=`优先阅读 ${rows.length} 篇 · 约 ${mins} 分钟`;
      subtitle.textContent=rows.length?'从第一篇开始读；这里只放有具体阅读依据的文章。':
        filteredOut?'当前高级筛选没有匹配文章，展开筛选可以调整。':
        data?.meta?.priority_review_audit?.status==='complete'?'当前没有达到优先阅读标准的文章，不为了凑数推荐。':
        '现有正文规则尚未选出文章；复核未完成，不能据此判断没有值得读的文章。';
      const empty=$('emptyState');
      if(empty&&!rows.length&&!filteredOut&&data?.meta?.priority_review_audit?.status!=='complete'){
        const p=empty.querySelector('p');
        if(p)p.textContent='当前正文规则尚未选出文章，内容复核仍未完成；不能排除其他等级有值得读的内容。';
      }
    }else{
      const label={week:'本周文章',later:'稍后看',unread:'待处理 S/A',archive:'未处理归档',marked:'已标记',read:'已读',skip:'已跳过',all:'全部文章'}[active]||'文章列表';
      title.textContent=label;
      subtitle.textContent='切回“优先阅读”，直接按推荐顺序阅读。';
    }
    notice();
  }
  function views(){
    const seg=document.querySelector('.segmented');if(!seg)return;
    let more=$('weeklyMoreViews');
    if(!more){
      more=document.createElement('button');more.id='weeklyMoreViews';more.type='button';more.className='segment-btn weekly-more-views';
      more.addEventListener('click',()=>{
        const open=!document.body.classList.contains('weekly-views-expanded');
        if(!open&&!PRIMARY.has(mode()))setProgress?.('focus');
        document.body.classList.toggle('weekly-views-expanded',open);
        more.setAttribute('aria-expanded',String(open));more.textContent=open?'收起管理':'更多视图';
      });
      seg.appendChild(more);
    }
    const active=mode();
    if(!PRIMARY.has(active))document.body.classList.add('weekly-views-expanded');
    const open=document.body.classList.contains('weekly-views-expanded');
    more.setAttribute('aria-expanded',String(open));more.textContent=open?'收起管理':'更多视图';
    document.body.classList.toggle('weekly-priority-mode',active==='focus');
    const bar=$('weeklyStickyStatus');
    if(bar&&!$('weeklyStickyMore')){
      const b=document.createElement('button');b.type='button';b.id='weeklyStickyMore';b.textContent='更多';
      b.addEventListener('click',()=>{document.body.classList.add('weekly-views-expanded');views();document.querySelector('.reading-progress')?.scrollIntoView({behavior:'smooth',block:'start'});});
      bar.querySelector('.sticky-status-buttons')?.appendChild(b);
    }
  }

  function cards(){
    if(mode()!=='focus')return;
    document.querySelectorAll('#articleList .article[data-bulk-article-id]').forEach(card=>{
      if(card.querySelector('.weekly-card-brief'))return;
      const a=article(card.dataset.bulkArticleId),editorial=a&&window.weeklyPriorityPolicy?.assess(a);
      const title=card.querySelector('.article-title'),controls=card.querySelector('.controls');
      if(!a||!editorial?.eligible||!title||!controls)return;
      const brief=document.createElement('div');brief.className='weekly-card-brief';
      const gain=document.createElement('p'),use=document.createElement('p');
      gain.className='weekly-card-gain';use.className='weekly-card-use';
      const evidence=editorial.evidence?.[0]||'';
      gain.textContent=editorial.reviewed?`新信息：${editorial.reason}`:`原文看点：${evidence||editorial.reason}`;
      use.textContent=`可用在：${editorial.use}`;
      brief.append(gain,use);
      const time=document.createElement('span');time.className='weekly-card-time';
      const info=window.weeklyReadingTimeV21?.readingTimeInfo?.(a);
      time.textContent=info?`${info.exact?'':'约 '}${info.minutes} 分钟`:'时间待估算';
      time.title=info?.exact?'站点官方阅读时间':`阅读时间估算：${info?.label||'正文资料不足'}`;
      const meta=card.querySelector('.article-top .meta');meta?.appendChild(time);
      title.insertAdjacentElement('afterend',brief);

      const buttons=Array.from(controls.querySelectorAll(':scope > button.btn'));
      if(buttons.length<4)return;
      const quick=document.createElement('div');quick.className='weekly-quick-controls';
      const link=document.createElement('a');link.className='btn weekly-open-original';link.textContent='打开原文 ↗';
      link.href=title.href;link.target='_blank';link.rel='noopener noreferrer';quick.appendChild(link);
      for(const [i,label] of [[0,'稍后看'],[3,'跳过']]){
        const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=label;
        b.classList.toggle('active',buttons[i].classList.contains('active'));
        b.addEventListener('click',()=>buttons[i].click());quick.appendChild(b);
      }
      const more=document.createElement('details');more.className='weekly-card-more';
      const label=document.createElement('summary');label.textContent='更多操作与详细评分';more.appendChild(label);
      controls.insertAdjacentElement('beforebegin',quick);
      controls.replaceWith(more);
      for(const name of ['.scores','.why','.tags','.source-note']){
        const extra=card.querySelector(name);if(extra)more.appendChild(extra);
      }
      more.appendChild(controls);
    });
  }
  function sync(){views();summary();cards();}
  function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;sync();},0);}

  $('weeklyBulkToggle')?.addEventListener('click',e=>{
    const open=document.body.classList.toggle('weekly-bulk-open');e.currentTarget.setAttribute('aria-expanded',String(open));
    if(open)$('weeklyBulkStatusBar')?.scrollIntoView({behavior:'smooth',block:'center'});
  });
  $('weeklyDiagnosticsToggle')?.addEventListener('click',e=>{
    const open=document.body.classList.toggle('weekly-diagnostics-open');e.currentTarget.setAttribute('aria-expanded',String(open));
    if(open)document.querySelector('.side')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  });
  if(typeof renderArticles==='function'){
    const previous=renderArticles;
    renderArticles=function(){const out=previous();sync();return out;};
  }
  if(typeof setProgress==='function'){
    const previous=setProgress;
    window.setProgress=setProgress=function(key){const out=previous(key);sync();return out;};
  }
  for(const id of ['gradeFilter','statusFilter','sourceFilter'])$(id)?.addEventListener('change',schedule);
  sync();
  window.weeklyReadingUiV39={sync};
})();
