let K={};
let activeKnowledgeCategory='all';
let activeTopic='all';
let knowledgeLimit=30;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

const TOPIC_RULES=[
  ['Agentic Commerce',/エージェンティック|agentic/i],
  ['AI Search / AEO',/AEO|AIO|GEO|AI検索|AI経由|AI型購買|AIショッピング/i],
  ['生成AI実務',/生成AI|ChatGPT|LLM|AI活用|AIエージェント/i],
  ['CEP / 想起',/CEP|想起|第一想起/i],
  ['KPI / 計測',/KPI|KGI|計測|指標|効果測定/i],
  ['検索行動',/検索行動|検索数|検索クエリ|SCM|SEO/i],
  ['購買行動',/購買|購入|買う|ファネル|決済/i],
  ['消費者インサイト',/消費者|生活者|インサイト|N.?=.?1|顧客理解/i],
  ['EC成長',/EC|eコマース|Amazon|楽天|TikTok Shop|D2C|モール/i],
  ['広告効果',/広告|メディア投資|リーチ|フリークエンシー|CTR|CPA/i],
  ['ブランド成長',/ブランド|認知|シェア|ロイヤル|浸透率/i],
  ['価格戦略',/価格|値上げ|プライシング|値付け/i],
  ['CRM / LTV',/CRM|LTV|会員|ロイヤルティ|メール|メルマガ/i],
  ['SNS / UGC',/SNS|UGC|TikTok|Instagram|インフルエンサー|VTuber/i],
  ['市場 / 競合',/市場|競合|差別化|シェア|ポジショニング/i],
  ['調査設計',/調査|アンケート|モニター|サンプル|回答率/i],
  ['商品開発',/商品開発|新商品|新ニーズ|パッケージ/i],
  ['マネジメント',/マネジメント|組織|会議|評価制度|コミュニケーション/i]
];

function items(){return K.items||K.recent_stock||[];}
function commentsOf(a){return Array.isArray(a.comments)?a.comments:[];}
function textOf(a){return `${a.title||''} ${a.summary||''} ${commentsOf(a).map(c=>c.text||'').join(' ')}`;}
function topicsFor(a){
  if(Array.isArray(a.topics)&&a.topics.length)return a.topics;
  const text=textOf(a);const out=[];TOPIC_RULES.forEach(([n,re])=>{if(re.test(text))out.push(n)});return out;
}
function formatDate(s){return s||'';}

function renderMetrics(){
  const m=K.metrics||{};
  const stock=m.stock??items().length;
  const total=m.total??stock;
  const commentCount=items().reduce((n,a)=>n+commentsOf(a).length,0);
  const withComments=items().filter(a=>commentsOf(a).length).length;
  const vals=[
    ['Stock',stock,`${total?Math.round(stock/total*100):0}% 保存率`],
    ['Comment',commentCount,`${withComments} 篇含你的笔记`],
    ['分类',(K.categories||[]).filter(x=>x.stock>0).length,'Notion 種類'],
    ['细分主题',new Set(items().flatMap(topicsFor)).size,'标题+摘要+Comment'],
    ['近90天',m.added_90d??items().filter(a=>a.date&&new Date(a.date)>=new Date(Date.now()-90*86400000)).length,'新增条目'],
    ['知识总量',total,'含淘汰/未保存']
  ];
  $('knowledgeMetrics').innerHTML=vals.map(v=>`<div class="metric"><div class="metric-label">${v[0]}</div><div class="metric-value">${v[1]}</div><div class="metric-sub">${v[2]}</div></div>`).join('');
}

function renderCategoryTags(){
  const rows=[...(K.categories||[])].filter(x=>x.stock>0).sort((a,b)=>b.stock-a.stock);
  if(!rows.length){
    const counts={};items().forEach(a=>counts[a.category||'未分类']=(counts[a.category||'未分类']||0)+1);
    Object.entries(counts).forEach(([name,stock])=>rows.push({name,stock,total:stock,rejected:0}));
    rows.sort((a,b)=>b.stock-a.stock);
  }
  const all=K.metrics?.stock??items().length;
  $('knowledgeCategoryTags').innerHTML=[{name:'all',stock:all},...rows].map(x=>`<button type="button" class="category-filter-btn ${activeKnowledgeCategory===x.name?'active':''}" data-cat="${esc(x.name)}"><span>${x.name==='all'?'全部':esc(x.name)}</span><b>${x.stock}</b></button>`).join('');
  $('knowledgeCategoryTags').querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{
    activeKnowledgeCategory=b.dataset.cat;knowledgeLimit=30;renderCategoryTags();renderList();
  });
}

function renderCategories(){
  const rows=[...(K.categories||[])].filter(x=>x.name!=='未分类'&&x.stock>0).sort((a,b)=>b.stock-a.stock);
  const max=Math.max(...rows.map(x=>x.stock),1);
  $('categoryBars').innerHTML=rows.map(x=>{
    const rate=x.total?Math.round(x.stock/x.total*100):0;
    return `<button class="category-row category-row-button" type="button" data-catbar="${esc(x.name)}"><div class="category-row-head"><span>${esc(x.name)}</span><span class="muted small">Stock ${x.stock}/${x.total} · ${rate}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(4,x.stock/max*100)}%"></div></div></button>`;
  }).join('');
  $('categoryBars').querySelectorAll('[data-catbar]').forEach(b=>b.onclick=()=>{
    activeKnowledgeCategory=b.dataset.catbar;knowledgeLimit=30;renderCategoryTags();renderList();$('knowledgeList').scrollIntoView({behavior:'smooth',block:'start'});
  });
}

function renderTopics(){
  const counts={};items().forEach(a=>topicsFor(a).forEach(t=>counts[t]=(counts[t]||0)+1));
  const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  $('topicCloud').innerHTML=`<button type="button" class="topic-pill ${activeTopic==='all'?'active':''}" data-topic="all">全部主题</button>`+rows.map(([t,n])=>`<button type="button" class="topic-pill ${activeTopic===t?'active':''}" data-topic="${esc(t)}">${esc(t)} <b>${n}</b></button>`).join('');
  $('topicCloud').querySelectorAll('[data-topic]').forEach(b=>b.onclick=()=>{activeTopic=b.dataset.topic;knowledgeLimit=30;renderTopics();renderList();});
}

function currentRows(){
  const q=($('knowledgeSearch')?.value||'').trim().toLowerCase();
  const commentFilter=$('knowledgeCommentFilter')?.value||'all';
  const sort=$('knowledgeSort')?.value||'newest';
  let rows=items().filter(a=>{
    if(activeKnowledgeCategory!=='all'&&(a.category||'未分类')!==activeKnowledgeCategory)return false;
    if(activeTopic!=='all'&&!topicsFor(a).includes(activeTopic))return false;
    if(commentFilter==='with'&&!commentsOf(a).length)return false;
    if(commentFilter==='without'&&commentsOf(a).length)return false;
    if(q&&!textOf(a).toLowerCase().includes(q)&&!topicsFor(a).join(' ').toLowerCase().includes(q))return false;
    return true;
  });
  if(sort==='oldest')rows.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  else if(sort==='comments')rows.sort((a,b)=>commentsOf(b).length-commentsOf(a).length||(b.date||'').localeCompare(a.date||''));
  else rows.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  return rows;
}

function commentHtml(a){
  const cs=commentsOf(a);if(!cs.length)return '';
  return `<details class="comment-box"><summary>💬 你的 Comment ${cs.length} 条</summary><div class="comment-list">${cs.map(c=>`<div class="comment-item"><div>${esc(c.text||'')}</div>${c.created_time?`<small>${esc(String(c.created_time).slice(0,10))}</small>`:''}</div>`).join('')}</div></details>`;
}

function renderList(){
  const rows=currentRows();
  const shown=rows.slice(0,knowledgeLimit);
  $('knowledgeCount').textContent=`${rows.length} 篇`;
  $('knowledgeActiveCategory').textContent=activeKnowledgeCategory==='all'?'全部分类':activeKnowledgeCategory;
  $('knowledgeList').innerHTML=shown.map(a=>`<article class="article knowledge-article"><div class="article-top"><div class="meta"><span class="pill">${esc(a.category||'未分类')}</span><span class="muted small">${esc(formatDate(a.date))}</span>${commentsOf(a).length?`<span class="pill comment-pill">💬 ${commentsOf(a).length}</span>`:''}</div><span class="muted small">Notion Stock</span></div><a class="article-title" target="_blank" rel="noopener noreferrer" href="${esc(a.url)}">${esc(a.title)}</a>${a.summary?`<div class="knowledge-summary">${esc(a.summary)}</div>`:''}<div class="tags">${topicsFor(a).slice(0,5).map(t=>`<button type="button" class="tag tag-button" data-inline-topic="${esc(t)}">${esc(t)}</button>`).join('')}</div>${commentHtml(a)}</article>`).join('')||'<div class="empty"><h3>没有匹配内容</h3><p>搜索会同时检查标题、summary 和你的 Comment。</p></div>';
  $('knowledgeList').querySelectorAll('[data-inline-topic]').forEach(b=>b.onclick=()=>{activeTopic=b.dataset.inlineTopic;knowledgeLimit=30;renderTopics();renderList();});
  const more=$('loadMoreKnowledge');
  if(more){more.classList.toggle('hidden',shown.length>=rows.length);more.textContent=`再显示 ${Math.min(30,Math.max(0,rows.length-shown.length))} 篇`;}
}

function renderResurface(){
  let rows=items().filter(a=>a.date&&new Date(a.date)<new Date(Date.now()-365*86400000));
  if(rows.length<3)rows=[...items()];
  rows.sort(()=>Math.random()-.5);rows=rows.slice(0,5);
  $('resurfaceList').innerHTML=rows.map((a,i)=>`<a class="resurface-item" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer"><span class="resurface-num">${String(i+1).padStart(2,'0')}</span><span><b>${esc(a.title)}</b><small>${esc(a.category||'未分类')} · ${esc(a.date||'')}</small></span></a>`).join('');
}

function renderInsights(){
  const c=K.categories||[];
  const byRate=[...c].filter(x=>x.name!=='未分类'&&x.total>=5).map(x=>({...x,rate:x.stock/x.total})).sort((a,b)=>b.rate-a.rate);
  const top=byRate[0];
  const commentHeavy=[...items()].sort((a,b)=>commentsOf(b).length-commentsOf(a).length)[0];
  const tc={};items().forEach(a=>topicsFor(a).forEach(t=>tc[t]=(tc[t]||0)+1));
  const strongest=Object.entries(tc).sort((a,b)=>b[1]-a[1])[0];
  const recent90=items().filter(a=>a.date&&new Date(a.date)>=new Date(Date.now()-90*86400000));
  const recentTc={};recent90.forEach(a=>topicsFor(a).forEach(t=>recentTc[t]=(recentTc[t]||0)+1));
  const recentTop=Object.entries(recentTc).sort((a,b)=>b[1]-a[1])[0];
  const list=[];
  if(top)list.push(`<div class="insight-item"><b>${esc(top.name)}</b> 是保存率最高的大类：${Math.round(top.rate*100)}%</div>`);
  if(strongest)list.push(`<div class="insight-item">长期积累最密集的细分主题：<b>${esc(strongest[0])}</b>（${strongest[1]}篇）</div>`);
  if(recentTop)list.push(`<div class="insight-item">近90天最活跃的主题：<b>${esc(recentTop[0])}</b></div>`);
  if(commentHeavy&&commentsOf(commentHeavy).length)list.push(`<div class="insight-item">Comment 最丰富的 Stock：<b>${esc(commentHeavy.title)}</b></div>`);
  list.push(`<div class="insight-item">搜索与主题判断已把 <b>Comment</b> 当作知识正文参与，而不只是标题附注。</div>`);
  $('knowledgeInsights').innerHTML=list.join('');
}

async function init(){
  try{
    K=await fetch('data/knowledge.json',{cache:'no-store'}).then(r=>r.json());
    const snap=K.meta?.snapshot_at;
    $('knowledgeUpdated').textContent=snap?`Notion同步 ${new Date(snap).toLocaleString('ja-JP')}`:'Notion快照';
    renderMetrics();renderCategoryTags();renderCategories();renderTopics();renderList();renderResurface();renderInsights();
  }catch(e){$('knowledgeUpdated').textContent='数据读取失败';console.error(e);}
}

$('knowledgeSearch')?.addEventListener('input',()=>{knowledgeLimit=30;renderList();});
$('knowledgeCommentFilter')?.addEventListener('change',()=>{knowledgeLimit=30;renderList();});
$('knowledgeSort')?.addEventListener('change',renderList);
$('loadMoreKnowledge')?.addEventListener('click',()=>{knowledgeLimit+=30;renderList();});
$('shuffleResurface')?.addEventListener('click',renderResurface);
init();
