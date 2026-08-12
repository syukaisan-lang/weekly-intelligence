let activeKnowledgeCategory='all';

function renderKnowledgeCategoryTags(){
  const box=document.getElementById('knowledgeCategoryTags');
  if(!box||!K.categories) return;
  const rows=[...(K.categories||[])].filter(x=>x.stock>0).sort((a,b)=>b.stock-a.stock);
  const allStock=(K.metrics&&K.metrics.stock)||rows.reduce((s,x)=>s+x.stock,0);
  const buttons=[{name:'all',label:'全部',stock:allStock},...rows.map(x=>({name:x.name,label:x.name,stock:x.stock}))];
  box.innerHTML=buttons.map(x=>`<button type="button" class="category-filter-btn ${x.name===activeKnowledgeCategory?'active':''}" data-knowledge-category="${esc(x.name)}"><span>${esc(x.label)}</span><b>${x.stock}</b></button>`).join('');
  box.querySelectorAll('[data-knowledge-category]').forEach(btn=>btn.addEventListener('click',()=>{
    activeKnowledgeCategory=btn.dataset.knowledgeCategory;
    const sel=document.getElementById('knowledgeCategory');
    if(sel){
      const exists=[...sel.options].some(o=>o.value===activeKnowledgeCategory);
      sel.value=exists?activeKnowledgeCategory:'all';
    }
    renderKnowledgeCategoryTags();
    renderRecent();
    document.getElementById('knowledgeList')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
}

const _populateKnowledgeCategory=populateCategory;
populateCategory=function(){
  _populateKnowledgeCategory();
  const sel=document.getElementById('knowledgeCategory');
  if(sel){
    sel.value=activeKnowledgeCategory;
    sel.addEventListener('change',()=>{
      activeKnowledgeCategory=sel.value;
      renderKnowledgeCategoryTags();
      renderRecent();
    });
  }
  renderKnowledgeCategoryTags();
};

renderRecent=function(){
  const q=document.getElementById('knowledgeSearch').value.trim().toLowerCase();
  const rows=(K.recent_stock||[]).filter(a=>
    (activeKnowledgeCategory==='all'||a.category===activeKnowledgeCategory) &&
    (!q||`${a.title} ${a.category} ${topicFor(a.title).join(' ')}`.toLowerCase().includes(q))
  );
  document.getElementById('knowledgeCount').textContent=`${rows.length} 篇`;
  const heading=document.getElementById('knowledgeActiveCategory');
  if(heading) heading.textContent=activeKnowledgeCategory==='all'?'全部分类':activeKnowledgeCategory;
  document.getElementById('knowledgeList').innerHTML=rows.map(a=>{
    const topics=topicFor(a.title).slice(0,4);
    return `<article class="article knowledge-article">
      <div class="article-top">
        <div class="meta"><span class="pill">${esc(a.category)}</span><span class="muted small">${esc(a.date)}</span></div>
        <span class="muted small">Notion Stock</span>
      </div>
      <a class="article-title" target="_blank" rel="noopener noreferrer" href="${esc(a.url)}">${esc(a.title)}</a>
      <div class="tags">${topics.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
    </article>`;
  }).join('') || '<div class="empty"><h3>当前分类在原型快照中没有条目</h3><p>这个标签的数字是整个 Notion Stock 数；当前页面内容区仍是最近15篇快照。后续可扩展到全部145篇。</p></div>';
};

const waitForKnowledge=()=>{
  if(K&&K.categories&&K.categories.length){
    renderKnowledgeCategoryTags();
  }else{
    setTimeout(waitForKnowledge,120);
  }
};
waitForKnowledge();
