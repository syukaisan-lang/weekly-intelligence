(() => {
  const REPO='syukaisan-lang/weekly-intelligence';
  const originalSetStatus=window.setStatus||setStatus;
  async function openSaveIssue(a){
    const title=`[NOTION-SAVE] ${(a.title||'Article').slice(0,90)}`;
    let stateLine='';
    try{
      if(typeof window.prepareWeeklyStatePiggyback==='function'){
        const encoded=await window.prepareWeeklyStatePiggyback();
        if(encoded)stateLine=`\n\nSTATE_ENVELOPE_B64: ${encoded}`;
      }
    }catch(e){}
    let body=`ARTICLE_ID: ${a.id}${stateLine}\n\n由 Weekly Intelligence Dashboard 创建。真正的标题、摘要和筛选理由由 GitHub Action 从仓库里的 data/articles.json 读取。若本页已解锁 Dashboard 密码，本次也会顺带提交最新 Weekly 人工标记的 AES-GCM 密文备份。只有仓库所有者 syukaisan-lang 提交的请求会被处理。`;
    let url=`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    if(url.length>60000&&stateLine){
      body=`ARTICLE_ID: ${a.id}\n\n由 Weekly Intelligence Dashboard 创建。标记备份因为本次确认链接过长而跳过；Notion 保存不受影响。只有仓库所有者 syukaisan-lang 提交的请求会被处理。`;
      url=`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    }
    const win=window.open(url,'_blank','noopener,noreferrer');if(!win)location.href=url;
    showNotionToast(stateLine?'已打开 GitHub 确认页；提交后会写入 Notion，并顺带备份当前标记。':'已打开 GitHub 确认页。提交后会自动写入 Notion。');
  }
  function showNotionToast(text){let box=document.getElementById('notionSaveToast');if(!box){box=document.createElement('div');box.id='notionSaveToast';box.className='save-toast';document.body.appendChild(box);}box.textContent=text;box.classList.add('show');clearTimeout(box._timer);box._timer=setTimeout(()=>box.classList.remove('show'),5000);}
  window.setStatus=setStatus=function(a,v){const before=st(a.id).status;originalSetStatus(a,v);if(v==='save'&&before!=='save')setTimeout(()=>openSaveIssue(a),80);};
})();
