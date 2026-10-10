(()=>{
const ENDPOINT='https://cjcnjcblipqsyzxvlbus.supabase.co/functions/v1/event-sync';
const KEY_STORE='event_radar_sync_key_v1';
let syncing=false,timer=null,lastPull={},controller=null,contextEpoch=0,retryCurrent=false;
const profile=()=>api()?.getProfile?.()||'default';
const version=()=>api()?.getProfileVersion?.()||0;
const context=()=>({profile:profile(),version:version(),key:getKey(),epoch:contextEpoch});
const current=c=>c.profile===profile()&&c.version===version()&&c.key===getKey()&&c.epoch===contextEpoch;

const api=()=>window.EventRadarState;
function toast(t){let x=document.getElementById('eventSyncToast');if(!x){x=document.createElement('div');x.id='eventSyncToast';x.className='event-cloud-toast';document.body.appendChild(x)}x.textContent=t;x.classList.add('show');clearTimeout(x._tm);x._tm=setTimeout(()=>x.classList.remove('show'),4500)}
function setStatus(t){const x=document.getElementById('eventAutoSyncStatus');if(x)x.textContent=t}
function getKey(){return localStorage.getItem(KEY_STORE)||''}
function latestTs(s){return Object.values(s||{}).reduce((m,v)=>Math.max(m,Number(v?.updated_at||0)),0)}
function merge(a,b){const out={...(a||{})};for(const [id,v] of Object.entries(b||{})){if(!v||typeof v!=='object')continue;const at=Number(out[id]?.updated_at||0),bt=Number(v.updated_at||0);if(!out[id]||bt>at)out[id]=v}return out}
async function call(method,state,c,signal){
  if(!c.key)throw new Error('missing_key');
  const r=await fetch(ENDPOINT+'?profile_id='+encodeURIComponent(c.profile),{method,headers:{'content-type':'application/json','x-sync-key':c.key},body:method==='POST'?JSON.stringify({state}):undefined,cache:'no-store',referrerPolicy:'no-referrer',signal});
  if(r.status===401)throw new Error('bad_key');
  if(!r.ok)throw new Error('http_'+r.status);
  const data=await r.json();if(data.profile_id!==c.profile)throw new Error('profile_mismatch');return data;
}
async function pull({silent=false}={}){
  if(syncing){retryCurrent=true;return}
  if(!getKey()||!api())return;
  const c=context();syncing=true;controller=new AbortController();const signal=controller.signal;
  if(!silent)setStatus('自动同步 · 正在同步…');
  try{
    const response=await call('GET',undefined,c,signal);
    if(!current(c))return;
    const local=api().get(),remote=response.state||{},merged=merge(remote,local);
    if(JSON.stringify(merged)!==JSON.stringify(local))api().setAll(merged,c.profile,c.version);
    if(!current(c))return;
    if(JSON.stringify(merged)!==JSON.stringify(remote))await call('POST',merged,c,signal);
    if(!current(c))return;
    lastPull[c.profile]=Date.now();setStatus('自动同步 · '+(c.profile==='default'?'用户1':'用户2')+'已同步');
  }catch(e){
    if(!current(c)||e?.name==='AbortError')return;
    const m=String(e?.message||e);
    if(m==='bad_key')setStatus('自动同步 · 同步码不正确');
    else if(m==='profile_mismatch')setStatus('用户校验失败 · 已停止同步，本机记录保留');
    else if(navigator.onLine===false)setStatus('离线 · 已保存在本机');
    else setStatus('自动同步 · 暂时失败，本机已保存');
    if(!silent&&m==='bad_key')toast('同步码不正确，请重新设置。');
  }finally{
    syncing=false;controller=null;
    if(retryCurrent){retryCurrent=false;clearTimeout(timer);timer=setTimeout(()=>pull({silent:true}),0)}
  }
}
function pushSoon(e){
  if(e?.detail?.reason==='sync')return;
  if(!getKey()){setStatus('未绑定设备 · 设置同步码后可跨设备同步');return}
  setStatus('自动同步 · 待同步');clearTimeout(timer);timer=setTimeout(()=>pull({silent:true}),500);
}
function setKey(){
  const current=getKey();
  const v=prompt('输入家庭活动同步码。同一同步码下有用户1、用户2两套记录；不同设备请选择同一用户后同步。',current);
  if(v===null)return;
  const key=v.trim();contextEpoch++;controller?.abort();
  if(!key){localStorage.removeItem(KEY_STORE);setStatus('未绑定设备 · 设置同步码后可跨设备同步');return}
  localStorage.setItem(KEY_STORE,key);setStatus('自动同步 · 验证同步码…');pull();
}
function mount(){
  const top=document.querySelector('.top .actions');if(!top)return;
  let btn=document.getElementById('eventSyncKeyBtn');
  if(!btn){btn=document.createElement('button');btn.id='eventSyncKeyBtn';btn.type='button';btn.textContent=getKey()?'同步设置':'设置同步码';top.prepend(btn)}
  let st=document.getElementById('eventAutoSyncStatus');
  if(!st){st=document.createElement('span');st.id='eventAutoSyncStatus';st.className='event-cloud-status';top.appendChild(st)}
  btn.onclick=setKey;
  const oldBackup=document.getElementById('backupEventStateBtn'),oldRestore=document.getElementById('restoreEventStateBtn'),oldCloud=document.getElementById('eventCloudStatus'),oldHint=document.getElementById('eventCloudHint');
  [oldBackup,oldRestore,oldCloud,oldHint].forEach(x=>x&&x.remove());
  if(getKey()){setStatus('自动同步 · 检查云端…');pull()}else setStatus('未绑定设备 · 设置同步码后可跨设备同步');
}
window.addEventListener('event-radar-state-change',pushSoon);
window.addEventListener('event-radar-profile-change',()=>{clearTimeout(timer);contextEpoch++;controller?.abort();if(syncing)retryCurrent=true;else pull();if(!getKey())setStatus('未绑定设备 · 设置同步码后可跨设备同步')});
window.addEventListener('focus',()=>{if(getKey()&&Date.now()-(lastPull[profile()]||0)>15000)pull({silent:true})});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&getKey()&&Date.now()-(lastPull[profile()]||0)>15000)pull({silent:true})});
window.addEventListener('online',()=>{if(getKey())pull({silent:true})});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
window.EventRadarAutoSync={pull,setKey};
})();