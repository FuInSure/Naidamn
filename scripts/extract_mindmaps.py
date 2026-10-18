"""Recover the actual topic tree from PDF text blocks and connector endpoints."""
import hashlib,json,math,re
from pathlib import Path
import pymupdf

ROOT=Path(__file__).resolve().parents[1]
SUBJECTS={'ds':'数据结构','co':'组成原理','os':'操作系统','net':'计算机网络'}
all_maps=[]
for sub,name in SUBJECTS.items():
    path=next((ROOT/'思维导图').glob(name+'*.pdf'))
    doc=pymupdf.open(path);page=doc[0]
    nodes=[]
    for block in page.get_text('dict')['blocks']:
        lines=block.get('lines',[])
        if not lines:continue
        groups=[]
        for line in lines:
            same=next((g for g in groups if abs(g[0]['bbox'][0]-line['bbox'][0])<3),None)
            if same is None:groups.append([line])
            else:same.append(line)
        def box(g):return [min(l['bbox'][0] for l in g),min(l['bbox'][1] for l in g),max(l['bbox'][2] for l in g),max(l['bbox'][3] for l in g)]
        centered=max((box(g)[0]+box(g)[2])/2 for g in groups)-min((box(g)[0]+box(g)[2])/2 for g in groups)<3
        for g in ([lines] if centered else groups):
            text='\n'.join(''.join(s['text'] for s in l['spans']).strip() for l in g).strip()
            if text:nodes.append(dict(text=text,bbox=[round(v,3) for v in box(g)],children=[],parent=None))
    if sub=='os':
        # This single visual topic is split into two PDF text blocks.
        a=next(n for n in nodes if n['text']=='调度的目标\n常见评价指标')
        b=next(n for n in nodes if n['text']=='常考计算题，较简单\n需画甘特图分析')
        a['text']+='\n'+b['text']
        a['bbox']=[min(a['bbox'][0],b['bbox'][0]),min(a['bbox'][1],b['bbox'][1]),max(a['bbox'][2],b['bbox'][2]),max(a['bbox'][3],b['bbox'][3])]
        nodes.remove(b)
    edges=[];unresolved=[]
    for d in page.get_drawings():
        if d['type']!='s' or d.get('closePath') or not d['items']:continue
        first,last=d['items'][0],d['items'][-1]
        if first[0] not in ('l','c') or last[0] not in ('l','c'):continue
        start,end=first[1],last[-1]
        if end.x<=start.x:continue
        # Visually checked empty branch in the original CO mind map.
        if sub=='co' and abs(end.x-355.833)<.1 and abs(end.y-10776.053)<.1:continue
        def distance(i,point,child):
            x0,y0,x1,y1=nodes[i]['bbox']
            return abs((y0+y1)/2-point.y)+abs((x0-3.75 if child else x1+5.25)-point.x)
        parent=min(range(len(nodes)),key=lambda i:distance(i,start,False))
        child=min(range(len(nodes)),key=lambda i:distance(i,end,True))
        score=max(distance(parent,start,False),distance(child,end,True))
        if score>24 or child==parent:
            unresolved.append(dict(start=list(start),end=list(end),score=score));continue
        assert nodes[child]['parent'] in (None,parent),(sub,nodes[child]['text'])
        nodes[child]['parent']=parent
        if child not in nodes[parent]['children']:nodes[parent]['children'].append(child)
        edges.append((parent,child))
    roots=[i for i,n in enumerate(nodes) if n['parent'] is None and len(n['children'])>=4 and name in n['text']]
    assert roots,(sub,'missing root')
    root=max(roots,key=lambda i:nodes[i]['bbox'][1])
    active=[]
    def walk(i,path):
        n=nodes[i]
        n['id']=sub+'-map-'+hashlib.sha256(('/'.join(path+[n['text']])+str(n['bbox'][1])).encode()).hexdigest()[:10]
        active.append(i)
        n['children'].sort(key=lambda c:nodes[c]['bbox'][1])
        for c in n['children']:walk(c,path+[n['text']])
    walk(root,[])
    first_content_y=min(nodes[i]['bbox'][1] for i in active)
    missed=[n['text'] for i,n in enumerate(nodes) if i not in active and n['bbox'][1]>=first_content_y]
    assert not missed,(sub,'unconnected content labels',missed)
    out=[]
    for i in active:
        n=nodes[i]
        out.append(dict(id=n['id'],text=n['text'],bbox=n['bbox'],parent=nodes[n['parent']]['id'] if i!=root else None,children=[nodes[c]['id'] for c in n['children']]))
    all_maps.append(dict(subject=sub,name=name,file=path.name,width=page.rect.width,height=page.rect.height,root=nodes[root]['id'],nodes=out))
    print(sub,len(out),'nodes',len(unresolved),'unresolved connectors',[(nodes[i]['text'][:35],len(nodes[i]['children'])) for i in nodes[root]['children']])
    assert not unresolved,(sub,unresolved)
(ROOT/'content/mindmaps.json').write_text(json.dumps(all_maps,ensure_ascii=False,indent=2),encoding='utf-8')
