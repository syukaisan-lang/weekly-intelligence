(() => {
  const REPO='syukaisan-lang/weekly-intelligence';
  const originalSetStatus=window.setStatus||setStatus;
  function openSaveIssue(a){
    const title=`[NOTION-SAVE] ${(a.title||'Article').slice(0,90)}`;
    const body=`ARTICLE_ID: ${a.id}\n\n由 Weekly Intelligence Dashboard 创建。Issue 只保存文章ID；真正的标题、摘要和筛选理由由 GitHub Action 从仓库里的 data/articles.json 读取。\n只有仓库所有者 syukaisan-lang 提交的请求会被自动写入 Notion。`;
    const url=`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    const win=window.open(url,'_blank','noopener,noreferrer');if(!win)location.href=url;
    showNotionToast('已打开 GitHub 确认页。提交后会自动写入 Notion。');
  }
  function showNotionToast(text){let box=document.getElementById('notionSaveToast');if(!box){box=document.createElement('div');box.id='notionSaveToast';box.className='save-toast';document.body.appendChild(box);}box.textContent=text;box.classList.add('show');clearTimeout(box._timer);box._timer=setTimeout(()=>box.classList.remove('show'),5000);}
  window.setStatus=setStatus=function(a,v){const before=st(a.id).status;originalSetStatus(a,v);if(v==='save'&&before!=='save')setTimeout(()=>openSaveIssue(a),80);};
})();
