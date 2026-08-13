(() => {
  let knowledge=null, systemModel=null;
  const RULES={
    goals:[['增长/市场扩大',/成長|売上|市場拡大|シェア|新規獲得|GTM|グロース/i],['转化改善',/CVR|コンバージョン|購入率|成約|離脱|カゴ落ち/i],['认知/想起',/認知|想起|第一想起|CEP|ブランド検索/i],['消费者理解',/消費者理解|顧客理解|インサイト|ニーズ|N.?=.?1|生活者/i],['价格/收益',/価格|値上げ|プライシング|利益|粗利|収益/i],['复购/LTV',/LTV|リピート|継続|ロイヤル|CRM|会員/i],['业务效率化',/効率|自動化|省力|業務改善|生産性|ワークフロー/i],['调查/验证',/調査|検証|実証|アンケート|実験|効果測定/i]],
    journey:[['发现/搜索',/検索|SEO|AEO|AIO|GEO|発見|流入|検索行動/i],['比较/评估',/比較|検討|評価|レビュー|口コミ|選択/i],['购买/决策',/購買|購入|決定|意思決定|決済|ファネル/i],['使用/体验',/利用|使用|体験|UX|CX|オンボーディング/i],['复购/关系',/再購入|リピート|継続|CRM|LTV|ロイヤル/i]],
    methods:[['生成AI/Agent',/生成AI|ChatGPT|LLM|AIエージェント|Agentic/i],['广告/媒体',/広告|メディア|リーチ|フリークエンシー|CPA|CTR/i],['SNS/UGC',/SNS|UGC|TikTok|Instagram|インフルエンサー/i],['EC/平台',/Amazon|楽天|EC|eコマース|D2C|モール|TikTok Shop/i],['数据/KPI',/KPI|KGI|データ|計測|分析|指標/i],['品牌战略',/ブランド|ポジショニング|差別化|CEP/i],['CRM',/CRM|LTV|会員|メール|メルマガ/i],['商品开发',/商品開発|新商品|新製品|新品|パッケージ|ニーズ/i],['职业/管理',/転職|キャリア|面接|年収|マネジメント|チーム|上司|メンバー/i]],
    evidence:[['一次数据',/独自調査|自社調査|アンケート|実証|実験|統計|一次データ/i],['案例',/事例|ケーススタディ|導入事例|成功事例/i],['方法论',/フレームワーク|手法|プロセス|方法論|モデル/i]]
  };
  const STOP=new Set(['について','による','ため','とは','から','まで','する','した','して','いる','ある','ない','これ','それ','最新','公開','解説','ポイント','方法','実践','記事','マーケティング','business','japan']);
  function kText(k){return `${k.title||''} ${k.summary||''} ${k.page_body||''} ${(k.comments||[]).map(c=>c.text||'').join(' ')}`;}
  function aText(a){return `${a.title||''} ${a.summary||''} ${a.reason||''} ${a.content_excerpt||''} ${(a.concepts||[]).join(' ')}`;}
  function rText(r){return `${r.domain||''} ${r.title||''} ${r.decision_rule||''} ${r.when||''} ${(r.questions||[]).join(' ')} ${(r.steps||[]).join(' ')} ${(r.metrics||[]).join(' ')} ${(r.traps||[]).join(' ')} ${(r.tensions||[]).join(' ')} ${(r.keywords||[]).join(' ')}`;}
  function profile(text){const out={};for(const [dim,rules] of Object.entries(RULES))out[dim]=rules.filter(([,re])=>re.test(text||'')).map(([n])=>n);return out;}
  function words(text){const raw=(text||'').toLowerCase().match(/[a-z0-9][a-z0-9+._-]{2,}|[一-龯ぁ-んァ-ヶー]{2,10}/g)||[];return [...new Set(raw.filter(x=>!STOP.has(x)))].slice(0,140);}
  function overlap(a,b){const bs=new Set(b);return a.filter(x=>bs.has(x));}
  function relationText(article,targetText){
    const ap=profile(aText(article)),tp=profile(targetText);const shared={goals:overlap(ap.goals,tp.goals),journey:overlap(ap.journey,tp.journey),methods:overlap(ap.methods,tp.methods),evidence:overlap(ap.evidence,tp.evidence)};
    let score=shared.goals.length*3.2+shared.journey.length*2.5+shared.methods.length*1.9+shared.evidence.length*.7;
    const at=words(`${article.title||''} ${article.summary||''} ${(article.concepts||[]).join(' ')}`),tw=new Set(words(targetText));let lexical=0;
    at.forEach(w=>{if(tw.has(w))lexical+=w.length>=5?.32:.17;});score+=Math.min(lexical,1.8);
    const reasons=[];if(shared.goals.length)reasons.push(`共同问题：${shared.goals.slice(0,2).join(' / ')}`);if(shared.journey.length)reasons.push(`同一决策阶段：${shared.journey.slice(0,2).join(' / ')}`);if(shared.methods.length)reasons.push(`共同方法：${shared.methods.slice(0,2).join(' / ')}`);if(!reasons.length&&score>1.8)reasons.push('内容语境接近');
    return {score,reasons,shared};
  }
  function relatedKnowledge(article){
    const list=knowledge?.items||knowledge?.recent_stock||[];
    return list.map(k=>({k,...relationText(article,kText(k))})).filter(x=>x.score>=3.0&&(x.shared.goals.length||x.shared.journey.length||x.shared.methods.length>=2)).filter(x=>!(article.url&&x.k.url&&article.url===x.k.url)).sort((a,b)=>b.score-a.score).slice(0,3);
  }
  function relatedRules(article){
    const list=systemModel?.rules||[];
    return list.map(r=>({r,...relationText(article,rText(r))})).filter(x=>x.score>=3.0&&(x.shared.goals.length||x.shared.journey.length||x.shared.methods.length)).sort((a,b)=>b.score-a.score).slice(0,3);
  }
  function impact(article){
    const t=`${article.reason||''} ${article.increment_type||''}`;
    if(/mostly_duplicate|重复度较高|重複度|重复已有/i.test(t))return {label:'重复较高',cls:'duplicate',desc:'主题相关，但优先确认是否真的提供了新证据、方法或边界。'};
    if(/boundary_or_counterexample|修正现有规则|补充边界|反例|边界/i.test(t))return {label:'补边界 / 反例',cls:'boundary',desc:'可能修正你已有的判断，优先看成立条件和反例。'};
    if(/knowledge_gap|知识空白|知識空白|待验证/i.test(t))return {label:'补知识空白',cls:'gap',desc:'命中目前相对薄弱或待验证的区域。'};
    if(/rule_evidence|增加数据|案例证据|补证据|証拠/i.test(t))return {label:'补证据',cls:'evidence',desc:'与已有判断接近，但提供了额外的数据、案例或验证。'};
    if(/direct_work_use|直接用于工作|直接可用|工作场景/i.test(t))return {label:'直接可用',cls:'direct',desc:'和你当前可调用的工作问题有较直接关系。'};
    return {label:'体系相关',cls:'related',desc:'与现有 Knowledge / Work System 有关联，具体关系如下。'};
  }
  function clearRelations(){document.querySelectorAll('.related-knowledge').forEach(x=>x.remove());}
  function inject(){
    if(!knowledge||knowledge.locked||typeof data==='undefined'||!Array.isArray(data.articles))return;
    document.querySelectorAll('#articleList .article').forEach(card=>{
      if(card.querySelector('.related-knowledge'))return;
      const link=card.querySelector('.article-title');if(!link)return;
      const href=link.getAttribute('href'),title=link.textContent.trim(),article=(data.articles||[]).find(a=>a.url===href||a.title===title);if(!article)return;
      const ks=relatedKnowledge(article),rs=relatedRules(article),im=impact(article);
      const box=document.createElement('div');box.className='related-knowledge';
      const ruleHtml=rs.length?`<div class="related-group"><div class="related-group-label">Work System</div>${rs.map(({r,reasons})=>`<a href="work-system.html" data-work-query="${esc(r.title||'')}"><span>${esc(r.title||'未命名规则')}</span><small>${esc(reasons[0]||r.domain||'工作体系规则')} · ${esc(r.maturity||'')}</small></a>`).join('')}</div>`:`<div class="related-empty">没有找到强匹配的 Work System 规则。</div>`;
      const knowledgeHtml=ks.length?`<div class="related-group"><div class="related-group-label">Knowledge</div>${ks.map(({k,reasons})=>`<a href="knowledge.html#knowledgeResultsAnchor" data-related-id="${esc(k.id||'')}"><span>${esc(k.title)}</span><small>${esc(reasons[0]||'内容相关')} · ${esc(k.category||'未分类')}</small></a>`).join('')}</div>`:`<div class="related-empty">没有找到强匹配的旧 Knowledge；这可能是真正的新主题，也可能是现有分类覆盖不足。</div>`;
      box.innerHTML=`<div class="related-head"><div><span>🧠 与你的知识体系比较</span><small>${esc(im.desc)}</small></div><span class="knowledge-impact ${esc(im.cls)}">${esc(im.label)}</span></div>${ruleHtml}${knowledgeHtml}`;
      const controls=card.querySelector('.controls');if(controls)card.insertBefore(box,controls);else card.appendChild(box);
    });
    document.querySelectorAll('[data-related-id]').forEach(a=>a.addEventListener('click',()=>sessionStorage.setItem('weekly_intelligence_open_knowledge_id',a.dataset.relatedId)));
    document.querySelectorAll('[data-work-query]').forEach(a=>a.addEventListener('click',()=>sessionStorage.setItem('weekly_intelligence_work_query',a.dataset.workQuery)));
  }
  function showUnlock(show){document.getElementById('knowledgeRelationUnlockCard')?.classList.toggle('hidden',!show);}
  async function load(promptUser=false){
    if(typeof loadKnowledgeData!=='function')return;
    const k=await loadKnowledgeData({prompt:promptUser});
    if(k.locked){knowledge=null;systemModel=null;showUnlock(!!k.meta?.encrypted_full_data);return;}
    knowledge=k;showUnlock(false);
    try{if(typeof loadSystemModelData==='function'){const s=await loadSystemModelData({prompt:false});systemModel=s?.locked?null:s;}}catch(e){systemModel=null;}
    clearRelations();inject();
  }
  const oldRender=renderArticles;renderArticles=function(){oldRender();setTimeout(inject,0);};
  document.getElementById('unlockWeeklyKnowledge')?.addEventListener('click',()=>load(true));
  load(false);
})();
