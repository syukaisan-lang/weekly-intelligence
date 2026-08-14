(() => {
  let know=null,system=null,index=null,packed=null;
  const decode=s=>{const b=atob(s||''),v=new Int8Array(b.length);for(let i=0;i<b.length;i++){const n=b.charCodeAt(i);v[i]=n>127?n-256:n;}return v;};
  function articleVec(a){
    const e=a?.semantic_vector;if(!e?.q||!Number(e.dim)||!Number(e.scale))return null;
    const q=decode(e.q),v=new Float32Array(q.length);let n=0;
    for(let i=0;i<q.length;i++){v[i]=q[i]*Number(e.scale);n+=v[i]*v[i];}
    n=Math.sqrt(n)||1;for(let i=0;i<v.length;i++)v[i]/=n;return v;
  }
  function top(a,kind,limit=3){
    const av=articleVec(a),dim=Number(index?.meta?.dimension||0),entries=index?.entries||[],scales=index?.scales||[];
    if(!av||!dim||av.length!==dim||!index?.vectors_b64)return [];
    if(!packed)packed=decode(index.vectors_b64);
    const best=new Map();
    for(let j=0;j<entries.length;j++){
      const e=entries[j];if(e.kind!==kind)continue;
      let dot=0,norm=0,scale=Number(scales[j]||0),start=j*dim;
      for(let i=0;i<dim;i++){const x=packed[start+i]*scale;dot+=av[i]*x;norm+=x*x;}
      const sim=norm?dot/Math.sqrt(norm):0,id=String(e.id||'');
      if(!best.has(id)||sim>best.get(id))best.set(id,sim);
    }
    return [...best].map(([id,score])=>({id,score})).filter(x=>x.score>=.77).sort((x,y)=>y.score-x.score).slice(0,limit);
  }
  function impact(a){
    const t=`${a.knowledge_context?.increment_type||''} ${a.reason||''}`;
    if(/mostly_duplicate|重复|重複/i.test(t))return ['重复较高','duplicate','与既有 Knowledge 语义很接近，重点确认有没有新证据或边界。'];
    if(/boundary_or_counterexample|反例|边界/i.test(t))return ['补边界 / 反例','boundary','可能修正已有判断，优先看成立条件和反例。'];
    if(/knowledge_gap|知识空白|待验证/i.test(t))return ['补知识空白','gap','与现有规则相关，但 Knowledge 覆盖相对薄弱。'];
    if(/rule_evidence|证据|案例/i.test(t))return ['补证据','evidence','可能为已有判断增加数据、案例或验证。'];
    if(/direct_work_use|直接可用|工作场景/i.test(t))return ['直接可用','direct','与实际工作问题语义接近。'];
    return ['体系相关','related','与现有 Knowledge / Work System 有语义关联。'];
  }
  function render(){
    if(!know||!system||!index||!Array.isArray(window.data?.articles||data?.articles))return;
    const articles=window.data?.articles||data.articles,kmap=new Map((know.items||know.recent_stock||[]).map(x=>[String(x.id||''),x])),rmap=new Map((system.rules||[]).map(x=>[String(x.id||''),x]));
    document.querySelectorAll('#articleList .article').forEach(card=>{
      const link=card.querySelector('.article-title');if(!link)return;
      const a=articles.find(x=>x.url===link.getAttribute('href')||x.title===link.textContent.trim());if(!a?.semantic_vector)return;
      const ks=top(a,'notion',5).map(m=>({item:kmap.get(m.id),score:m.score})).filter(x=>x.item).slice(0,3),rs=top(a,'rule',5).map(m=>({item:rmap.get(m.id),score:m.score})).filter(x=>x.item).slice(0,3);
      if(!ks.length&&!rs.length)return;
      card.querySelector('.related-knowledge')?.remove();
      const [label,cls,desc]=impact(a),box=document.createElement('div');box.className='related-knowledge semantic-v6-relations';
      const rh=rs.length?`<div class="related-group"><div class="related-group-label">Work System · Semantic v6</div>${rs.map(x=>`<a href="work-system.html" data-work-query="${esc(x.item.title||'')}"><span>${esc(x.item.title||'未命名规则')}</span><small>语义匹配 ${x.score.toFixed(2)} · ${esc(x.item.maturity||'')}</small></a>`).join('')}</div>`:'<div class="related-empty">没有强语义匹配的 Work System 规则。</div>';
      const kh=ks.length?`<div class="related-group"><div class="related-group-label">Knowledge · Semantic v6</div>${ks.map(x=>`<a href="knowledge.html#knowledgeResultsAnchor" data-related-id="${esc(x.item.id||'')}"><span>${esc(x.item.title||'Knowledge')}</span><small>语义匹配 ${x.score.toFixed(2)} · ${esc(x.item.category||'未分类')}</small></a>`).join('')}</div>`:'<div class="related-empty">没有强语义匹配的旧 Knowledge。</div>';
      box.innerHTML=`<div class="related-head"><div><span>🧠 与你的知识体系比较</span><small>${esc(desc)}</small></div><span class="knowledge-impact ${esc(cls)}">${esc(label)}</span></div>${rh}${kh}`;
      const controls=card.querySelector('.controls');controls?card.insertBefore(box,controls):card.appendChild(box);
    });
    document.querySelectorAll('.semantic-v6-relations [data-related-id]').forEach(x=>x.onclick=()=>sessionStorage.setItem('weekly_intelligence_open_knowledge_id',x.dataset.relatedId));
    document.querySelectorAll('.semantic-v6-relations [data-work-query]').forEach(x=>x.onclick=()=>sessionStorage.setItem('weekly_intelligence_work_query',x.dataset.workQuery));
  }
  async function load(){
    if(typeof loadEncryptedData!=='function'||typeof loadKnowledgeData!=='function'||typeof loadSystemModelData!=='function')return false;
    try{
      const [k,s,i]=await Promise.all([loadKnowledgeData({prompt:false}),loadSystemModelData({prompt:false}),loadEncryptedData('data/semantic-index.json','data/semantic-index.enc.json',{prompt:false})]);
      if(k?.locked||s?.locked||i?.locked)return false;know=k;system=s;index=i;packed=null;render();return true;
    }catch(_){return false;}
  }
  const base=renderArticles;renderArticles=function(){base();setTimeout(()=>{index?render():load();},30);};
  document.getElementById('unlockWeeklyKnowledge')?.addEventListener('click',()=>setTimeout(load,500));
  load();
})();
