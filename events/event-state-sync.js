(()=>{
const REPO='syukaisan-lang/weekly-intelligence';
const CLOUD_URL='event-state.enc.json';
const CLOUD_META_URL='event-state.json';
const WEEKLY_CLOUD_URL='../data/weekly-state.enc.json';
const BACKUP_PENDING_KEY='event_radar_backup_pending_v2';
const DIRTY_SINCE_KEY='event_radar_dirty_since_v2';
const MAX_DELTA_ENTRIES=120;
const MAX_ISSUE_URL_LENGTH=7500;
const MOBILE_ISSUE_URL_LENGTH=3000;
let backupInFlight=false;

const INTEREST_TO_CODE={yes:'y',no:'n'},CODE_TO_INTEREST={y:'yes',n:'no'};
const RATING_TO_CODE={great:'g',ok:'o',bad:'b'},CODE_TO_RATING={g:'great',o:'ok',b:'bad'};
const REASON_TO_CODE={content:'c',too_far:'f',too_expensive:'e',timing:'t',too_commercial:'m',similar:'s'};
const CODE_TO_REASON=Object.fromEntries(Object.entries(REASON_TO_CODE).map(([k,v])=>[v,k]));

const api=()=>window.EventRadarState;
function localState(){return api()?.get?.()||{}}
function toast(text){
  let box=document.getElementById('eventCloudToast');
  if(!box){box=document.createElement('div');box.id='eventCloudToast';box.className='event-cloud-toast';document.body.appendChild(box);}
  box.textContent=text;box.classList.add('show');clearTimeout(box._timer);box._timer=setTimeout(()=>box.classList.remove('show'),6500);
}
function setCloudStatus(text){const el=document.getElementById('eventCloudStatus');if(el)el.textContent=text}
function compareCursor(a,b){const at=Number(a?.ts||0),bt=Number(b?.ts||0);if(at!==bt)return at-bt;return String(a?.id||'').localeCompare(String(b?.id||''))}
function meaningfulEntries(){
  const out={};
  for(const [id,v] of Object.entries(localState())){
    if(!v||typeof v!=='object')continue;
    if(!v.interest&&!v.booked&&!v.visited&&!v.visit_rating&&!v.no_reason)continue;
    out[id]={
      interest:v.interest||null,booked:!!v.booked,visited:!!v.visited,visit_rating:v.visit_rating||null,no_reason:v.no_reason||null,
      updated_at:Number(v.updated_at||0),interest_at:Number(v.interest_at||0),booked_at:Number(v.booked_at||0),visited_at:Number(v.visited_at||0),rating_at:Number(v.rating_at||0),no_reason_at:Number(v.no_reason_at||0)
    };
  }
  return out;
}
function latestLocalCursor(){
  let cur={ts:0,id:''};
  for(const [id,v] of Object.entries(meaningfulEntries())){const c={ts:Number(v.updated_at||0),id};if(compareCursor(c,cur)>0)cur=c}
  return cur;
}
function freshUrl(url){return url+(String(url).includes('?')?'&':'?')+'event_state_t='+Date.now()}
async function fetchJson(url,{optional=false}={}){
  const r=await fetch(freshUrl(url),{cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'});
  if(r.status===404&&optional)return null;if(!r.ok)throw new Error('HTTP '+r.status);return r.json();
}
async function fetchCloudEnvelope(){return fetchJson(CLOUD_URL,{optional:true})}
async function fetchCloudMeta(){return (await fetchJson(CLOUD_META_URL,{optional:true}))||{meta:{}}}
function cloudCursor(metaDoc){
  const m=metaDoc?.meta||{};
  if(Number(m.cursor_updated_at||0))return{ts:Number(m.cursor_updated_at),id:String(m.cursor_id||'')};
  return{ts:0,id:''};
}
function cloudLatestMs(metaDoc,baseEnv){const m=metaDoc?.meta||{};return Date.parse(m.latest_at||m.snapshot_at||baseEnv?.created_at||0)||0}
async function refreshCloudStatus(){
  try{
    const [metaDoc,baseEnv]=await Promise.all([fetchCloudMeta(),fetchCloudEnvelope()]);
    const pending=localStorage.getItem(BACKUP_PENDING_KEY),cloudLatest=cloudLatestMs(metaDoc,baseEnv),pendingTs=pending?Date.parse(pending):0;
    if(pending&&cloudLatest>=pendingTs)localStorage.removeItem(BACKUP_PENDING_KEY);
    const dirty=compareCursor(latestLocalCursor(),cloudCursor(metaDoc))>0;
    if(!dirty)localStorage.removeItem(DIRTY_SINCE_KEY);
    if(localStorage.getItem(BACKUP_PENDING_KEY)){setCloudStatus('加密备份已提交 · 等待 GitHub 写入');return}
    if(dirty){setCloudStatus('本机已自动保存 · 有活动反馈待备份');return}
    if(!baseEnv){setCloudStatus('本机自动保存 · 尚无云端备份');return}
    setCloudStatus('云端已备份 '+new Date(cloudLatest||Date.now()).toLocaleString('ja-JP'));
  }catch(_){setCloudStatus('本机已保存 · 云备份状态暂时无法读取')}
}
async function ensureValidatedPassphrase(){
  if(typeof decryptPrivateEnvelopeData!=='function')throw new Error('加密组件未加载');
  let env=await fetchCloudEnvelope();
  if(!env)env=await fetchJson(WEEKLY_CLOUD_URL,{optional:true});
  if(!env)return true;
  let last=null;
  for(let i=0;i<2;i++){
    try{await decryptPrivateEnvelopeData(env,{prompt:true});return true}
    catch(e){last=e;if(String(e?.message||'').toLowerCase().includes('cancel'))throw e;if(i===0&&typeof lockPrivateData==='function')lockPrivateData(false)}
  }
  const err=new Error('备份密码未通过验证');err.cause=last;throw err;
}
function isMobileBackup(){return matchMedia('(max-width:760px),(pointer:coarse)').matches}
function issueUrlLimit(){return isMobileBackup()?MOBILE_ISSUE_URL_LENGTH:MAX_ISSUE_URL_LENGTH}
function openBackupConfirmation(url){
  if(isMobileBackup()){
    sessionStorage.setItem('event_radar_backup_return_v4',location.href);
    location.assign(url);return;
  }
  const w=window.open(url,'eventStateBackupConfirm');if(!w)location.assign(url);
}
function candidates(cursor){
  return Object.entries(meaningfulEntries()).map(([id,v])=>({id,v,c:{ts:Number(v.updated_at||0),id}}))
    .filter(x=>compareCursor(x.c,cursor)>0).sort((a,b)=>compareCursor(a.c,b.c));
}
function compactRows(items){
  return items.map(({id,v})=>[
    id,INTEREST_TO_CODE[v.interest]||'',v.booked?1:0,v.visited?1:0,RATING_TO_CODE[v.visit_rating]||'',REASON_TO_CODE[v.no_reason]||'',
    Number(v.updated_at||0),Number(v.interest_at||0),Number(v.booked_at||0),Number(v.visited_at||0),Number(v.rating_at||0),Number(v.no_reason_at||0)
  ]);
}
function decodeRows(rows){
  const out={};
  for(const row of rows||[]){
    if(!Array.isArray(row)||!row[0])continue;
    const [id,i,b,v,r,n,u,ia,ba,va,ra,na]=row;
    out[id]={interest:CODE_TO_INTEREST[i]||null,booked:!!b,visited:!!v,visit_rating:CODE_TO_RATING[r]||null,no_reason:CODE_TO_REASON[n]||null,
      updated_at:Number(u||0),interest_at:Number(ia||0),booked_at:Number(ba||0),visited_at:Number(va||0),rating_at:Number(ra||0),no_reason_at:Number(na||0)};
  }
  return out;
}
async function buildIssue(metaDoc,baseEnv,items){
  let count=Math.min(MAX_DELTA_ENTRIES,items.length);
  while(count>=1){
    const batch=items.slice(0,count),rows=compactRows(batch),through=batch[batch.length-1].c;
    const isBase=!baseEnv;
    const payload={schema:3,kind:isBase?'event-feedback-state':'event-feedback-delta',created_at:new Date().toISOString(),rows};
    const env=await encryptPrivatePayload(payload,{kind:isBase?'event-state':'event-state-delta',compress:true});
    env.cursor_updated_at=through.ts;env.cursor_id=through.id;env.entry_count=rows.length;env.backup_schema=3;
    if(!isBase)env.base_snapshot_at=metaDoc?.meta?.snapshot_at||null;
    const encoded=btoa(JSON.stringify(env));
    const title='[EVENT-STATE] '+new Date().toISOString().slice(0,19).replace('T',' ');
    const body='EVENT_STATE_ENVELOPE_B64: '+encoded+'\n\nTokyo Event Radar 加密'+(isBase?'基线':'增量')+'备份。内容已自动填好，只需点击 Submit new issue。';
    const url='https://github.com/'+REPO+'/issues/new?title='+encodeURIComponent(title)+'&body='+encodeURIComponent(body);
    const limit=issueUrlLimit();
    if(url.length<=limit)return{url,env,count,total:items.length,isBase};
    if(count===1)throw new Error('单条活动反馈异常过大，无法生成 GitHub 确认页');
    const ratio=limit/url.length;count=Math.max(1,Math.min(count-1,Math.floor(count*ratio*.90)));
  }
  throw new Error('无法生成活动备份');
}
async function backup(){
  if(backupInFlight){toast('备份正在准备中，请不要重复点击。');return}
  backupInFlight=true;
  const b=document.getElementById('backupEventStateBtn'),normal=b?.textContent||'备份云端';
  if(b){b.disabled=true;b.textContent='检查备份…'}setCloudStatus('正在检查新的活动反馈…');
  try{
    await ensureValidatedPassphrase();
    const [metaDoc,baseEnv]=await Promise.all([fetchCloudMeta(),fetchCloudEnvelope()]);
    const items=candidates(cloudCursor(metaDoc));
    if(!items.length){
      localStorage.removeItem(DIRTY_SINCE_KEY);setCloudStatus('云端已是最新 · 无需重复备份');
      if(b){b.textContent='已备份 ✓';setTimeout(()=>{if(!backupInFlight&&b.textContent==='已备份 ✓')b.textContent=normal},2400)}
      toast('活动反馈已经是最新，无需重复备份。');return;
    }
    if(b)b.textContent='打开确认页…';
    const built=await buildIssue(metaDoc,baseEnv,items);
    localStorage.setItem(BACKUP_PENDING_KEY,built.env.created_at||new Date().toISOString());
    setCloudStatus('备份请求待确认');
    const remain=built.total-built.count;
    toast(remain>0?'本次先备份 '+built.count+' 条；提交后返回本站，再点一次可继续其余 '+remain+' 条。':'已准备 '+built.count+' 条加密'+(built.isBase?'基线':'增量')+'；GitHub 页面直接点 Submit new issue。');
    openBackupConfirmation(built.url);
  }catch(e){
    const raw=String(e?.message||e||'');
    setCloudStatus('本机已保存 · 云备份未完成');
    toast(raw.toLowerCase().includes('cancel')?'已取消云备份；活动反馈仍保存在本机。':'备份未完成：'+raw);
  }finally{backupInFlight=false;if(b){b.disabled=false;if(b.textContent!=='已备份 ✓')b.textContent=normal}}
}
async function fetchDeltaEnvelopes(metaDoc){
  const ds=Array.isArray(metaDoc?.meta?.deltas)?metaDoc.meta.deltas:[];
  const rs=await Promise.all(ds.map(async d=>{const p=typeof d==='string'?d:d?.path;if(!p)return null;try{return await fetchJson('../'+p,{optional:true})}catch(_){return null}}));
  return rs.filter(Boolean);
}
function mergeRemote(target,incoming){
  for(const [id,rv] of Object.entries(incoming||{})){
    if(!rv||typeof rv!=='object')continue;const rt=Number(rv.updated_at||0),lt=Number(target[id]?.updated_at||0);
    if(!target[id]||rt>lt)target[id]={...rv,updated_at:rt};
  }
}
async function restore(){
  try{
    const [baseEnv,metaDoc]=await Promise.all([fetchCloudEnvelope(),fetchCloudMeta()]);
    if(!baseEnv){toast('目前还没有活动云端备份。');return}
    const remote={},basePayload=await decryptPrivateEnvelopeData(baseEnv,{prompt:true});
    if(basePayload?.rows)mergeRemote(remote,decodeRows(basePayload.rows));
    else if(basePayload?.state)mergeRemote(remote,basePayload.state);
    const deltas=await fetchDeltaEnvelopes(metaDoc);
    for(const env of deltas){const p=await decryptPrivateEnvelopeData(env,{prompt:true});if(p?.rows)mergeRemote(remote,decodeRows(p.rows));else if(p?.state)mergeRemote(remote,p.state)}
    const local=localState(),merged={...remote};let remoteWins=0,localWins=0;
    for(const [id,v] of Object.entries(local)){const lt=Number(v?.updated_at||0),rt=Number(merged[id]?.updated_at||0);if(!merged[id]||lt>rt){merged[id]=v;localWins++}else remoteWins++}
    api()?.setAll?.(merged);localStorage.removeItem(BACKUP_PENDING_KEY);await refreshCloudStatus();
    toast('已恢复活动云端反馈：云端 '+remoteWins+' 条，本机较新 '+localWins+' 条保留。');
  }catch(e){toast('恢复失败：密码不正确或备份无法读取。')}
}
function stampDirty(){
  if(!localStorage.getItem(DIRTY_SINCE_KEY))localStorage.setItem(DIRTY_SINCE_KEY,String(Date.now()));
  setCloudStatus('本机已自动保存 · 有活动反馈待云备份');
}
function mount(){
  const top=document.querySelector('.top .actions');if(!top)return;
  let b=document.getElementById('backupEventStateBtn');
  if(!b){b=document.createElement('button');b.id='backupEventStateBtn';b.type='button';b.textContent='备份云端';top.prepend(b)}
  let r=document.getElementById('restoreEventStateBtn');
  if(!r){r=document.createElement('button');r.id='restoreEventStateBtn';r.type='button';r.textContent='恢复云端';b.insertAdjacentElement('afterend',r)}
  let s=document.getElementById('eventCloudStatus');
  if(!s){s=document.createElement('span');s.id='eventCloudStatus';s.className='event-cloud-status';top.appendChild(s)}
  b.onclick=backup;r.onclick=restore;
  const hint=document.getElementById('eventCloudHint');if(hint)hint.textContent=isMobileBackup()?'备份方式已与 Weekly 一致：加密增量会在当前页打开 GitHub，直接提交即可。':'备份方式与 Weekly 一致：加密增量会在 GitHub 确认页自动填好。';
  refreshCloudStatus();
}
document.addEventListener('click',e=>{if(e.target?.closest?.('[data-act],[data-rate]')){stampDirty();setTimeout(refreshCloudStatus,120)}},true);
document.getElementById('reasonForm')?.addEventListener('submit',()=>{stampDirty();setTimeout(refreshCloudStatus,120)});
window.addEventListener('focus',refreshCloudStatus);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCloudStatus()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
window.EventRadarCloud={backup,restore,refreshCloudStatus,decodeRows};
})();