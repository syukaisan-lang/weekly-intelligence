(() => {
  const PASS_KEY='weekly_intelligence_knowledge_passphrase_v1';
  let cached=null;

  function b64bytes(s){const bin=atob(s);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
  async function deriveKey(pass,salt,iterations){
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
  }
  async function decryptEnvelope(env,pass){
    const key=await deriveKey(pass,b64bytes(env.salt),Number(env.iterations||220000));
    const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64bytes(env.iv)},key,b64bytes(env.ciphertext));
    return JSON.parse(new TextDecoder().decode(raw));
  }
  function askPassphrase(){
    const saved=sessionStorage.getItem(PASS_KEY);if(saved)return saved;
    const pass=prompt('🔐 Knowledge 已加密。请输入你的 Dashboard 密码：');
    if(pass)sessionStorage.setItem(PASS_KEY,pass);return pass||'';
  }
  async function loadKnowledgeData(options={}){
    if(cached)return cached;
    const meta=await fetch('data/knowledge.json',{cache:'no-store'}).then(r=>r.json());
    if(!meta?.meta?.encrypted_full_data){cached=meta;return cached;}
    let pass=sessionStorage.getItem(PASS_KEY)||'';
    if(!pass&&options.prompt!==false)pass=askPassphrase();
    if(!pass)return {...meta,locked:true};
    try{
      const env=await fetch('data/knowledge.enc.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('encrypted data not generated yet');return r.json();});
      cached=await decryptEnvelope(env,pass);cached.locked=false;return cached;
    }catch(e){
      sessionStorage.removeItem(PASS_KEY);
      if(options.prompt!==false){alert('Knowledge 密码不正确，或加密数据尚未生成。');}
      return {...meta,locked:true,decryption_error:e.message};
    }
  }
  function forgetKnowledgePassphrase(){sessionStorage.removeItem(PASS_KEY);cached=null;}
  window.loadKnowledgeData=loadKnowledgeData;
  window.forgetKnowledgePassphrase=forgetKnowledgePassphrase;
  window.hasKnowledgePassphrase=()=>!!sessionStorage.getItem(PASS_KEY);
})();
