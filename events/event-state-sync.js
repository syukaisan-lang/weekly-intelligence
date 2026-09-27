(()=>{
const REPO='syukaisan-lang/weekly-intelligence';
const ENV_URL='event-state.enc.json';
const META_URL='event-state.json';
const WEEKLY_ENV='../data/weekly-state.enc.json';
const PENDING='event_radar_backup_pending_v1';
const PENDING_PAYLOAD='event_radar_backup_payload_v1';
const PENDING_TITLE='event_radar_backup_title_v1';
let busy=false;

const api=()=>window.EventRadarState;
const isMobile=()=>matchMedia('(max-width:760px),(pointer:coarse)').matches;
function fresh(u){return u+(u.includes('?')?'&':'?')+'t='+Date.now()}
async function getJson(u,optional=false){const r=await fetch(fresh(u),{cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'});if(optional&&r.status===404)return null;if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}
function localState(){return api()?.get?.()||{}}
function latestTs(s){return Object.values(s||{}).reduce((m,v)=>Math.max(m,Number(v?.updated_at||0)),0)}
function toast(t){let x=document.getElementById('eventCloudToast');if(!x){x=document.createElement('div');x.id='eventCloudToast';x.className='event-cloud-toast';document.body.appendChild(x)}x.textContent=t;x.classList.add('show');clearTimeout(x._tm);x._tm=setTimeout(()=>x.classList.remove('show'),5000)}
function status(t){const x=document.getElementById('eventCloudStatus');if(x)x.textContent=t}

async function validatePassword(){
  if(typeof decryptPrivateEnvelopeData!=='function'||typeof encryptPrivatePayload!=='function')throw new Error('加密组件未加载');
  const own=await getJson(ENV_URL,true);
  if(own){await decryptPrivateEnvelopeData(own,{prompt:true});return}
  const weekly=await getJson(WEEKLY_ENV,true);
  if(weekly){await decryptPrivateEnvelopeData(weekly,{prompt:true});return}
}
async function refresh(){
  try{
    const [m,e]=await Promise.all([getJson(META_URL,true),getJson(ENV_URL,true)]);
    const remote=Number(m?.meta?.cursor_updated_at||0);
    const cloudAt=Date.parse(m?.meta?.latest_at||m?.meta?.snapshot_at||0)||0;
    const local=latestTs(localState());
    const pending=localStorage.getItem(PENDING);
    if(pending&&cloudAt>=Date.parse(pending)){
      localStorage.removeItem(PENDING);localStorage.removeItem(PENDING_PAYLOAD);localStorage.removeItem(PENDING_TITLE);
    }
    if(localStorage.getItem(PENDING_PAYLOAD)){status('有一份加密备份待提交 · 点“备份云端”继续');return}
    if(localStorage.getItem(PENDING)){status('加密备份已提交 · 等待 GitHub 写入');return}
    if(local>remote){status('本机已保存 · 有活动反馈待云备份');return}
    if(!e){status('本机已保存 · 尚无活动云备份');return}
    status('活动云备份 '+new Date(cloudAt||Date.now()).toLocaleString('ja-JP'));
  }catch(_){status('本机已保存 · 云端状态暂时无法读取')}
}
function openIssue(url){
  if(isMobile()){
    sessionStorage.setItem('event_radar_backup_return_v2',location.href);
    const u=new URL(url);
    const relative=u.pathname+u.search;
    location.assign('https://github.com/login?return_to='+encodeURIComponent(relative));
    return;
  }
  const w=window.open(url,'eventStateBackup');if(!w)location.assign(url);
}
function pendingIssueUrl(){
  const payload=localStorage.getItem(PENDING_PAYLOAD),title=localStorage.getItem(PENDING_TITLE);
  if(!payload||!title)return '';
  const body='EVENT_STATE_ENVELOPE_B64: '+payload+'\n\nTokyo Event Radar 加密反馈备份。内容已填好，只需点击 Submit new issue。';
  return 'https://github.com/'+REPO+'/issues/new?title='+encodeURIComponent(title)+'&body='+encodeURIComponent(body);
}
async function backup(){
  if(busy)return;busy=true;
  const b=document.getElementById('backupEventStateBtn'),old=b?.textContent||'备份云端';
  if(b){b.disabled=true;b.textContent='准备加密…'}status('正在检查活动反馈…');
  try{
    const retryUrl=pendingIssueUrl();
    if(retryUrl){
      status('重新打开 GitHub 提交页');
      toast('继续上次的加密备份。若刚完成 GitHub 登录，这次会直接带上完整内容。');
      openIssue(retryUrl);return;
    }
    const s=localState(),count=Object.keys(s).length;
    if(!count){status('没有活动反馈需要备份');toast('还没有活动反馈。');return}
    await validatePassword();
    const created=new Date().toISOString();
    const payload={schema:2,kind:'event-feedback-state',created_at:created,state:s};
    const env=await encryptPrivatePayload(payload,{kind:'event-state',compress:true});
    env.entry_count=count;env.cursor_updated_at=latestTs(s);env.backup_schema=2;
    const encoded=btoa(JSON.stringify(env));
    const title='[EVENT-STATE] '+created.slice(0,19).replace('T',' ');
    const body='EVENT_STATE_ENVELOPE_B64: '+encoded+'\n\nTokyo Event Radar 加密反馈备份。内容已填好，只需点击 Submit new issue。';
    const url='https://github.com/'+REPO+'/issues/new?title='+encodeURIComponent(title)+'&body='+encodeURIComponent(body);
    if(isMobile()&&url.length>6500)throw new Error('反馈数据过大，请先用电脑备份');
    localStorage.setItem(PENDING,created);
    localStorage.setItem(PENDING_PAYLOAD,encoded);
    localStorage.setItem(PENDING_TITLE,title);
    status('备份请求待确认');
    toast(isMobile()?'会先经过 GitHub 登录页；登录后直接提交已填好的 Issue。若内容没带上，返回本站再点一次“备份云端”。':'GitHub 页面打开后直接点 Submit new issue。');
    openIssue(url);
  }catch(e){status('本机已保存 · 云备份未完成');toast('备份未完成：'+(e?.message||e))}
  finally{busy=false;if(b){b.disabled=false;b.textContent=old}}
}
async function restore(){
  if(busy)return;busy=true;
  const b=document.getElementById('restoreEventStateBtn');if(b)b.disabled=true;
  try{
    const env=await getJson(ENV_URL,true);if(!env){toast('目前还没有活动云备份。');return}
    const p=await decryptPrivateEnvelopeData(env,{prompt:true});
    if(!p?.state||typeof p.state!=='object')throw new Error('云端备份格式不正确');
    const local=localState(),merged={...p.state};let remoteWins=0,localWins=0;
    for(const [id,v] of Object.entries(local)){
      const lt=Number(v?.updated_at||0),rt=Number(merged[id]?.updated_at||0);
      if(!merged[id]||lt>rt){merged[id]=v;localWins++}else remoteWins++;
    }
    api()?.setAll?.(merged);
    localStorage.removeItem(PENDING);await refresh();
    toast('已恢复活动云端反馈：云端 '+remoteWins+' 条，本机较新 '+localWins+' 条保留。');
  }catch(e){toast('恢复失败：密码不正确或备份无法读取。')}
  finally{busy=false;if(b)b.disabled=false}
}
function mount(){
  const top=document.querySelector('.top .actions');if(!top||document.getElementById('backupEventStateBtn'))return;
  const backupBtn=document.createElement('button');backupBtn.id='backupEventStateBtn';backupBtn.type='button';backupBtn.textContent='备份云端';backupBtn.onclick=backup;
  const restoreBtn=document.createElement('button');restoreBtn.id='restoreEventStateBtn';restoreBtn.type='button';restoreBtn.textContent='恢复云端';restoreBtn.onclick=restore;
  const st=document.createElement('span');st.id='eventCloudStatus';st.className='event-cloud-status';st.textContent='检查云备份…';
  top.prepend(restoreBtn);top.prepend(backupBtn);top.appendChild(st);
  const ex=document.getElementById('exportBtn'),im=document.getElementById('importBtn');if(ex)ex.textContent='本地导出';if(im)im.textContent='本地导入';
  refresh();
}
document.addEventListener('click',e=>{if(e.target?.closest?.('[data-act],[data-rate]'))setTimeout(refresh,120)},true);
document.getElementById('reasonForm')?.addEventListener('submit',()=>setTimeout(refresh,120));
window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
window.EventRadarCloud={backup,restore,refresh};
})();