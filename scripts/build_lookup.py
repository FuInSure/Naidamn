"""Build a compact mind-map navigation index linked to original Wangdao ranges."""
import difflib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'app/assets'
maps=json.loads((ROOT/'content/mindmaps.json').read_text(encoding='utf-8'))
sources=json.loads((ROOT/'content/source-ranges.json').read_text(encoding='utf-8'))
def norm(s):return re.sub(r'[^a-z0-9\u3400-\u9fff]','',s.lower())
def clean(s):
    s=re.sub(r'[（(](?:[^）)]*(?:选择|算法题|熟悉|选学|了解|理解|掌握|记忆|必考|重点)[^）)]*)[）)]','',s)
    return s.replace('\n','').strip()
def label(s):return re.sub(r'^[*＊]?\d+(?:[.．]\d+)+\s*','',s).strip()
rules=json.loads((ROOT/'content/mindmap-link-rules.json').read_text(encoding='utf-8')) if (ROOT/'content/mindmap-link-rules.json').exists() else {}
overrides=json.loads((ROOT/'content/mindmap-link-overrides.json').read_text(encoding='utf-8')) if (ROOT/'content/mindmap-link-overrides.json').exists() else {}
byid={s['id']:s for s in sources}
chapters={sub:list(dict.fromkeys(s['chapter'] for s in sources if s['subject']==sub)) for sub in ['ds','co','os','net']}
audit=[]
for m in maps:
    sub=m['subject'];nodes={n['id']:n for n in m['nodes']}
    pool=[s for s in sources if s['subject']==sub]
    for n in m['nodes']:
        n.update(title=clean(n['text']),sourceIds=[],linkKind='none',score=0)
        if n['parent'] is None:n['kind']='subject';continue
        parent=nodes[n['parent']]
        n['path']=parent.get('path',[])+([parent['text']] if parent['parent'] else [])
        chapter=re.match(r'^第\s*(\d+)\s*章',n['title']) if parent['parent'] is None else None
        if chapter:
            number=int(chapter[1]);n['chapter']=chapters[sub][number-1]
            n['sourceIds']=[s['id'] for s in pool if s['chapter']==n['chapter'] and s['level']==2]
            n['linkKind']='chapter';n['score']=1
        else:
            n['chapter']=parent.get('chapter')
            if not n['chapter']:
                n['kind']='note';continue
            current=[s for s in pool if s['chapter']==n['chapter']]
            parent_sources=[byid[x] for x in parent['sourceIds']]
            if parent['linkKind'] not in ['chapter','none'] and parent_sources:
                current=[s for s in current if any((s['page'],s['regions'][0]['top'])>=(p['page'],p['regions'][0]['top']) and (s['endPage'],s['regions'][-1]['bottom'])<=(p['endPage'],p['regions'][-1]['bottom']) for p in parent_sources)] or parent_sources
            override=overrides.get(n['id'])
            if override:assert override['text']==n['text'],('stale override',n['id'])
            explicit=override['targets'] if override else rules.get(sub,{}).get(n['text'])
            if not explicit:
                explicit=next((r['targets'] for r in rules.get('patterns',[]) if r['subject']==sub and re.search(r['pattern'],n['text'])),None)
            if not explicit and parent['linkKind']=='chapter':
                tops=[s for s in current if s['level']==2 and norm(s['title']) in norm(n['title'])]
                if tops:explicit=[s['id'] for s in tops]
            if explicit:
                def resolve(title):
                    if title in byid:
                        assert byid[title]['subject']==sub,('wrong subject override',title)
                        return title
                    if title.startswith('@'):
                        return next(s['id'] for s in pool if s['level']==2 and re.match(r'[*＊]?'+re.escape(title[1:])+r'(?:\s|$)',s['sectionLabel']))
                    matches=[s['id'] for s in pool if s['title']==title]
                    assert len(matches)==1,('ambiguous source title; use ID',sub,title,matches)
                    return matches[0]
                n['sourceIds']=[resolve(title) for title in explicit]
                n['linkKind']='reviewed';n['score']=1
            else:
                title=n['title'];q=norm(title)
                ancestor=norm(''.join(n['path'][-2:]))
                ranked=[]
                generic=q in ['定义','概念','功能','特点','应用','含义','优点','缺点','基本概念','计算','过程','结构','分类','优缺点','注意','原因','作用','实现','基本思想','存储结构','表示方法']
                for s in current:
                    t=norm(s['title']);r=0
                    if q==t:r=1
                    elif len(t)>=3 and t in q:r=.94+min(len(t),20)*.001
                    elif len(q)>=2 and q in t:r=(.92 if t.startswith(q) else .83)+len(q)/max(len(t),1)*.04
                    else:
                        ratio=difflib.SequenceMatcher(None,q,t).ratio()
                        if ratio>=.64:r=ratio*.85
                    if not r:continue
                    if generic:
                        context=max([difflib.SequenceMatcher(None,t,norm(p)).ratio() for p in n['path'][-2:]] or [0])
                        if any(norm(p) in t for p in n['path'][-2:] if len(norm(p))>2):context=max(context,.9)
                        r=.45*r+.55*context
                    contained=any(s['page']>=p['page'] and s['endPage']<=p['endPage'] for p in parent_sources)
                    if contained:r+=.025
                    ranked.append((r,s))
                ranked.sort(key=lambda x:(-x[0],x[1]['endPage']-x[1]['page'], -x[1]['level']))
                if ranked and ranked[0][0]>=.79:
                    best=ranked[0][0]
                    selected=[s for r,s in ranked if r>=max(.94,best-.015) and len(norm(s['title']))>=3 and norm(s['title']) in q]
                    if not selected:selected=[ranked[0][1]]
                    # Keep the most specific ranges when a heading and its child both match.
                    selected=[s for s in selected if not any(o['id']!=s['id'] and o['level']>s['level'] and norm(o['title']) in norm(s['title']) for o in selected)]
                    n['sourceIds']=[s['id'] for s in selected[:6]];n['linkKind']='heading';n['score']=round(best,3)
                else:
                    n['sourceIds']=list(parent['sourceIds']);n['linkKind']='parent';n['score']=round(ranked[0][0],3) if ranked else 0
        n['kind']=n.get('kind','chapter' if chapter else 'topic')
        audit.append(dict(subject=sub,id=n['id'],title=n['text'],path=n['path'],chapter=n.get('chapter'),linkKind=n['linkKind'],score=n['score'],sources=[byid[s]['title'] for s in n['sourceIds']]))
    # A group must also cover its sub-branches. Explicit/heading matches can be
    # just the definition, while children include storage or later operations.
    for n in reversed(m['nodes']):
        if not n['children'] or n['kind'] in ['subject','chapter']:continue
        children=[nodes[x] for x in n['children'] if nodes[x].get('sourceIds')]
        if not children:continue
        own=[] if n['linkKind']=='parent' else n['sourceIds']
        candidates=list(dict.fromkeys(own+[x for c in children for x in c['sourceIds']]))
        def bounds(ident):
            s=byid[ident]
            return (s['page'],s['regions'][0]['top']),(s['endPage'],s['regions'][-1]['bottom'])
        def covered(ident,other):
            a,b=bounds(ident);c,d=bounds(other)
            # For coincident ranges retain the first candidate deterministically.
            return c<=a and b<=d and ((a,b)!=(c,d) or candidates.index(other)<candidates.index(ident))
        n['sourceIds']=[x for x in candidates if not any(x!=y and covered(x,y) for y in candidates)]
    m['chapters']=[n['id'] for n in m['nodes'] if n['kind']=='chapter']
    m['nodes']=[{k:v for k,v in n.items() if k not in ['bbox','score']} for n in m['nodes']]

audit=[dict(subject=m['subject'],id=n['id'],title=n['text'],path=n.get('path',[]),chapter=n.get('chapter'),linkKind=n['linkKind'],sources=[byid[s]['title'] for s in n['sourceIds']]) for m in maps for n in m['nodes'] if n['parent'] is not None]
payload={'subjects':[{k:v for k,v in m.items() if k not in ['width','height']} for m in maps]}
aliases=json.loads((ROOT/'content/search-aliases.json').read_text(encoding='utf-8'))
for s in sources:s['aliases']=aliases.get(s['title'],[])
books=[]
for m in maps:
    sub=m['subject'];name=m['name']
    book_file=next((ROOT/'知识点参考书').glob('*'+name+'*.pdf'))
    import pymupdf
    with pymupdf.open(book_file) as pdf:pages=len(pdf)
    books.append(dict(id=sub,name='王道 · '+name,pages=pages))
(ASSETS/'book-meta.js').write_text('window.BOOK_META = '+json.dumps(books,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
(ASSETS/'mindmap-index.js').write_text('window.MINDMAPS = '+json.dumps(payload,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
(ASSETS/'sources.js').write_text('window.SOURCES = '+json.dumps(sources,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
(ROOT/'content/mindmap-links-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
with (ROOT/'tmp/mindmap-links-review.tsv').open('w',encoding='utf-8') as f:
    for a in audit:f.write('\t'.join([a['subject'],a.get('chapter') or '',a['linkKind'],a['title'].replace('\n',' / '),' > '.join(a['sources'])])+'\n')
print(json.dumps({m['subject']:{'nodes':len(m['nodes']),'chapters':len(m['chapters'])} for m in maps},ensure_ascii=False))
print('Link kinds:',{k:sum(a['linkKind']==k for a in audit) for k in ['chapter','reviewed','heading','parent']})
