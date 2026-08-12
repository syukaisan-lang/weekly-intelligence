let readingProgress='unread';
const _weeklyVisible=visible;
const _weeklyRenderMetrics=renderMetrics;

function progressBucketFor(a){
  const s=st(a.id).status;
  if(s==='new'||s==='later') return 'unread';
  if(s==='read'||s==='save') return 'read';
  if(s==='skip') return 'skip';
  return 'unread';
}

visible=function(a){
  if(!_weeklyVisible(a)) return false;
  return readingProgress==='all'||progressBucketFor(a)===readingProgress;
};

renderMetrics=function(){
  const arts=data.articles||[];
  const gs=arts.map(a=>grade(score(a)));
  const unread=arts.filter(a=>progressBucketFor(a)==='unread').length;
  const read=arts.filter(a=>progressBucketFor(a)==='read').length;
  const vals=[
    ['新增',status.raw_new_count??arts.length,'8/10 起'],
    ['去重后',status.deduped_count??arts.length,'唯一文章'],
    ['S',gs.filter(x=>x==='S').length,'必看'],
    ['A',gs.filter(x=>x==='A').length,'值得看'],
    ['未读',unread,'未处理 + 稍后看'],
    ['已读',read,'已读 + 进 Notion']
  ];
  $('metrics').innerHTML=vals.map(v=>`<div class="metric"><div class="metric-label">${v[0]}</div><div class="metric-value">${v[1]}</div><div class="metric-sub">${v[2]}</div></div>`).join('');
  updateProgressTabs();
};

function updateProgressTabs(){
  const arts=data.articles||[];
  const counts={unread:0,read:0,skip:0,all:arts.length};
  arts.forEach(a=>counts[progressBucketFor(a)]++);
  document.querySelectorAll('[data-progress]').forEach(btn=>{
    const key=btn.dataset.progress;
    btn.classList.toggle('active',key===readingProgress);
    const count=btn.querySelector('.segment-count');
    if(count) count.textContent=counts[key]??0;
  });
}

function setProgress(key){
  readingProgress=key;
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

updateProgressTabs();
