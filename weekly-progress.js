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
function saveWeeklyView(){try{localStorage.setItem(WEEKLY_VIEW_KEY,JSON.stringify({progress:readingProgress}));}catch(_){}}

visible=function(a){
  if(!_weeklyVisible(a)) return false;
  if(readingProgress==='marked') return isMarked(a);
  return readingProgress==='all'||progressBucketFor(a)===readingProgress;
};

renderMetrics=function(){
  const arts=data.articles||[];const gs=arts.map(a=>grade(score(a)));
  const read=arts.filter(a=>progressBucketFor(a)==='read').length;const marked=arts.filter(isMarked).length;
  const vals=[['新增',status.raw_new_count??arts.length,'8/10 起'],['去重后',status.deduped_count??arts.length,'唯一文章'],['S',gs.filter(x=>x==='S').length,'必看'],['A',gs.filter(x=>x==='A').length,'值得看'],['已标记',marked,'状态 / 筛选反馈'],['已读',read,'已读 + 进 Notion']];
  $('metrics').innerHTML=vals.map(v=>`<div class="metric"><div class="metric-label">${v[0]}</div><div class="metric-value">${v[1]}</div><div class="metric-sub">${v[2]}</div></div>`).join('');updateProgressTabs();
};

function updateProgressTabs(){
  const arts=data.articles||[];const counts={unread:0,later:0,archive:0,marked:0,read:0,skip:0,all:arts.length};
  arts.forEach(a=>{const b=progressBucketFor(a);if(counts[b]!==undefined)counts[b]++;if(isMarked(a))counts.marked++;});
  document.querySelectorAll('[data-progress]').forEach(btn=>{const key=btn.dataset.progress;btn.classList.toggle('active',key===readingProgress);const count=btn.querySelector('.segment-count');if(count)count.textContent=counts[key]??0;});
}
function syncGradeToProgress(key){const gf=$('gradeFilter');if(!gf)return;if(key==='unread'){if(gf.value==='ALL')gf.value='SA';}else{gf.value='ALL';}}
function setProgress(key){readingProgress=key;saveWeeklyView();syncGradeToProgress(key);document.querySelectorAll('[data-progress]').forEach(btn=>btn.classList.toggle('active',btn.dataset.progress===key));renderArticles();}
document.querySelectorAll('[data-progress]').forEach(btn=>btn.addEventListener('click',()=>setProgress(btn.dataset.progress)));
if($('statusFilter')){$('statusFilter').value='all';$('statusFilter').addEventListener('change',()=>{renderArticles();});}
const _setStatus=setStatus;setStatus=function(a,v){_setStatus(a,v);updateProgressTabs();renderMetrics();};

// Keep the existing semantic-learning extensions loaded by the following scripts.
syncGradeToProgress(readingProgress);updateProgressTabs();
window.addEventListener('load',()=>{if(document.querySelector('script[data-weekly-relations-v6]'))return;const s=document.createElement('script');s.src='weekly-relations-v6.js';s.dataset.weeklyRelationsV6='1';document.body.appendChild(s);});
