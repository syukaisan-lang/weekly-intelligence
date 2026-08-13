(() => {
  // Precision layer for task-oriented raw recall.
  // A single incidental mention in a long body must not be treated as evidence
  // that the whole item is about the user's current task.
  function taskMatchCount(task,text){
    try{
      const flags=task.re?.ignoreCase?'gi':'g';
      const re=new RegExp(task.re.source,flags);
      return (String(text||'').match(re)||[]).length;
    }catch(e){return 0;}
  }

  function strongTaskEvidence(task,title,body,domains){
    const t=String(title||''),b=String(body||''),d=String(domains||'');
    task.re.lastIndex=0;const titleHit=task.re.test(t);
    task.re.lastIndex=0;const domainHit=task.re.test(d);
    const bodyHits=taskMatchCount(task,b);
    const compactLength=b.replace(/\s+/g,'').length;
    // Two mentions normally indicate topic-level relevance. One mention is
    // accepted only for compact notes, where it is unlikely to be incidental.
    const bodyStrong=bodyHits>=2||(bodyHits===1&&compactLength<=320);
    return {strong:titleHit||domainHit||bodyStrong,titleHit,domainHit,bodyHits,bodyStrong,compactLength};
  }

  rawScore=function(title,body,domains,ctx){
    const nt=normalize(title),nb=normalize(body),nd=normalize(domains);
    let score=0,exactHits=0,strongTaskHit=false;

    if(ctx.raw.length>=3){
      if(nt.includes(ctx.raw))score+=13;
      else if(nb.includes(ctx.raw))score+=6;
    }

    for(const t of ctx.exactTerms||[]){
      if(nt.includes(t)){score+=7;exactHits++;}
      else if(nd.includes(t)){score+=3;exactHits++;}
      else if(nb.includes(t)){score+=1.7;exactHits++;}
    }
    for(const t of ctx.aliasTerms||[]){
      if(nt.includes(t))score+=2.4;
      else if(nb.includes(t))score+=.6;
    }

    for(const task of ctx.tasks||[]){
      const ev=strongTaskEvidence(task,title,body,domains);
      if(ev.strong){
        score+=14;
        strongTaskHit=true;
        // Reward actual topic density without letting long articles win merely
        // because they contain more words.
        if(ev.bodyHits>=2)score+=Math.min(3,(ev.bodyHits-1)*.7);
        if(ev.titleHit)score+=3;
      }else if(normalize(task.domain)===nd){
        score+=1.2;
      }
    }

    // With a recognized task, an item needs either direct query evidence or
    // strong task evidence. A lone synonym buried in a long body is not enough.
    if((ctx.tasks||[]).length&&!strongTaskHit&&!exactHits)return 0;
    return score>=4?score:0;
  };

  const previousHint=renderIntentHint;
  renderIntentHint=function(ctx,ruleCount,rawCount){
    previousHint(ctx,ruleCount,rawCount);
    const box=$w('queryIntentHint');
    if(box&&!box.classList.contains('hidden')&&(ctx.tasks||[]).length){
      const note=document.createElement('small');
      note.className='intent-precision-note';
      note.textContent='正文中的单次偶然词命中不会作为场景相关依据';
      box.appendChild(note);
    }
  };
})();
