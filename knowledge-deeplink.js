(() => {
  const targetId=new URLSearchParams(location.search).get('id');
  if(!targetId)return;
  let tries=0;
  function openTarget(){
    tries++;
    const rows=(typeof K!=='undefined'&&(K.items||K.recent_stock))||[];
    const a=rows.find(x=>x.id===targetId);
    if(!a){if(tries<180)setTimeout(openTarget,100);return;}
    activeKnowledgeCategory=a.category||'未分类';activeTopic='all';knowledgeLimit=Math.max(rows.length,30);
    renderCategoryTags();renderTopics();renderList();
    setTimeout(()=>{
      const card=[...document.querySelectorAll('.knowledge-article')].find(x=>x.textContent.includes(a.title||''));
      const d=card?.querySelector('details');if(d)d.open=true;
      card?.scrollIntoView({behavior:'smooth',block:'center'});
    },120);
  }
  openTarget();
})();
