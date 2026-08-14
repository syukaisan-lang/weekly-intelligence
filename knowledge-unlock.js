(() => {
  function showSnapshotWarning(){
    if(K?.meta?.encrypted_full_data)return;
    const expected=Number(K?.metrics?.stock||0),loaded=(K?.items||K?.recent_stock||[]).length;
    if(expected>loaded){const list=document.getElementById('knowledgeList');if(list&&!document.getElementById('knowledgeSnapshotWarning')){const box=document.createElement('div');box.id='knowledgeSnapshotWarning';box.className='callout warning';box.innerHTML=`当前还是旧快照：页面可浏览 ${loaded}/${expected} 篇 Stock。完成一次 <b>Sync Notion knowledge</b> 后会切换成全量加密知识库。`;list.parentNode.insertBefore(box,list)}}
  }
  function openPendingKnowledge(){
    const id=sessionStorage.getItem('weekly_intelligence_open_knowledge_id');if(!id)return;const a=(K.items||[]).find(x=>x.id===id);if(!a)return;sessionStorage.removeItem('weekly_intelligence_open_knowledge_id');activeKnowledgeCategory=a.category||'未分类';activeTopic='all';knowledgeLimit=Math.max(30,(K.items||[]).filter(x=>(x.category||'未分类')===activeKnowledgeCategory).length);renderCategoryTags();renderCategories();renderTopics();renderList();setTimeout(()=>{const cards=[...document.querySelectorAll('.knowledge-article')],card=cards.find(x=>x.textContent.includes(a.title));if(card){const d=card.querySelector('details');if(d)d.open=true;card.scrollIntoView({behavior:'smooth',block:'center'});card.classList.add('focus-flash');setTimeout(()=>card.classList.remove('focus-flash'),1200)}},150)
  }
  async function refreshPrivateKnowledge(){
    const full=await loadKnowledgeData({prompt:true});
    if(full.locked){const list=document.getElementById('knowledgeList');if(list)list.innerHTML='<div class="empty"><h3>🔐 Knowledge 还未解锁</h3><p>输入 Dashboard 密码后，浏览器才会解密全量 Stock、正文和 Comment。密码只保存在当前浏览器 session。</p><button id="unlockKnowledgeNow" class="btn" type="button">解锁 Knowledge</button></div>';document.getElementById('unlockKnowledgeNow')?.addEventListener('click',refreshPrivateKnowledge);return}
    K=full;document.getElementById('knowledgeSnapshotWarning')?.remove();const snap=K.meta?.snapshot_at;document.getElementById('knowledgeUpdated').textContent=snap?`Notion同步 ${new Date(snap).toLocaleString('ja-JP')}`:'Notion已解锁';renderMetrics();renderCategoryTags();renderCategories();renderTopics();renderList();renderResurface();renderInsights();openPendingKnowledge();window.dispatchEvent(new CustomEvent('knowledge-private-ready',{detail:{snapshot_at:snap||null}}));
  }
  const wait=()=>{if(typeof K!=='undefined'&&K.meta){if(K.meta.encrypted_full_data)refreshPrivateKnowledge();else showSnapshotWarning()}else setTimeout(wait,80)};wait();
})();
