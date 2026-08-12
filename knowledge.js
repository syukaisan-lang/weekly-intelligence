let K={};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

const TOPIC_RULES=[
  ['Agentic Commerce',/エージェンティック|agentic/i],
  ['AI Search / AEO',/AEO|AI検索|AI経由|AI型購買|生成AI.*購買/i],
  ['CEP / 想起',/CEP|想起/i],
  ['KPI設計',/KPI/i],
  ['検索行動',/検索|SCM/i],
  ['消費者インサイト',/消費者|生活者|インサイト|顧客/i],
  ['EC成長',/EC|eコマース|Amazon|楽天|TikTok Shop/i],
  ['競合戦略',/競合|差別化/i],
  ['広告効果',/広告|メディア投資/i],
  ['AI実務活用',/AI|生成AI/i]
];

function topicFor(title){
  const out=[];
  TOPIC_RULES.forEach(([name,re])=>{if(re.test(title))out.push(name)});
  return out;
}

function renderMetrics(){
  const m=K.metrics||{};
  const stockRate=m.total?Math.round(m.stock/m.total*100):0;
  const vals=[
    ['全部',m.total||0,'Notion条目'],
    ['Stock',m.stock||0,`${stockRate}% 保存率`],
    ['不保存',m.rejected||0,'已明确淘汰'],
    ['已读',m.read||0,'处理完成'],
    ['近90天',m.added_90d||0,'新增条目'],
    ['近30天',m.added_30d||0,'新增条目']
  ];
  $('knowledgeMetrics').innerHTML=vals.map(v=>`<div class="metric"><div class="metric-label">${v[0]}</div><div class="metric-value">${v[1]}</div><div class="metric-sub">${v[2]}</div></div>`).join('');
}

function renderCategories(){
  const rows=[...(K.categories||[])].filter(x=>x.name!=='未分类').sort((a,b)=>b.stock-a.stock);
  const max=Math.max(...rows.map(x=>x.stock),1);
  $('categoryBars').innerHTML=rows.map(x=>{
    const rate=x.total?Math.round(x.stock/x.total*100):0;
    return `<div class="category-row">
      <div class="category-row-head"><span>${esc(x.name)}</span><span class="muted small">Stock ${x.stock}/${x.total} · ${rate}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4,x.stock/max*100)}%"></div></div>
    </div>`;
  }).join('');
}

function renderTopics(){
  const counts={};
  (K.recent_stock||[]).forEach(a=>topicFor(a.title).forEach(t=>counts[t]=(counts[t]||0)+1));
  const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  $('topicCloud').innerHTML=rows.length?rows.map(([t,n])=>`<span class="topic-pill">${esc(t)} <b>${n}</b></span>`).join(''):'<span class="muted small">暂无主题</span>';
}

function populateCategory(){
  const sel=$('knowledgeCategory');
  const cats=[...new Set((K.recent_stock||[]).map(x=>x.category))].sort();
  sel.innerHTML='<option value="all">全部</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
}

function renderRecent(){
  const q=$('knowledgeSearch').value.trim().toLowerCase();
  const cat=$('knowledgeCategory').value;
  const rows=(K.recent_stock||[]).filter(a=>(cat==='all'||a.category===cat)&&(!q||`${a.title} ${a.category} ${topicFor(a.title).join(' ')}`.toLowerCase().includes(q)));
  $('knowledgeCount').textContent=`${rows.length} 篇`;
  $('knowledgeList').innerHTML=rows.map(a=>{
    const topics=topicFor(a.title).slice(0,4);
    return `<article class="article knowledge-article">
      <div class="article-top">
        <div class="meta"><span class="pill">${esc(a.category)}</span><span class="muted small">${esc(a.date)}</span></div>
        <span class="muted small">Notion Stock</span>
      </div>
      <a class="article-title" target="_blank" rel="noopener noreferrer" href="${esc(a.url)}">${esc(a.title)}</a>
      <div class="tags">${topics.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
    </article>`;
  }).join('') || '<div class="empty"><h3>没有匹配内容</h3><p>换一个关键词或分类。</p></div>';
}

function renderResurface(){
  const rows=[...(K.resurface||[])];
  $('resurfaceList').innerHTML=rows.map((a,i)=>`<a class="resurface-item" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer"><span class="resurface-num">0${i+1}</span><span>${esc(a.title)}</span></a>`).join('');
}

function renderInsights(){
  const c=K.categories||[];
  const byRate=[...c].filter(x=>x.name!=='未分类'&&x.total>=5).map(x=>({...x,rate:x.stock/x.total})).sort((a,b)=>b.rate-a.rate);
  const top=byRate[0];
  const mkt=c.find(x=>x.name==='マーケティング');
  const consumer=c.find(x=>x.name==='消費者');
  const recentTopics={};
  (K.recent_stock||[]).forEach(a=>topicFor(a.title).forEach(t=>recentTopics[t]=(recentTopics[t]||0)+1));
  const strongest=Object.entries(recentTopics).sort((a,b)=>b[1]-a[1])[0];
  const items=[];
  if(top)items.push(`<div class="insight-item"><b>${esc(top.name)}</b> 的保存率最高：${Math.round(top.rate*100)}%</div>`);
  if(mkt&&consumer)items.push(`<div class="insight-item">你已 Stock <b>${mkt.stock}</b> 篇 Marketing、<b>${consumer.stock}</b> 篇消费者相关内容。</div>`);
  if(strongest)items.push(`<div class="insight-item">最近 Stock 中最密集的细分主题是 <b>${esc(strongest[0])}</b>。</div>`);
  items.push(`<div class="insight-item">当前数据库 654 条中有 387 条未分类，说明“现有大类”本身不够描述你的知识结构，细分主题层会更有价值。</div>`);
  $('knowledgeInsights').innerHTML=items.join('');
}

async function init(){
  try{
    K=await fetch('data/knowledge.json',{cache:'no-store'}).then(r=>r.json());
    $('knowledgeUpdated').textContent=`Notion快照 ${new Date(K.meta.snapshot_at).toLocaleString('ja-JP')}`;
    renderMetrics();renderCategories();renderTopics();populateCategory();renderRecent();renderResurface();renderInsights();
  }catch(e){
    $('knowledgeUpdated').textContent='数据读取失败';
    console.error(e);
  }
}

$('knowledgeSearch').addEventListener('input',renderRecent);
$('knowledgeCategory').addEventListener('change',renderRecent);
$('shuffleResurface').addEventListener('click',()=>{
  const box=$('resurfaceList');
  const items=[...box.children];
  items.sort(()=>Math.random()-.5).forEach(x=>box.appendChild(x));
});
init();
