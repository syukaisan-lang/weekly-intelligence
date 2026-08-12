const STATE_KEY='weekly_intelligence_state_v1';
let data={meta:{},articles:[]}, status={};
let state=JSON.parse(localStorage.getItem(STATE_KEY)||'{}');
let prefs={topics:{},formats:{},intents:{},signals:{}};
const $=id=>document.getElementById(id);

const TOPIC_TERMS=[
  '生成AI','AIエージェント','AIO','GEO','LLM','ChatGPT','AI','UGC','SNS','SEO','CRM','NPS','VOC','CX',
  '消費者','生活者','顧客','ユーザー','購買行動','インサイト','ブランド','広告','コンテンツ',
  'EC','eコマース','Amazon','楽天','D2C','小売','リテール','CVR','コンバージョン','価格','チャネル',
  'GTM','市場','競争','シェア','ポジショニング','調査','データ','実証','分析','フレームワーク'
];
const GENERIC_TOPICS=new Set(['AI','生成AI','EC','eコマース','市場','調査','データ','広告','ブランド','消費者','顧客','ユーザー','コンテンツ']);
const FORMAT_RULES=[
  ['オンラインセミナー',/オンライン\s*(セミナー|勉強会)|ウェビナー|webinar/i],
  ['セミナー／イベント',/セミナー|勉強会|イベント|カンファレンス|フォーラム|講演|登壇/i],
  ['調査レポート',/調査|アンケート|白書|レポート|research|survey/i],
  ['インタビュー／対談',/インタビュー|対談|鼎談|座談会/i],
  ['事例／ケース',/導入事例|活用事例|成功事例|ケーススタディ|事例|case study/i],
  ['解説／ハウツー',/解説|指南|入門|方法|やり方|how.?to|ノウハウ/i],
  ['ランキング／まとめ',/ランキング|まとめ|一覧|ベスト\d|top\s*\d/i],
  ['新商品／新サービス発表',/新製品|新商品|新サービス|発売|予約開始|提供開始|リリース/i],
  ['キャンペーン／販促',/キャンペーン|プレゼント|セール|割引|クーポン/i]
];
const INTENT_RULES=[
  ['参加募集／イベント告知',/参加(者)?募集|申込|申し込み|受付中|開催(決定|予定)?|登壇|オンラインセミナー|ウェビナー|webinar/i],
  ['リード獲得',/資料請求|ダウンロード|無料相談|問い合わせ|ホワイトペーパー/i],
  ['商品・サービス告知',/発売|予約開始|提供開始|リリース|新製品|新商品|新サービス/i],
  ['販促告知',/キャンペーン|プレゼント|セール|割引|クーポン/i],
  ['調査結果共有',/調査結果|アンケート結果|明らかに|判明|実態調査|白書/i],
  ['事例共有',/導入事例|活用事例|成功事例|ケーススタディ|事例/i],
  ['知識解説',/解説|指南|入門|方法|ノウハウ|ポイント|考察/i]
];
const SIGNAL_RULES=[
  ['一次データ',/独自調査|自社調査|アンケート|実証|実験|統計|データ分析/i],
  ['再利用できる方法論',/フレームワーク|手法|方法|プロセス|検証|改善|運用/i],
  ['イベント色が強い',/オンラインセミナー|ウェビナー|参加募集|申込|登壇|開催/i],
  ['PR／告知色が強い',/PR|発売|提供開始|キャンペーン|プレゼント|セール|予約開始/i]
];
const EVENT_FORMATS=new Set(['オンラインセミナー','セミナー／イベント']);
const PROMO_FORMATS=new Set(['新商品／新サービス発表','キャンペーン／販促']);
const LOW_VALUE_INTENTS=new Set(['参加募集／イベント告知','リード獲得','商品・サービス告知','販促告知']);

function save(){localStorage.setItem(STATE_KEY,JSON.stringify(state));}
function st(id){return state[id]||{status:'new',feedback:null};}
function unique(xs){return [...new Set(xs.filter(Boolean))];}
function textOf(a){return `${a.title||''} ${a.summary||''} ${a.reason||''} ${(a.content_excerpt||'').slice(0,1600)}`;}
function matchRules(text,rules){return rules.filter(([,re])=>re.test(text)).map(([name])=>name);}
function inferredTopics(a){
  const text=textOf(a), low=text.toLowerCase(), out=[];
  (a.learning_features?.topics||a.concepts||[]).forEach(x=>{if(x&&String(x).trim())out.push(String(x).trim());});
  TOPIC_TERMS.forEach(x=>{if(low.includes(x.toLowerCase()))out.push(x);});
  return unique(out).filter(x=>!['strategy','consumer','research','marketing','method','ai','ec'].includes(String(x).toLowerCase())).slice(0,14);
}
function typedFeatures(a){
  const text=textOf(a);
  const lf=a.learning_features||{};
  const topics=inferredTopics(a);
  const formats=unique([...(lf.formats||[]),...matchRules(text,FORMAT_RULES)]).slice(0,6);
  const intents=unique([...(lf.intents||[]),...matchRules(text,INTENT_RULES)]).slice(0,6);
  const signals=unique([...(lf.signals||[]),...matchRules(text,SIGNAL_RULES)]).slice(0,6);
  return {topics,formats,intents,signals};
}
function isContextDominant(f){
  return f.formats.some(x=>EVENT_FORMATS.has(x)||PROMO_FORMATS.has(x)) || f.intents.some(x=>LOW_VALUE_INTENTS.has(x));
}
function add(map,key,delta){map[key]=(map[key]||0)+delta;}
function applyFeedback(a,feedback){
  const f=typedFeatures(a), contextHeavy=isContextDominant(f);
  if(feedback==='accurate'){
    f.topics.forEach(x=>add(prefs.topics,x,GENERIC_TOPICS.has(x)?.025:.055));
    f.formats.forEach(x=>add(prefs.formats,x,.025));
    f.intents.forEach(x=>add(prefs.intents,x,.025));
    f.signals.forEach(x=>add(prefs.signals,x,.035));
  }else if(feedback==='more'){
    f.topics.forEach(x=>add(prefs.topics,x,GENERIC_TOPICS.has(x)?.08:.18));
    f.formats.forEach(x=>add(prefs.formats,x,.10));
    f.intents.forEach(x=>add(prefs.intents,x,.12));
    f.signals.forEach(x=>add(prefs.signals,x,.14));
  }else if(feedback==='bad'){
    f.formats.forEach(x=>add(prefs.formats,x,contextHeavy?-.18:-.07));
    f.intents.forEach(x=>add(prefs.intents,x,contextHeavy?-.24:-.09));
    f.signals.forEach(x=>add(prefs.signals,x,contextHeavy?-.16:-.08));
    f.topics.forEach(x=>add(prefs.topics,x,contextHeavy?(GENERIC_TOPICS.has(x)?0:-.015):(GENERIC_TOPICS.has(x)?-.015:-.045)));
  }else if(feedback==='less'){
    f.formats.forEach(x=>add(prefs.formats,x,contextHeavy?-.46:-.22));
    f.intents.forEach(x=>add(prefs.intents,x,contextHeavy?-.58:-.28));
    f.signals.forEach(x=>add(prefs.signals,x,contextHeavy?-.34:-.18));
    f.topics.forEach(x=>add(prefs.topics,x,contextHeavy?(GENERIC_TOPICS.has(x)?0:-.03):(GENERIC_TOPICS.has(x)?-.035:-.11)));
  }
}
function rebuildPrefs(){
  prefs={topics:{},formats:{},intents:{},signals:{}};
  for(const a of data.articles||[]){const fb=st(a.id).feedback;if(fb)applyFeedback(a,fb);}
}
function dimScore(map,keys,maxItems,cap){
  const vals=keys.map(k=>map[k]||0).filter(v=>v!==0).sort((a,b)=>Math.abs(b)-Math.abs(a)).slice(0,maxItems);
  const sum=vals.reduce((s,v)=>s+v,0);return Math.max(-cap,Math.min(cap,sum));
}
function score(a){
  let x=Number(a.reading_score??a.base_score??5);const f=typedFeatures(a);
  x+=dimScore(prefs.topics,f.topics,4,.8);
  x+=dimScore(prefs.formats,f.formats,2,.8);
  x+=dimScore(prefs.intents,f.intents,2,1.0);
  x+=dimScore(prefs.signals,f.signals,2,.6);
  return Math.max(0,Math.min(10,x));
}
function grade(x){return x>=8.7?'S':x>=7.2?'A':x>=5.5?'B':'C';}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function short(s){return s.length>28?s.slice(0,27)+'…':s;}
function fmt(s){return s?s.slice(0,10).replaceAll('-','/'):'日期不明';}
function label(s){return ({new:'未处理',later:'稍后看',read:'已读',save:'进 Notion',skip:'跳过'})[s]||s;}
function btn(text,active,fn){const b=document.createElement('button');b.type='button';b.className='btn'+(active?' active':'');b.textContent=text;b.onclick=fn;return b;}
function feedback(a,v){const cur=st(a.id);cur.feedback=cur.feedback===v?null:v;state[a.id]=cur;save();rebuildPrefs();render();}
function setStatus(a,v){const cur=st(a.id);cur.status=cur.status===v?'new':v;state[a.id]=cur;save();render();}
function renderMetrics(){const arts=data.articles||[],gs=arts.map(a=>grade(score(a)));const vals=[['新增',status.raw_new_count??arts.length,'8/10 起'],['去重后',status.deduped_count??arts.length,'唯一文章'],['深读',status.deep_read_count??0,'高潜力候选'],['S',gs.filter(x=>x==='S').length,'必看'],['A',gs.filter(x=>x==='A').length,'值得看'],['待处理',arts.filter(a=>st(a.id).status==='new').length,'未反馈']];$('metrics').innerHTML=vals.map(v=>`<div class="metric"><div class="metric-label">${v[0]}</div><div class="metric-value">${v[1]}</div><div class="metric-sub">${v[2]}</div></div>`).join('');}
function renderCoverage(){const exp=status.expected_sources??21,ok=status.successful_sources??0;$('coveragePill').textContent=`${ok}/${exp}`;const failed=status.failed_sources||[];const w=$('coverageWarning');if(!status.generated_at){w.classList.remove('hidden');w.textContent='首次数据刷新尚未运行。请在 GitHub Actions 手动运行一次 Update feeds。';}else if(failed.length){w.classList.remove('hidden');w.textContent=`⚠ 本次并非全量：${failed.length} 个来源抓取失败。`;}else w.classList.add('hidden');$('sourceCoverage').innerHTML=(status.sources||[]).map(s=>`<div class="coverage-item"><span title="${esc(s.error||'')}">${esc(short(s.name))}</span><span class="${s.status==='ok'?'status-ok':s.status==='failed'?'status-fail':'status-pending'}">${s.status==='ok'?(s.new_count||0)+' 新增':s.status==='failed'?'失败':'待刷新'}</span></div>`).join('');}
function renderPrefs(){
  const rows=[];const labels={topics:'主题',formats:'形式',intents:'意图',signals:'特征'};
  for(const dim of ['topics','formats','intents','signals'])Object.entries(prefs[dim]).filter(([,v])=>Math.abs(v)>.025).forEach(([k,v])=>rows.push([`${labels[dim]}：${k}`,v]));
  rows.sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
  $('learnedPrefs').innerHTML=rows.length?rows.slice(0,14).map(r=>`<div class="pref-row"><span>${esc(r[0])}</span><span class="weight ${r[1]>=0?'pos':'neg'}">${r[1]>=0?'+':''}${r[1].toFixed(2)}</span></div>`).join(''):'<div class="muted small">还没有偏好。系统会分别学习“主题 / 内容形式 / 文章意图”，避免把对线上会的反感错误算到 AI 主题上。</div>';
}
function sourceOptions(){const sel=$('sourceFilter'),cur=sel.value,arr=[...new Set((data.articles||[]).map(a=>a.source))].sort();sel.innerHTML='<option value="all">全部来源</option>'+arr.map(s=>`<option value="${esc(s)}">${esc(short(s))}</option>`).join('');if(arr.includes(cur))sel.value=cur;}
function visible(a){const g=grade(score(a)),gf=$('gradeFilter').value,sf=$('statusFilter').value,src=$('sourceFilter').value,as=st(a.id).status;if(gf==='SA'&&!['S','A'].includes(g))return false;if(['S','A','B'].includes(gf)&&g!==gf)return false;if(sf==='active'&&as==='skip')return false;if(!['all','active'].includes(sf)&&as!==sf)return false;if(src!=='all'&&a.source!==src)return false;return true;}
function renderArticles(){
  let arts=(data.articles||[]).filter(visible);if($('personalizedSort').checked)arts.sort((a,b)=>score(b)-score(a));$('visibleCount').textContent=`${arts.length} 篇`;$('emptyState').classList.toggle('hidden',arts.length>0);$('articleList').innerHTML='';
  for(const a of arts){
    const cur=st(a.id),sc=score(a),g=grade(sc),el=document.createElement('article');el.className='article';const f=typedFeatures(a);
    const chips=[...f.topics.slice(0,4).map(x=>`主题：${x}`),...f.formats.slice(0,2).map(x=>`形式：${x}`),...f.intents.slice(0,2).map(x=>`意图：${x}`)];
    el.innerHTML=`<div class="article-top"><div class="meta"><span class="grade grade-${g}">${g}</span><span class="muted small">${fmt(a.published)} · ${esc(a.source)}</span><span class="pill">${label(cur.status)}</span></div><div class="muted small">个人分 ${sc.toFixed(1)}</div></div><a class="article-title" target="_blank" rel="noopener noreferrer" href="${esc(a.url)}">${esc(a.title)}</a><div class="scores"><span class="score">阅读价值 <b>${Number(a.reading_score??5).toFixed(1)}</b>/10</span><span class="score">Notion价值 <b>${Number(a.notion_score??4).toFixed(1)}</b>/10</span><span class="score">${a.content_checked?'正文已检查':'标题/摘要判断'}</span></div><div class="why"><b>为什么选：</b>${esc(a.reason||'等待筛选说明')}</div><div class="tags">${chips.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>${a.screening_note?`<div class="source-note">${esc(a.screening_note)}</div>`:''}`;
    const c=document.createElement('div');c.className='controls';[['later','稍后看'],['read','已读'],['save','进 Notion'],['skip','跳过']].forEach(([v,t])=>c.appendChild(btn(t,cur.status===v,()=>setStatus(a,v))));const lab=document.createElement('div');lab.className='feedback-label';lab.textContent='筛选反馈（分别学习主题 / 形式 / 意图）';c.appendChild(lab);[['accurate','👍 选得准'],['more','⭐ 多推类似'],['bad','👎 不值得'],['less','🚫 少推此类']].forEach(([v,t])=>c.appendChild(btn(t,cur.feedback===v,()=>feedback(a,v))));el.appendChild(c);$('articleList').appendChild(el);
  }
}
function render(){renderMetrics();renderCoverage();renderPrefs();sourceOptions();renderArticles();}
async function init(){try{[data,status]=await Promise.all([fetch('data/articles.json',{cache:'no-store'}).then(r=>r.json()),fetch('data/source_status.json',{cache:'no-store'}).then(r=>r.json())]);rebuildPrefs();$('lastUpdated').textContent=data.meta?.generated_at?`最近更新 ${new Date(data.meta.generated_at).toLocaleString('ja-JP')}`:'尚未首次刷新';render();}catch(e){$('coverageWarning').classList.remove('hidden');$('coverageWarning').textContent='无法读取数据文件：'+e.message;}}
['gradeFilter','statusFilter','sourceFilter','personalizedSort'].forEach(id=>$(id).addEventListener('change',renderArticles));
$('resetLearning').addEventListener('click',()=>{if(confirm('确定只清空偏好学习？已读/稍后看/Notion/跳过状态会保留。')){Object.keys(state).forEach(id=>{if(state[id])state[id].feedback=null;});save();rebuildPrefs();render();}});
init();