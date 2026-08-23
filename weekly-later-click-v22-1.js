// v22.1: make the Later tab use one recovery path only, avoiding duplicate legacy restore prompts.
(() => {
  function bind(){
    const btn=document.querySelector('[data-progress="later"]');
    if(!btn||btn.dataset.laterClickV221)return false;
    btn.dataset.laterClickV221='1';
    btn.addEventListener('click',e=>{
      e.stopImmediatePropagation();
      if(typeof setProgress==='function')setProgress('later');
      setTimeout(()=>window.weeklyStateIntegrityV22?.recoverHistoricalLater?.().catch(err=>{
        if(String(err?.message||'').includes('Unlock cancelled'))return;
        let box=document.getElementById('weeklyStateToast');
        if(!box){box=document.createElement('div');box.id='weeklyStateToast';box.className='save-toast';document.body.appendChild(box);}
        box.textContent='稍后看历史恢复失败：'+(err?.message||'未知错误');box.classList.add('show');
        clearTimeout(box._timer);box._timer=setTimeout(()=>box.classList.remove('show'),6500);
      }),0);
    },true);
    return true;
  }
  if(!bind()){
    const timer=setInterval(()=>{if(bind())clearInterval(timer);},120);setTimeout(()=>clearInterval(timer),5000);
  }
})();
