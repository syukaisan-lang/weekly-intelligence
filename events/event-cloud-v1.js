(()=>{
const REPO='syukaisan-lang/weekly-intelligence';
const META='event-state.json';
const ENC='event-state.enc.json';
const PENDING='tokyo_event_backup_pending_v1';
let busy=false;

function feedback(){return window.getEventFeedback?window.getEventFeedback():{}}
function latestLocal(){return Math.max(0,...Object.values(feedback()).map(v=>Number(v&&v.updated_at||0)))}
function toast(msg){let e=document.getElementById('eventCloudToast');if(!e){e=document.createElement('div');e.id='eventCloudToast';e.className='event-cloud-toast';document.body.appendChild(e)}e.textContent=msg;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),6500)}
function setStatus(msg){let e=document.getElementById('eventCloudStatus');if(!e){e=document.createElement('div');e.id='eventCloudStatus';e.className='cloud-status';const top=document.querySelector('.top');if(top)top.insertAdjacentElement('afterend',e)}if(e)e.textContent=msg}
async function getJson(path,optional=false){const r=await fetch(path+'?t='+Date.now(),{cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'});if(optional&&r.status===404)return null;if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}
async function refresh(){
  try{
    const m=await getJson(META,true),cloud=Date.parse(m&&m.meta&&m.meta.latest_at||0)||0,p=localStorage.getItem(PENDING),pm=p?Date.parse(p):0;
    if(p&&cloud>=pm)localStorage.removeItem(PENDING);
    if(localStorage.getItem(PENDING)){setStatus('已提交加密备份 · 等待 GitHub 写入');return}
    if(!cloud){setStatus(latestLocal()?'本机已保存 · 尚无云端备份':'尚无反馈 · 云备份未建立');return}
    setStatus(latestLocal()>cloud?'本机已保存 · 有新反馈待云备份':'云备份 '+new Date(cloud).toLocaleString('ja-JP'));
  }catch(_){setStatus('本机已保存 · 云端状态暂时无法读取')}
}
async function validatePassword(){
  const env=await getJson(ENC,true);if(!env)return;
  if(typeof decryptPrivateEnvelopeData!=='function')throw new Error('加密组件未加载');
  await decryptPrivateEnvelopeData(env,{prompt:true});
}
function mobile(){return matchMedia('(max-width:760px),(pointer:coarse)').matches}
function openIssue(url){if(mobile()){location.assign(url);return}const w=window.open(url,'eventStateBackup');if(!w)location.assign(url)}
async function backup(){
  if(busy)return;busy=true;
  const b=document.getElementById('eventCloudBackupBtn'),label=b&&b.textContent;
  if(b){b.disabled=true;b.textContent='准备备份…'}
  try{
    const s=feedback(),ids=Object.keys(s);if(!ids.length){toast('目前没有需要备份的活动反馈。');return}
    if(typeof encryptPrivatePayload!=='function')throw new Error('加密组件未加载');
    await validatePassword();
    const env=await encryptPrivatePayload({schema:2,kind:'event-feedback-state',feedback:s},{kind:'event-state',compress:true});
    env.entry_count=ids.length;
    const encoded=btoa(JSON.stringify(env));
    const title='[EVENT-STATE] '+new Date().toISOString().slice(0,19).replace('T',' ');
    const body='EVENT_STATE_ENVELOPE_B64: '+encoded+'\n\n东京活动雷达反馈的完整加密备份。仓库只保存密文；直接点击 Submit new issue 即可。';
    const url='https://github.com/'+REPO+'/issues/new?title='+encodeURIComponent(title)+'&body='+encodeURIComponent(body);
    if(url.length>(mobile()?6200:9000))throw new Error('反馈数据已超过当前单次备份容量');
    localStorage.setItem(PENDING,env.created_at||new Date().toISOString());
    setStatus('完整加密备份待确认');
    toast('GitHub 页面打开后，直接提交已填好的 Issue 即可。');
    openIssue(url);
  }catch(e){
    const m=String(e&&e.message||e);
    toast(/cancel/i.test(m)?'已取消云备份；本机反馈仍保留。':'云备份未完成：'+m);
  }finally{busy=false;if(b){b.disabled=false;b.textContent=label||'备份云端'}}
}
async function restore(){
  if(busy)return;busy=true;
  const b=document.getElementById('eventCloudRestoreBtn'),label=b&&b.textContent;
  if(b){b.disabled=true;b.textContent='读取云端…'}
  try{
    const env=await getJson(ENC,true);if(!env){toast('目前还没有活动云端备份。');return}
    if(typeof decryptPrivateEnvelopeData!=='function')throw new Error('加密组件未加载');
    const p=await decryptPrivateEnvelopeData(env,{prompt:true}),remote=p&&p.feedback;if(!remote||typeof remote!=='object')throw new Error('备份格式不正确');
    if(!window.mergeEventFeedback)throw new Error('活动反馈组件未加载');
    const result=window.mergeEventFeedback(remote);
    localStorage.removeItem(PENDING);
    toast('已恢复：更新 '+result.applied+' 条，本机较新的 '+result.kept+' 条保留。');
    setTimeout(()=>location.reload(),800);
  }catch(e){
    const m=String(e&&e.message||e);
    toast(/cancel/i.test(m)?'已取消恢复。':'恢复失败：密码不正确或云端备份无法读取。');
  }finally{busy=false;if(b){b.disabled=false;b.textContent=label||'恢复云端'}}
}
function install(){const b=document.getElementById('eventCloudBackupBtn')||document.getElementById('exportBtn'),r=document.getElementById('eventCloudRestoreBtn')||document.getElementById('importBtn');if(!b||!r)return false;b.onclick=backup;r.onclick=e=>{e.preventDefault();e.stopPropagation();restore();};refresh();window.addEventListener('pageshow',()=>setTimeout(refresh,150));return true}
if(!install())document.addEventListener('DOMContentLoaded',install,{once:true});
window.eventCloudV1={backup,restore,refresh};
})();