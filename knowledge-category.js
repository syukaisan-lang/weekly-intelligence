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
      if(exists) sel.value=activeKnowledgeCategory;
      else sel.value='all';
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
    });
  }
  renderKnowledgeCategoryTags();
};

const _renderKnowledgeRecent=renderRecent;
renderRecent=function(){
  _renderKnowledgeRecent();
  const heading=document.getElementById('knowledgeActiveCategory');
  if(heading) heading.textContent=activeKnowledgeCategory==='all'?'全部分类':activeKnowledgeCategory;
};

const waitForKnowledge=()=>{
  if(K&&K.categories&&K.categories.length){
    renderKnowledgeCategoryTags();
  }else{
    setTimeout(waitForKnowledge,120);
  }
};
waitForKnowledge();
