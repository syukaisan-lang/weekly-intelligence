// Weekly v24: select current filtered articles and set reading status in bulk.
(() => {
  const TRUSTED_STATUS_ORIGIN='human_v10';
  const DIRTY_SINCE_KEY='weekly_intelligence_dirty_since_v1';
  const selected=new Set();
  const STATUS_LABELS={new:'未处理',later:'稍后看',read:'已读',save:'保存状态',skip:'跳过'};

  function toast(text){
    let box=document.getElementById('weeklyStateToast');
    if(!box){box=document.createElement('div');box.id='weeklyStateToast';box.className='save-toast';document.body.appendChild(box);}
    box.textContent=text;box.classList.add('show');clearTimeout(box._timer);box._timer=setTimeout(()=>box.classList.remove('show'),4200);
  }

  function allRows(){return Array.isArray(data?.articles)?data.articles:[];}
  function currentRows(){
    return allRows().filter(a=>{try{return typeof visible==='function'?visible(a):true;}catch(_){return true;}});
  }
  function currentIds(){return currentRows().map(a=>String(a.id));}
  function articleFromCard(card){
    const id=card?.dataset?.bulkArticleId;if(id)return allRows().find(a=>String(a.id)===id)||null;
    const link=card?.querySelector('.article-title');if(!link)return null;
    const href=link.getAttribute('href'),title=link.textContent.trim();
    return allRows().find(a=>a.url===href||a.title===title)||null;
  }

  function ensureStyle(){
    if(document.getElementById('weeklyBulkStatusStyle'))return;
    const style=document.createElement('style');style.id='weeklyBulkStatusStyle';style.textContent=`
      .bulk-status-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px;padding:10px 12px;border:1px solid var(--border,#d9dde5);border-radius:12px;background:var(--card,#fff)}
      .bulk-select-all{display:inline-flex;align-items:center;gap:7px;font-weight:650;cursor:pointer}.bulk-select-all input,.bulk-card-check input{width:17px;height:17px;accent-color:currentColor}
      .bulk-status-bar select{min-height:34px;border:1px solid var(--border,#d9dde5);border-radius:8px;padding:4px 28px 4px 9px;background:inherit;color:inherit}
      .bulk-status-count{min-width:72px}.bulk-status-note{flex-basis:100%}
      .bulk-card-check{display:inline-flex;align-items:center;justify-content:center;margin-right:8px;cursor:pointer;flex:0 0 auto}.article.bulk-selected{outline:2px solid rgba(79,70,229,.28);outline-offset:1px}
      @media(max-width:700px){.bulk-status-bar{gap:8px}.bulk-status-bar .btn{min-height:34px}.bulk-status-note{font-size:11px}.bulk-card-check{margin-right:5px}}
    `;document.head.appendChild(style);
  }

  function ensureBar(){
    let bar=document.getElementById('weeklyBulkStatusBar');if(bar)return bar;
    const list=document.getElementById('articleList');if(!list)return null;
    ensureStyle();
    bar=document.createElement('div');bar.id='weeklyBulkStatusBar';bar.className='bulk-status-bar';
    bar.innerHTML=`
      <label class="bulk-select-all"><input id="bulkSelectCurrent" type="checkbox"><span id="bulkSelectCurrentLabel">全选当前文章</span></label>
      <span id="bulkSelectedCount" class="pill bulk-status-count">已选 0</span>
      <select id="bulkStatusTarget" aria-label="批量设定状态">
        <option value="read">设为：已读</option>
        <option value="later">设为：稍后看</option>
        <option value="skip">设为：跳过</option>
        <option value="new">设为：未处理</option>
        <option value="save">设为：保存状态</option>
      </select>
      <button id="bulkApplyStatus" class="btn" type="button">应用到已选</button>
      <button id="bulkClearSelection" class="btn secondary" type="button">取消选择</button>
      <span class="muted small bulk-status-note">“全选当前文章”包含当前视图和筛选条件命中的全部文章，即使尚未点“加载更多”。“保存状态”只修改阅读状态，不会批量写入 Notion。</span>
    `;
    list.insertAdjacentElement('beforebegin',bar);

    const selectAll=bar.querySelector('#bulkSelectCurrent');
    selectAll.addEventListener('change',()=>{
      const ids=currentIds();
      if(selectAll.checked)ids.forEach(id=>selected.add(id));else ids.forEach(id=>selected.delete(id));
      annotateCards();updateBar();
    });
    bar.querySelector('#bulkClearSelection').addEventListener('click',()=>{selected.clear();annotateCards();updateBar();});
    bar.querySelector('#bulkApplyStatus').addEventListener('click',applyBulkStatus);
    return bar;
  }

  function updateBar(){
    const bar=ensureBar();if(!bar)return;
    const ids=currentIds(),idSet=new Set(ids);
    for(const id of [...selected])if(!idSet.has(id))selected.delete(id);
    const n=ids.filter(id=>selected.has(id)).length;
    const all=bar.querySelector('#bulkSelectCurrent');
    all.checked=ids.length>0&&n===ids.length;all.indeterminate=n>0&&n<ids.length;all.disabled=!ids.length;
    bar.querySelector('#bulkSelectCurrentLabel').textContent=`全选当前文章（${ids.length}）`;
    bar.querySelector('#bulkSelectedCount').textContent=`已选 ${n}`;
    bar.querySelector('#bulkApplyStatus').disabled=n===0;
    bar.querySelector('#bulkClearSelection').disabled=n===0;
  }

  function annotateCards(){
    document.querySelectorAll('#articleList .article').forEach(card=>{
      const a=articleFromCard(card);if(!a)return;
      const id=String(a.id);card.dataset.bulkArticleId=id;
      let label=card.querySelector('.bulk-card-check');
      if(!label){
        label=document.createElement('label');label.className='bulk-card-check';label.title='选择这篇文章';label.innerHTML='<input type="checkbox" aria-label="选择这篇文章">';
        const top=card.querySelector('.article-top');if(top)top.insertAdjacentElement('afterbegin',label);else card.insertAdjacentElement('afterbegin',label);
        label.querySelector('input').addEventListener('change',e=>{
          if(e.currentTarget.checked)selected.add(id);else selected.delete(id);
          card.classList.toggle('bulk-selected',selected.has(id));updateBar();
        });
      }
      const input=label.querySelector('input');input.checked=selected.has(id);card.classList.toggle('bulk-selected',selected.has(id));
    });
  }

  function markDirty(now){
    if(!localStorage.getItem(DIRTY_SINCE_KEY))localStorage.setItem(DIRTY_SINCE_KEY,String(now));
    const cloud=document.getElementById('weeklyCloudStatus');if(cloud)cloud.textContent='本机已自动保存 · 建议每周备份一次';
  }

  function applyBulkStatus(){
    const ids=currentIds().filter(id=>selected.has(id));if(!ids.length)return;
    const bar=ensureBar(),target=bar?.querySelector('#bulkStatusTarget')?.value||'read',label=STATUS_LABELS[target]||target;
    if(ids.length>=25&&!confirm(`把当前选中的 ${ids.length} 篇文章批量设为“${label}”？`))return;
    const now=Date.now();
    for(const id of ids){
      const cur=state?.[id]&&typeof state[id]==='object'?state[id]:{status:'new',feedback:null};
      cur.status=target;cur.status_origin=TRUSTED_STATUS_ORIGIN;cur.status_action='status';cur.status_updated_at=now;cur.updated_at=Math.max(Number(cur.updated_at||0),now);state[id]=cur;
    }
    if(typeof save==='function')save();markDirty(now);selected.clear();
    window.weeklyMobilePerformanceV18?.resetLimit?.();
    window.weeklyReadingTimeV21?.invalidate?.();
    if(typeof rebuildPrefs==='function')rebuildPrefs();
    if(typeof render==='function')render();else if(typeof renderArticles==='function')renderArticles();
    if(typeof updateProgressTabs==='function')updateProgressTabs();
    toast(`已将 ${ids.length} 篇文章设为“${label}”。`);
  }

  function clearOnViewChange(){selected.clear();setTimeout(()=>{annotateCards();updateBar();},0);}
  ['gradeFilter','statusFilter','sourceFilter'].forEach(id=>document.getElementById(id)?.addEventListener('change',clearOnViewChange,{capture:true}));
  document.querySelectorAll('[data-progress]').forEach(btn=>btn.addEventListener('click',clearOnViewChange,{capture:true}));

  if(typeof renderArticles==='function'){
    const previousRender=renderArticles;
    renderArticles=function(){const out=previousRender();annotateCards();updateBar();return out;};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensureBar();annotateCards();updateBar();});
  else {ensureBar();annotateCards();updateBar();}

  window.weeklyBulkStatusV24={currentRows,selected,updateBar};
})();
