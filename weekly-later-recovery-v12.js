// Weekly v12: Later is an explicit human bookmark, independent from automatic S/A/B attention.
// Recover historical Later bookmarks that an earlier one-click-feedback implementation accidentally converted to Read.
(() => {
  const META_URL='data/weekly-state.json';
  const BASE_URL='data/weekly-state.enc.json';
  const TRUSTED_STATUS_ORIGIN='human_v10';
  const RECOVERY_KEY='weekly_later_recovery_v12';
  const CODE_TO_STATUS={n:'new',l:'later',r:'read',s:'save',k:'skip'};
  const CODE_TO_FEEDBACK={a:'accurate',m:'more',b:'bad',l:'less'};
  const CODE_TO_ACTION={f:'feedback',s:'status'};
  let recovering=false;

  function toastV12(text){
    let box=document.getElementById('weeklyStateToast');
    if(!box){box=document.createElement('div');box.id='weeklyStateToast';box.className='save-toast';document.body.appendChild(box);}
    box.textContent=text;box.classList.add('show');clearTimeout(box._timer);box._timer=setTimeout(()=>box.classList.remove('show'),6000);
  }

  async function fetchJson(url,{optional=false}={}){
    const r=await fetch(url,{cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'});
    if(r.status===404&&optional)return null;
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  function decodeRows(rows){
    const out={};
    for(const row of rows||[]){
      if(!Array.isArray(row)||!row[0])continue;
      const [id,s,f,u,o,a,su]=row;
      const item={status:CODE_TO_STATUS[s]||s||'new',feedback:f?(CODE_TO_FEEDBACK[f]||f):null,updated_at:Number(u||0)};
      if(o)item.status_origin=o==='h'?TRUSTED_STATUS_ORIGIN:o;
      if(a)item.status_action=CODE_TO_ACTION[a]||a;
      if(su)item.status_updated_at=Number(su);
      out[id]=item;
    }
    return out;
  }

  function preserveLater(prev,next){
    if(!prev)return {...next};
    const pt=Number(prev.updated_at||0),nt=Number(next.updated_at||0);
    if(nt&&pt&&nt<pt)return {...prev};
    // Historical bug: feedback converted an explicit Later bookmark into Read.
    // Preserve the newer feedback, but restore the user's explicit Later status.
    if(prev.status==='later'&&next.status==='read'&&next.status_action==='feedback'){
      return {
        ...prev,
        ...next,
        status:'later',
        status_origin:prev.status_origin||TRUSTED_STATUS_ORIGIN,
        status_action:prev.status_action||'status',
        status_updated_at:Number(prev.status_updated_at||prev.updated_at||0),
        updated_at:Math.max(pt,nt)
      };
    }
    return nt>=pt?{...prev,...next}:{...prev};
  }

  function mergeTimeline(target,incoming){
    for(const [id,item] of Object.entries(incoming||{})){
      if(!item||typeof item!=='object')continue;
      target[id]=preserveLater(target[id],item);
    }
  }

  async function recoverLater({prompt=true,force=false}={}){
    if(recovering)return 0;
    recovering=true;
    try{
      const metaDoc=await fetchJson(META_URL,{optional:true})||{meta:{}};
      const meta=metaDoc.meta||{};
      const version=String(meta.latest_at||meta.snapshot_at||'none');
      if(!force&&version!=='none'&&localStorage.getItem(RECOVERY_KEY)===version)return 0;
      const baseEnv=await fetchJson(BASE_URL,{optional:true});
      if(!baseEnv){if(version!=='none')localStorage.setItem(RECOVERY_KEY,version);return 0;}
      if(typeof decryptPrivateEnvelopeData!=='function')throw new Error('加密恢复组件未加载');

      const remote={};
      const basePayload=await decryptPrivateEnvelopeData(baseEnv,{prompt});
      if(basePayload?.state&&typeof basePayload.state==='object')mergeTimeline(remote,basePayload.state);

      const deltas=Array.isArray(meta.deltas)?[...meta.deltas]:[];
      deltas.sort((a,b)=>String(a?.created_at||'').localeCompare(String(b?.created_at||'')));
      for(const d of deltas){
        const path=typeof d==='string'?d:d?.path;
        if(!path)continue;
        const env=await fetchJson(path,{optional:true});if(!env)continue;
        const payload=await decryptPrivateEnvelopeData(env,{prompt});
        if(payload?.rows)mergeTimeline(remote,decodeRows(payload.rows));
        else if(payload?.state&&typeof payload.state==='object')mergeTimeline(remote,payload.state);
      }

      let restored=0;
      for(const [id,r] of Object.entries(remote)){
        if(r?.status!=='later')continue;
        const local=state?.[id];
        // Never override a deliberate explicit read/skip/save. Only repair absent/new state or
        // the known buggy transition where feedback itself replaced Later with Read.
        const recoverable=!local||local.status==='new'||(local.status==='read'&&local.status_action==='feedback');
        if(!recoverable)continue;
        const updated=Math.max(Number(local?.updated_at||0),Number(r.updated_at||0));
        state[id]={...local,...r,status:'later',status_origin:r.status_origin||TRUSTED_STATUS_ORIGIN,status_action:r.status_action||'status',status_updated_at:Number(r.status_updated_at||r.updated_at||0),updated_at:updated};
        restored++;
      }
      if(restored&&typeof save==='function')save();
      if(version!=='none')localStorage.setItem(RECOVERY_KEY,version);
      if(restored){
        if(typeof rebuildPrefs==='function')rebuildPrefs();
        if(typeof render==='function')render();else if(typeof renderArticles==='function')renderArticles();
        if(typeof updateProgressTabs==='function')updateProgressTabs();
      }
      return restored;
    }finally{recovering=false;}
  }

  // Future invariant: a feedback click may mark a NEW item processed, but must never destroy Later.
  if(typeof feedback==='function'){
    const previousFeedback=feedback;
    window.feedback=feedback=function(a,v){
      let before=null;
      try{before={...(state?.[a.id]||st(a.id)||{})};}catch(_){before={...(state?.[a.id]||{})};}
      const wasLater=before.status==='later';
      previousFeedback(a,v);
      if(wasLater){
        const cur=state?.[a.id]||{};
        cur.status='later';
        cur.status_origin=before.status_origin||TRUSTED_STATUS_ORIGIN;
        cur.status_action=before.status_action||'status';
        cur.status_updated_at=Number(before.status_updated_at||before.updated_at||Date.now());
        cur.updated_at=Date.now();
        state[a.id]=cur;
        if(typeof save==='function')save();
        if(typeof render==='function')render();else if(typeof renderArticles==='function')renderArticles();
      }
      if(typeof updateProgressTabs==='function')updateProgressTabs();
    };
  }

  // Later is its own queue. It is not part of automatic "待处理" and is not grade-limited.
  const audit=window.weeklySourceAuditV11||window.weeklySourceAuditV10;
  if(audit&&typeof audit.isRecommendedUnread==='function'&&!audit.__laterSeparatedV12){
    const previousUnread=audit.isRecommendedUnread.bind(audit);
    audit.isRecommendedUnread=function(a){
      try{if(st(a.id).status==='later')return false;}catch(_){}
      return previousUnread(a);
    };
    audit.__laterSeparatedV12=true;
  }

  if(typeof setProgress==='function'){
    const previousSetProgress=setProgress;
    window.setProgress=setProgress=function(key){
      if(key==='later'){
        const gf=document.getElementById('gradeFilter');if(gf)gf.value='ALL';
        const sf=document.getElementById('statusFilter');if(sf)sf.value='all';
      }
      previousSetProgress(key);
    };
  }

  if(typeof updateProgressTabs==='function'){
    const previousUpdateProgressTabs=updateProgressTabs;
    updateProgressTabs=function(){
      previousUpdateProgressTabs();
      const arts=Array.isArray(data?.articles)?data.articles:[];
      const later=arts.filter(a=>{try{return st(a.id).status==='later';}catch(_){return state?.[a.id]?.status==='later';}}).length;
      const laterCount=document.querySelector('[data-progress="later"] .segment-count');
      if(laterCount)laterCount.textContent=String(later);
    };
  }

  function bindLaterRecovery(){
    const btn=document.querySelector('[data-progress="later"]');if(!btn||btn.dataset.recoveryV12)return;
    btn.dataset.recoveryV12='1';
    btn.addEventListener('click',()=>setTimeout(async()=>{
      try{
        const restored=await recoverLater({prompt:true});
        if(restored)toastV12(`已恢复 ${restored} 条之前的“稍后看”记录。`);
      }catch(e){
        if(String(e?.message||'').includes('Unlock cancelled'))return;
        toastV12('稍后看历史恢复失败：'+(e?.message||'未知错误'));
      }
    },0));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{bindLaterRecovery();if(typeof updateProgressTabs==='function')updateProgressTabs();});
  else{bindLaterRecovery();if(typeof updateProgressTabs==='function')updateProgressTabs();}

  window.recoverWeeklyLater=()=>recoverLater({prompt:true,force:true});
})();
