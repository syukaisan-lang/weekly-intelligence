(()=>{
function addAudit(){
  if(document.getElementById('eventAudit'))return;
  const anchor=document.getElementById('learning');if(!anchor)return;
  const box=document.createElement('div');box.id='eventAudit';box.className='event-audit';
  box.innerHTML='<span>搜索：近期7天</span><span>票务观察：未来12个月</span><span>发布前需官方核验</span><span id="eventDataFreshness">读取更新时间…</span>';
  anchor.parentNode.insertBefore(box,anchor);
  fetch('data.json?audit='+Date.now(),{cache:'no-store'}).then(r=>r.json()).then(j=>{
    const el=document.getElementById('eventDataFreshness');if(!el)return;
    el.textContent='数据更新：'+(j.updated_at||'未知');
    if(j.meta&&j.meta.publish_rule==='official_verification_required'){el.classList.add('event-verified');el.textContent+=' · 官方核验规则启用'}
  }).catch(()=>{const el=document.getElementById('eventDataFreshness');if(el)el.textContent='更新时间读取失败'});
}
function addBackTop(){
  if(document.getElementById('backTop'))return;
  const b=document.createElement('button');b.id='backTop';b.type='button';b.setAttribute('aria-label','返回顶部');b.textContent='↑';
  b.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});document.body.appendChild(b);
  const sync=()=>b.classList.toggle('show',window.scrollY>650);window.addEventListener('scroll',sync,{passive:true});sync();
}
function decorate(){
  document.querySelectorAll('.row button').forEach(b=>b.setAttribute('aria-pressed',b.classList.contains('active')?'true':'false'));
  document.querySelectorAll('.card').forEach(card=>{
    const pills=[...card.querySelectorAll('.pill')];const sale=pills.find(x=>/售票中|抽选中|截止/.test(x.textContent||''));
    if(sale){const txt=sale.textContent||'';if(/截止|抽选中/.test(txt))sale.classList.add('event-urgency-high');const meta=card.querySelector('.meta:nth-of-type(2)')||sale.parentElement;if(meta&&!meta.querySelector('.decision-urgency')){const x=document.createElement('span');x.className='pill decision-urgency';x.textContent=/截止|抽选中/.test(txt)?'决策紧迫：高':card.textContent.includes('未来关注')?'决策紧迫：中':'决策紧迫：低';if(/高/.test(x.textContent))x.classList.add('event-urgency-high');meta.appendChild(x)}}
  });
}
function boot(){
  addAudit();addBackTop();decorate();
  const list=document.getElementById('list');if(list)new MutationObserver(decorate).observe(list,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();