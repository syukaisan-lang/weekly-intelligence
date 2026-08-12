const STATE_KEY='weekly_intelligence_state_v1';
let data={meta:{},articles:[]}, status={};
let state=JSON.parse(localStorage.getItem(STATE_KEY)||'{}');
let prefs={concepts:{}};
const $=id=>document.getElementById(id);
const effects={accurate:.06,more:.24,bad:-.10,less:-.30};
const FALLBACK_CONCEPTS=[
  '生成AI','AI','AIO','GEO','LLM','ChatGPT','AIエージェント','UGC','SNS','SEO','CRM','NPS','VOC','CX',
  '消費者','生活者','顧客','ユーザー','購買行動','購買','購入','インサイト','ブランド','広告','コンテンツ',
  'EC','eコマース','Amazon','楽天','D2C','小売','リテール','CVR','コンバージョン','価格','チャネル',
  'GTM','市場','成長','競争','シェア','ポジショニング','調査','研究','データ','統計','実証','分析','事例','ケース','フレームワーク'
];
const STOP_EN=new Set(['the','and','for','with','from','this','that','into','news','japan','online','marketing','business']);
function save(){localStorage.setItem(STATE_KEY,JSON.stringify(state));}
function st(id){return state[id]||{status:'new',feedback:null};}
function contentFeatures(a){
  const text=`${a.title||''} ${a.summary||''} ${a.reason||''}`;
  const out=[];
  (a.concepts||[]).forEach(x=>{if(x&&String(x).trim())out.push(String(x).trim());});
  FALLBACK_CONCEPTS.forEach(x=>{if(text.toLowerCase().includes(x.toLowerCase()))out.push(x);});
  const latin=(a.title||'').match(/[A-Za-z][A-Za-z0-9+.-]{1,14}/g)||[];
  latin.forEach(x=>{const k=x.toLowerCase();if(!STOP_EN.has(k)&&!/^https?$/.test(k))out.push(x);});
  return [...new Set(out)].slice(0,14);
}
function rebuildPrefs(){
  prefs={concepts:{}};
  for(const a of data.articles||[]){
    const fb=st(a.id).feedback;
    if(!fb||effects[fb]===undefined)continue;
    const delta=effects[fb];
    const fs=contentFeatures(a);
    fs.forEach(f=>prefs.concepts[f]=(prefs.concepts[f]||0)+delta);
  }
}
function score(a){
  let x=Number(a.reading_score??a.base_score??5);
  const ws=contentFeatures(a).map(f=>prefs.concepts[f]||0).sort((a,b)=>Math.abs(b)-Math.abs(a));
  x+=ws.slice(0,6).reduce((s,v)=>s+v,0);
  return Math.max(0,Math.min(10,x));
}
function grade(x){return x>=8.7?'S':x>=7.2?'A':x>=5.5?'B':'C';}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function short(s){return s.length>28?s.slice(0,27)+'…':s;}
function fmt(s){return s?s.slice(0,10).replaceAll('-','/'):'日期不明';}
function label(s){return ({new:'未处理',later:'稍后看',read:'已读',save:'进 Notion',skip:'跳过'})[s]||s;}
function btn(text,active,fn){const b=document.createElement('button');b.type='button';b.className='btn'+(active?' active':'');b.textContent=text;b.onclick=fn;return b;}
function feedback(a,v){
  const cur=st(a.id);cur.feedback=cur.feedback===v?null:v;state[a.id]=cur;save();rebuildPrefs();render();
}
function setStatus(a,v){const cur=st(a.id);cur.status=cur.status===v?'new':v;state[a.id]=cur;save();render();}
function renderMetrics(){const arts=data.articles||[],gs=arts.map(a=>grade(score(a)));const vals=[['新增',status.raw_new_count??arts.length,'8/10 起'],['去重后',status.deduped_count??arts.length,'唯一文章'],['深读',status.deep_read_count??0,'高潜力候选'],['S',gs.filter(x=>x==='S').length,'必看'],['A',gs.filter(x=>x==='A').length,'值得看'],['待处理',arts.filter(a=>st(a.id).status==='new').length,'未反馈']];$('metrics').innerHTML=vals.map(v=>`<div class="metric"><div class="metric-label">${v[0]}</div><div class="metric-value">${v[1]}</div><div class="metric-sub">${v[2]}</div></div>`).join('');}
function renderCoverage(){const exp=status.expected_sources??21,ok=status.successful_sources??0;$('coveragePill').textContent=`${ok}/${exp}`;const failed=status.failed_sources||[];const w=$('coverageWarning');if(!status.generated_at){w.classList.remove('hidden');w.textContent='首次数据刷新尚未运行。请在 GitHub Actions 手动运行一次 Update feeds。';}else if(failed.length){w.classList.remove('hidden');w.textContent=`⚠ 本次并非全量：${failed.length} 个来源抓取失败。`;}else w.classList.add('hidden');$('sourceCoverage').innerHTML=(status.sources||[]).map(s=>`<div class="coverage-item"><span title="${esc(s.error||'')}">${esc(short(s.name))}</span><span class="${s.status==='ok'?'status-ok':s.status==='failed'?'status-fail':'status-pending'}">${s.status==='ok'?(s.new_count||0)+' 新增':s.status==='failed'?'失败':'待刷新'}</span></div>`).join('');}
function renderPrefs(){
  let rows=Object.entries(prefs.concepts).filter(([,v])=>Math.abs(v)>.04);
  rows.sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
  $('learnedPrefs').innerHTML=rows.length?rows.slice(0,12).map(r=>`<div class="pref-row"><span>${esc(r[0])}</span><span class="weight ${r[1]>=0?'pos':'neg'}">${r[1]>=0?'+':''}${r[1].toFixed(2)}</span></div>`).join(''):'<div class="muted small">还没有内容偏好。反馈文章后，这里会学习具体主题、概念和标题特征。</div>';
}
function sourceOptions(){const sel=$('sourceFilter'),cur=sel.value,arr=[...new Set((data.articles||[]).map(a=>a.source))].sort();sel.innerHTML='<option value="all">全部来源</option>'+arr.map(s=>`<option value="${esc(s)}">${esc(short(s))}</option>`).join('');if(arr.includes(cur))sel.value=cur;}
function visible(a){const g=grade(score(a)),gf=$('gradeFilter').value,sf=$('statusFilter').value,src=$('sourceFilter').value,as=st(a.id).status;if(gf==='SA'&&!['S','A'].includes(g))return false;if(['S','A','B'].includes(gf)&&g!==gf)return false;if(sf==='active'&&as==='skip')return false;if(!['all','active'].includes(sf)&&as!==sf)return false;if(src!=='all'&&a.source!==src)return false;return true;}
function renderArticles(){let arts=(data.articles||[]).filter(visible);if($('personalizedSort').checked)arts.sort((a,b)=>score(b)-score(a));$('visibleCount').textContent=`${arts.length} 篇`;$('emptyState').classList.toggle('hidden',arts.length>0);$('articleList').innerHTML='';for(const a of arts){const cur=st(a.id),sc=score(a),g=grade(sc),el=document.createElement('article');el.className='article';const features=contentFeatures(a).slice(0,8);el.innerHTML=`<div class="article-top"><div class="meta"><span class="grade grade-${g}">${g}</span><span class="muted small">${fmt(a.published)} · ${esc(a.source)}</span><span class="pill">${label(cur.status)}</span></div><div class="muted small">个人分 ${sc.toFixed(1)}</div></div><a class="article-title" target="_blank" rel="noopener noreferrer" href="${esc(a.url)}">${esc(a.title)}</a><div class="scores"><span class="score">阅读价值 <b>${Number(a.reading_score??5).toFixed(1)}</b>/10</span><span class="score">Notion价值 <b>${Number(a.notion_score??4).toFixed(1)}</b>/10</span><span class="score">${a.content_checked?'正文已检查':'标题/摘要判断'}</span></div><div class="why"><b>为什么选：</b>${esc(a.reason||'等待筛选说明')}</div><div class="tags">${features.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>${a.screening_note?`<div class="source-note">${esc(a.screening_note)}</div>`:''}`;const c=document.createElement('div');c.className='controls';[['later','稍后看'],['read','已读'],['save','进 Notion'],['skip','跳过']].forEach(([v,t])=>c.appendChild(btn(t,cur.status===v,()=>setStatus(a,v))));const lab=document.createElement('div');lab.className='feedback-label';lab.textContent='筛选反馈（只学习内容，不学习媒体）';c.appendChild(lab);[['accurate','👍 选得准'],['more','⭐ 多推类似'],['bad','👎 不值得'],['less','🚫 少推此类']].forEach(([v,t])=>c.appendChild(btn(t,cur.feedback===v,()=>feedback(a,v))));el.appendChild(c);$('articleList').appendChild(el);}}
function render(){renderMetrics();renderCoverage();renderPrefs();sourceOptions();renderArticles();}
async function init(){try{[data,status]=await Promise.all([fetch('data/articles.json',{cache:'no-store'}).then(r=>r.json()),fetch('data/source_status.json',{cache:'no-store'}).then(r=>r.json())]);rebuildPrefs();$('lastUpdated').textContent=data.meta?.generated_at?`最近更新 ${new Date(data.meta.generated_at).toLocaleString('ja-JP')}`:'尚未首次刷新';render();}catch(e){$('coverageWarning').classList.remove('hidden');$('coverageWarning').textContent='无法读取数据文件：'+e.message;}}
['gradeFilter','statusFilter','sourceFilter','personalizedSort'].forEach(id=>$(id).addEventListener('change',renderArticles));
$('resetLearning').addEventListener('click',()=>{if(confirm('确定只清空内容偏好学习？已读/稍后看/Notion/跳过状态会保留。')){Object.keys(state).forEach(id=>{if(state[id])state[id].feedback=null;});save();rebuildPrefs();render();}});
init();