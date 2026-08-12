(() => {
  let knowledge = null;
  const TERM_RULES = [
    ['Agentic Commerce',/エージェンティック|agentic/i],['AI Search / AEO',/AEO|AIO|GEO|AI検索|AI経由|AI型購買|AIショッピング/i],
    ['生成AI',/生成AI|ChatGPT|LLM|AIエージェント/i],['CEP / 想起',/CEP|想起|第一想起/i],['KPI',/KPI|KGI|効果測定|指標/i],
    ['検索行動',/検索行動|検索数|検索クエリ|SEO|SCM/i],['購買行動',/購買|購入|買う|ファネル|決済/i],
    ['消費者インサイト',/消費者|生活者|インサイト|顧客理解|N.?=.?1/i],['EC',/EC|eコマース|Amazon|楽天|D2C|TikTok Shop/i],
    ['広告効果',/広告|メディア投資|リーチ|フリークエンシー|CTR|CPA/i],['ブランド',/ブランド|認知|シェア|ロイヤル|浸透率/i],
    ['価格',/価格|値上げ|プライシング|値付け/i],['CRM',/CRM|LTV|会員|メルマガ|メール/i],['SNS / UGC',/SNS|UGC|TikTok|Instagram|インフルエンサー|VTuber/i],
    ['競合',/競合|差別化|ポジショニング/i],['調査',/調査|アンケート|モニター|サンプル/i],['商品開発',/商品開発|新商品|新ニーズ/i]
  ];
  const STOP = new Set(['について','による','ため','とは','から','まで','する','した','して','いる','ある','ない','これ','それ','マーケティング','最新','公開','解説','ポイント','方法','実践','記事','日経クロストレンド','MarkeZine']);

  function textOfKnowledge(k){
    return `${k.title||''} ${k.summary||''} ${(k.comments||[]).map(c=>c.text||'').join(' ')}`;
  }
  function concepts(text){return TERM_RULES.filter(([,re])=>re.test(text||'')).map(([n])=>n);}
  function words(text){
    const raw=(text||'').toLowerCase().match(/[a-z0-9][a-z0-9+._-]{1,}|[一-龯ぁ-んァ-ヶー]{2,12}/g)||[];
    return [...new Set(raw.filter(x=>!STOP.has(x)&&x.length>1))].slice(0,80);
  }
  function relationScore(article,k){
    const atext=`${article.title||''} ${article.summary||''} ${article.reason||''} ${(article.concepts||[]).join(' ')}`;
    const ktext=textOfKnowledge(k);
    const ac=new Set(concepts(atext)), kc=new Set(concepts(ktext));
    let score=0;
    ac.forEach(x=>{if(kc.has(x))score+=2.2;});
    const aw=new Set(words(article.title||''));
    const kw=new Set(words(k.title||''));
    aw.forEach(x=>{if(kw.has(x))score+=x.length>=5?1.25:.7;});
    const broad=new Set(words(atext));
    const kbroad=new Set(words(ktext));
    let shared=0;broad.forEach(x=>{if(kbroad.has(x))shared++;});
    score+=Math.min(shared,5)*.22;
    if(article.url && k.url && article.url===k.url)score=-99;
    return score;
  }
  function related(article){
    const items=knowledge?.items||knowledge?.recent_stock||[];
    return items.map(k=>({k,score:relationScore(article,k)})).filter(x=>x.score>=1.7).sort((a,b)=>b.score-a.score).slice(0,3);
  }
  function inject(){
    if(!knowledge||!window.data?.articles)return;
    document.querySelectorAll('.article').forEach(card=>{
      if(card.querySelector('.related-knowledge'))return;
      const link=card.querySelector('.article-title');
      if(!link)return;
      const href=link.getAttribute('href');
      const title=link.textContent.trim();
      const article=(data.articles||[]).find(a=>a.url===href||a.title===title);
      if(!article)return;
      const rows=related(article);
      if(!rows.length)return;
      const box=document.createElement('div');box.className='related-knowledge';
      box.innerHTML=`<div class="related-head"><span>🔗 你的旧知识</span><span class="muted small">${rows.length} 条相关</span></div>${rows.map(({k})=>`<a href="${esc(k.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(k.title)}</span><small>${esc(k.category||'未分类')} · ${esc(k.date||'')}</small></a>`).join('')}`;
      const controls=card.querySelector('.controls');
      if(controls)card.insertBefore(box,controls);else card.appendChild(box);
    });
  }
  const oldRender=window.renderArticles||renderArticles;
  window.renderArticles=renderArticles=function(){oldRender();setTimeout(inject,0);};
  fetch('data/knowledge.json',{cache:'no-store'}).then(r=>r.json()).then(k=>{knowledge=k;inject();}).catch(()=>{});
})();
