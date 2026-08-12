(() => {
  const REPO = 'syukaisan-lang/weekly-intelligence';
  const originalSetStatus = window.setStatus || setStatus;

  function utf8Base64(obj){
    const text = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary);
  }

  function inferCategory(a){
    const text = `${a.title||''} ${a.summary||''} ${a.reason||''} ${(a.tags||[]).join(' ')} ${(a.concepts||[]).join(' ')}`;
    if(/AEO|AIO|GEO|生成AI|ChatGPT|LLM|AI/i.test(text)) return 'AI';
    if(/EC|eコマース|Amazon|楽天|D2C|TikTok Shop/i.test(text)) return 'EC';
    if(/消費者|生活者|購買行動|インサイト|顧客/i.test(text)) return '消費者';
    if(/家電|イヤホン|ヘッドホン|ガジェット|デバイス/i.test(text)) return '家電情報';
    return 'マーケティング';
  }

  function openSaveIssue(a){
    const payload = {
      title: a.title || '',
      url: a.url || '',
      source: a.source || '',
      summary: a.summary || '',
      reason: a.reason || '',
      tags: a.tags || [],
      category: inferCategory(a),
      reading_score: a.reading_score,
      notion_score: a.notion_score
    };
    const encoded = utf8Base64(payload);
    const title = `[NOTION-SAVE] ${(a.title||'Article').slice(0,90)}`;
    const body = `PAYLOAD_BASE64: ${encoded}\n\n由 Weekly Intelligence Dashboard 创建。\n只有仓库所有者 syukaisan-lang 提交的请求会被自动写入 Notion。`;
    const url = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if(!win){ location.href = url; }
    showNotionToast('已打开 GitHub 确认页。提交 Issue 后会自动写入 Notion。');
  }

  function showNotionToast(text){
    let box = document.getElementById('notionSaveToast');
    if(!box){
      box = document.createElement('div');
      box.id = 'notionSaveToast';
      box.className = 'save-toast';
      document.body.appendChild(box);
    }
    box.textContent = text;
    box.classList.add('show');
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.classList.remove('show'), 5000);
  }

  window.setStatus = setStatus = function(a, v){
    const before = st(a.id).status;
    originalSetStatus(a, v);
    if(v === 'save' && before !== 'save'){
      setTimeout(() => openSaveIssue(a), 80);
    }
  };
})();
