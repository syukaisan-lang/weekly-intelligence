#!/usr/bin/env python3
"""Run the existing feed updater with personal-work-system-aware screening."""
import json,os
import update_feeds as base
from personal_relevance import score_text,prompt_context

_original_heuristic=base.heuristic

def personalized_heuristic(src,title,summary,content=''):
    score,notion,tags,features,reason=_original_heuristic(src,title,summary,content)
    full=' '.join([title or '',summary or '',(content or '')[:5000]])
    bonus,why,diag=score_text(full)
    score=max(0,min(10,score+bonus))
    # Notion value should be stricter: repetition lowers it more, evidence/gap/boundary raises it.
    notion_delta=bonus
    if diag.get('repetition_penalty',0):notion_delta-=min(.45,diag['repetition_penalty']*.55)
    notion=max(0,min(10,notion+notion_delta))
    if why:reason=(reason+'；' if reason else '')+'个人体系增量：'+why
    return score,notion,tags,features,reason

def personalized_llm_screen(a):
    key=os.getenv('OPENAI_API_KEY');model=os.getenv('OPENAI_MODEL')
    if not key or not model:return None
    try:
        from openai import OpenAI
        client=OpenAI(api_key=key)
        feature_schema={'type':'object','properties':{
            'topics':{'type':'array','items':{'type':'string'},'maxItems':6},
            'formats':{'type':'array','items':{'type':'string'},'maxItems':3},
            'intents':{'type':'array','items':{'type':'string'},'maxItems':3},
            'signals':{'type':'array','items':{'type':'string'},'maxItems':3}
        },'required':['topics','formats','intents','signals'],'additionalProperties':False}
        schema={'type':'object','properties':{
            'grade':{'type':'string','enum':['S','A','B','C']},
            'reading_score':{'type':'number','minimum':0,'maximum':10},
            'notion_score':{'type':'number','minimum':0,'maximum':10},
            'reason':{'type':'string'},
            'increment_type':{'type':'string','enum':['rule_evidence','knowledge_gap','boundary_or_counterexample','direct_work_use','mostly_duplicate','general_relevance']},
            'tags':{'type':'array','items':{'type':'string'},'maxItems':6},
            'learning_features':feature_schema
        },'required':['grade','reading_score','notion_score','reason','increment_type','tags','learning_features'],'additionalProperties':False}
        local_bonus,local_why,_=score_text(' '.join([a.get('title',''),a.get('summary',''),a.get('content_excerpt','')]))
        context=prompt_context()
        prompt=f'''你在维护一个个人工作知识系统。用户长期做日本EC/Marketing/GTM，个人体系由真实工作经验、读书笔记、Amazon/EC实战手册和Notion知识库组成。\n\n{context}\n\n本地知识匹配提示：{local_why or '无明显匹配'}（仅辅助，不要机械服从）。\n\n筛选目标不是“主题越像越好”，而是判断新文章对既有工作体系的增量：\n1. rule_evidence：为已有工作判断补充更强数据、案例或验证；\n2. knowledge_gap：补足体系里相关但薄弱的知识空白；\n3. boundary_or_counterexample：提供反例、失败案例、边界条件，可能修正规则；\n4. direct_work_use：可以马上用于GTM/EC/品牌/广告/消费者研究/AI工作流/管理决策；\n5. mostly_duplicate：虽然相关，但大部分只是用户已经知道的内容，且没有新证据/方法/反例；\n6. general_relevance：一般相关。\n\n评分要求：mostly_duplicate原则上降到B/C；有强数据、反例、边界条件，即使挑战用户现有认知，也应升高。不要制造“只推荐同温层”的过滤泡泡。S=高增量且值得精读；A=明确增量；B=摘要足够；C=跳过。\n\n来源：{a['source']}\n标题：{a['title']}\n摘要：{a.get('summary','')}\n正文可见片段：{a.get('content_excerpt','')}\n仅根据可见信息判断。\n\nlearning_features 必须拆成四维：topics / formats / intents / signals。主题和文章形式必须分开，例如“AI线上研讨会”同时标AI主题、线上研讨会形式、活动告知意图。'''
        resp=client.responses.create(model=model,input=prompt,text={'format':{'type':'json_schema','name':'screening','schema':schema,'strict':True}},store=False)
        out=json.loads(resp.output_text)
        out['reason']=f"[{out['increment_type']}] "+out['reason']
        return out
    except Exception as e:
        print('Personalized LLM fallback:',e);return None

base.heuristic=personalized_heuristic
base.llm_screen=personalized_llm_screen

if __name__=='__main__':
    base.main()
