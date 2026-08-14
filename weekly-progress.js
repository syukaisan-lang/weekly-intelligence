const WEEKLY_VIEW_KEY='weekly_intelligence_view_v2';
let savedWeeklyView={};
try{savedWeeklyView=JSON.parse(localStorage.getItem(WEEKLY_VIEW_KEY)||'{}')||{};}catch(_){savedWeeklyView={};}
let readingProgress=['unread','later','archive','marked','read','skip','all'].includes(savedWeeklyView.progress)?savedWeeklyView.progress:'unread';
const _weeklyVisible=visible;
const _weeklyRenderMetrics=renderMetrics;

function progressBucketFor(a){
  const s=st(a.id).status;
  if(s==='later') return 'later';
  if(s==='new') return 'unread';
  if(s==='read'||s==='save') return 'read';
  if(s==='skip') return 'skip';
  return 'unread';
}
function isMarked(a){return st(a.id).status!=='new'||!!st(a.id).feedback;}
function saveWeeklyView(){
  try{localStorage.setItem(WEEKLY_VIEW_KEY,JSON.stringify({progress:readingProgress}));}catch(_){}
}

visible=function(a){
  if(!_weeklyVisible(a)) return false;
  if(readingProgress==='marked') return isMarked(a);
  return readingProgress==='all'||progressBucketFor(a)===readingProgress;
};

renderMetrics=function(){
  const arts=data.articles||[];
  const gs=arts.map(a=>grade(score(a)));
  const read=arts.filter(a=>progressBucketFor(a)==='read').length;
  const marked=arts.filter(isMarked).length;
  const vals=[
    ['新增',status.raw_new_count??arts.length,'8/10 起'],
    ['去重后',status.deduped_count??arts.length,'唯一文章'],
    ['S',gs.filter(x=>x==='S').length,'必看'],
    ['A',gs.filter(x=>x==='A').length,'值得看'],
    ['已标记',marked,'状态 / 筛选反馈'],
    ['已读',read,'已读 + 进 Notion']
  ];
  $('metrics').innerHTML=vals.map(v=>`<div class="metric"><div class="metric-label">${v[0]}</div><div class="metric-value">${v[1]}</div><div class="metric-sub">${v[2]}</div></div>`).join('');
  updateProgressTabs();
};

function updateProgressTabs(){
  const arts=data.articles||[];
  const counts={unread:0,later:0,archive:0,marked:0,read:0,skip:0,all:arts.length};
  arts.forEach(a=>{
    const bucket=progressBucketFor(a);
    if(Object.prototype.hasOwnProperty.call(counts,bucket))counts[bucket]++;
    if(isMarked(a))counts.marked++;
  });
  document.querySelectorAll('[data-progress]').forEach(btn=>{
    const key=btn.dataset.progress;
    btn.classList.toggle('active',key===readingProgress);
    const count=btn.querySelector('.segment-count');
    if(count) count.textContent=counts[key]??0;
  });
}

function syncGradeToProgress(key){
  const gf=$('gradeFilter');
  if(!gf)return;
  if(key==='unread'){
    if(gf.value==='ALL')gf.value='SA';
  }else{
    gf.value='ALL';
  }
}

function setProgress(key){
  readingProgress=key;
  saveWeeklyView();
  syncGradeToProgress(key);
  document.querySelectorAll('[data-progress]').forEach(btn=>btn.classList.toggle('active',btn.dataset.progress===key));
  renderArticles();
}

document.querySelectorAll('[data-progress]').forEach(btn=>btn.addEventListener('click',()=>setProgress(btn.dataset.progress)));

if($('statusFilter')){
  $('statusFilter').value='all';
  $('statusFilter').addEventListener('change',()=>{renderArticles();});
}

const _setStatus=setStatus;
setStatus=function(a,v){
  _setStatus(a,v);
  updateProgressTabs();
  renderMetrics();
};

// Feedback attribution v7: separate WHAT the article is about from HOW it was studied/presented.
(() => {
  const method=/調査|研究|分析|データ|統計|実証|実験|アンケート|フレームワーク|方法|手法|research|survey/i;
  const subjectRules=[
    ['旅游/观光',/観光|旅行|ツーリズム|旅館|ホテル|宿泊|インバウンド|旅行者/i],
    ['食品/餐饮',/食品|飲食|外食|レストラン|カフェ|菓子|スイーツ|飲料/i],
    ['家电/数码',/家電|スマホ|イヤホン|ヘッドホン|オーディオ|PC|ガジェット/i],
    ['汽车/出行',/自動車|EV|モビリティ|カーシェア|タクシー/i],
    ['住宅/不动产',/住宅|不動産|マンション|戸建|賃貸|住まい/i],
    ['金融/支付',/金融|銀行|証券|保険|投資|決済|キャッシュレス/i],
    ['医疗/健康',/医療|健康|ヘルスケア|病院|介護|高齢者/i],
    ['招聘/职场',/採用|転職|人材|就職|キャリア|働き方|人事/i]
  ];
  const oldTyped=typedFeatures;
  typedFeatures=function(a){
    const f=oldTyped(a),text=textOf(a),extra=subjectRules.filter(([,re])=>re.test(text)).map(([n])=>n);
    f.topics=[...new Set([...(f.topics||[]).filter(x=>!method.test(String(x))),...extra])];
    f.subjects=f.topics;
    return f;
  };
  applyFeedback=function(a,feedback){
    const f=typedFeatures(a),contextHeavy=isContextDominant(f),strong=feedback==='less';
    if(feedback==='accurate'){
      f.topics.forEach(x=>add(prefs.topics,x,.045));f.formats.forEach(x=>add(prefs.formats,x,.02));f.intents.forEach(x=>add(prefs.intents,x,.02));f.signals.forEach(x=>add(prefs.signals,x,.03));
    }else if(feedback==='more'){
      f.topics.forEach(x=>add(prefs.topics,x,.16));f.formats.forEach(x=>add(prefs.formats,x,.06));f.intents.forEach(x=>add(prefs.intents,x,.07));f.signals.forEach(x=>add(prefs.signals,x,.10));
    }else if(feedback==='bad'||feedback==='less'){
      if(contextHeavy){
        f.formats.forEach(x=>add(prefs.formats,x,strong?-.46:-.18));f.intents.forEach(x=>add(prefs.intents,x,strong?-.58:-.24));f.signals.forEach(x=>add(prefs.signals,x,strong?-.34:-.16));
      }else{
        f.topics.forEach(x=>add(prefs.topics,x,strong?-.14:-.06));
      }
    }
  };
})();

// Semantic feedback learning uses article vectors from the same multilingual-e5 family as Work System.
// Negative semantic transfer is gated by content subject, so a rejected tourism survey does not
// become a rejection of surveys about electronics, consumers, AI, or other unrelated subjects.
(() => {
  const baseScore=score;
  const baseRebuildPrefs=rebuildPrefs;
  const baseRenderPrefs=renderPrefs;
  const baseRenderArticles=renderArticles;
  const vectorCache=new Map();
  let samples=[];

  function vectorOf(a){
    const id=String(a?.id||'');
    if(vectorCache.has(id))return vectorCache.get(id);
    const e=a?.semantic_vector;
    if(!e?.q||!Number(e.dim)||!Number(e.scale)){vectorCache.set(id,null);return null;}
    try{
      const raw=atob(e.q),v=new Float32Array(Number(e.dim));
      if(raw.length!==v.length){vectorCache.set(id,null);return null;}
      let norm=0;
      for(let i=0;i<v.length;i++){
        let n=raw.charCodeAt(i);if(n>127)n-=256;
        v[i]=n*Number(e.scale);norm+=v[i]*v[i];
      }
      norm=Math.sqrt(norm)||1;
      for(let i=0;i<v.length;i++)v[i]/=norm;
      vectorCache.set(id,v);return v;
    }catch(_){vectorCache.set(id,null);return null;}
  }
  function dot(a,b){let s=0;for(let i=0;i<Math.min(a.length,b.length);i++)s+=a[i]*b[i];return s;}
  function semanticSubjects(a){
    const f=typedFeatures(a),xs=f.subjects||f.topics||[];
    return new Set(xs.map(x=>String(x||'').trim()).filter(Boolean));
  }
  function subjectAffinity(a,b){
    if(!a.size||!b.size)return .35;
    for(const x of a)if(b.has(x))return 1;
    return .08;
  }
  function semanticWeight(a,fb){
    const contextHeavy=isContextDominant(typedFeatures(a));
    if(fb==='more')return .62;
    if(fb==='accurate')return .18;
    if(fb==='bad')return contextHeavy?-.13:-.38;
    if(fb==='less')return contextHeavy?-.22:-.72;
    return 0;
  }
  function rebuildSemanticSamples(){
    samples=[];
    for(const a of data.articles||[]){
      const fb=st(a.id).feedback,v=fb?vectorOf(a):null,w=fb?semanticWeight(a,fb):0;
      if(v&&w)samples.push({id:String(a.id),v,w,subjects:semanticSubjects(a)});
    }
  }
  function semanticPreferenceDelta(a){
    const v=vectorOf(a);if(!v||!samples.length)return 0;
    const targetSubjects=semanticSubjects(a),pos=[],neg=[];
    for(const s of samples){
      if(s.id===String(a.id))continue;
      const sim=dot(v,s.v);if(sim<.80)continue;
      let affinity=Math.min(1,Math.max(0,(sim-.80)/.17));
      if(s.w<0)affinity*=subjectAffinity(targetSubjects,s.subjects);
      const contribution=s.w*affinity;
      (contribution>=0?pos:neg).push(contribution);
    }
    pos.sort((x,y)=>y-x);neg.sort((x,y)=>x-y);
    const delta=pos.slice(0,3).reduce((s,x)=>s+x,0)+neg.slice(0,3).reduce((s,x)=>s+x,0);
    return Math.max(-.95,Math.min(.72,delta));
  }

  rebuildPrefs=function(){baseRebuildPrefs();rebuildSemanticSamples();};
  score=function(a){return Math.max(0,Math.min(10,baseScore(a)+semanticPreferenceDelta(a)));};
  renderPrefs=function(){
    baseRenderPrefs();
    const root=document.getElementById('learnedPrefs');if(!root)return;
    const positive=samples.filter(x=>x.w>0).length,negative=samples.filter(x=>x.w<0).length;
    if(!positive&&!negative)return;
    const row=document.createElement('div');row.className='pref-row semantic-pref-row';
    row.innerHTML=`<span>语义学习：内容含义</span><span class="weight">+${positive} / -${negative}</span>`;
    root.prepend(row);
    const note=document.createElement('div');note.className='muted small semantic-pref-note';
    note.textContent='负反馈先按内容主题归因；调查/研究方法不会因单篇无关主题被误伤。活动告知、PR等仍主要由形式和意图承担。';
    root.appendChild(note);
  };
  renderArticles=function(){
    baseRenderArticles();
    document.querySelectorAll('.feedback-label').forEach(x=>x.textContent='筛选反馈（内容主题 + 研究/呈现方式 + 意图）');
  };
})();

syncGradeToProgress(readingProgress);
updateProgressTabs();

window.addEventListener('load',()=>{
  if(document.querySelector('script[data-weekly-relations-v6]'))return;
  const s=document.createElement('script');s.src='weekly-relations-v6.js';s.dataset.weeklyRelationsV6='1';document.body.appendChild(s);
});
