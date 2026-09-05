// v22.2: Later navigation is local-only. Historical cloud recovery must never run on a tab click.
(() => {
  function bind(){
    const btn=document.querySelector('[data-progress="later"]');
    if(!btn||btn.dataset.laterClickV222)return false;
    btn.dataset.laterClickV222='1';
    btn.addEventListener('click',e=>{
      // This capture handler intentionally suppresses older v12/v22 click listeners that attempted
      // encrypted historical recovery (and therefore prompted for a password) whenever Later opened.
      e.stopImmediatePropagation();
      if(typeof setProgress==='function')setProgress('later');
    },true);
    return true;
  }
  if(!bind()){
    const timer=setInterval(()=>{if(bind())clearInterval(timer);},120);setTimeout(()=>clearInterval(timer),5000);
  }
})();
