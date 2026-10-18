"""Build the ebook table of contents from PDF bookmarks and the existing CO transcription."""
from pathlib import Path
import json,re
import pymupdf
ROOT=Path(__file__).resolve().parents[1]
files={'ds':'2027数据结构.pdf','co':'2027计算机组成原理.pdf','os':'2027操作系统.pdf','net':'2027计算机网络.pdf'}
output={}
corrections=[]
norm=lambda text:re.sub(r'\s+','',text)
for sub,name in files.items():
 doc=pymupdf.open(ROOT/'知识点参考书'/name)
 rows=[];chapter=None
 audit_path=ROOT/f'content/{sub}-heading-audit.json'
 audits=json.loads(audit_path.read_text('utf-8')) if audit_path.exists() else []
 audited={(norm(a['title']),a['bookmarkPage']):a['page'] for a in audits}
 if sub!='co':
  for level,title,page in doc.get_toc():
   title=re.sub(r'\s+',' ',title).strip()
   if level==1:
    if not re.match(r'^第\s*\d+\s*章\s*\S+',title):chapter=None;continue
    chapter={'title':title,'page':page,'sections':[]};rows.append(chapter)
   elif chapter and level in [2,3]:
    corrected=audited.get((norm(title),page),page)
    if corrected!=page:corrections.append({'subject':sub,'title':title,'listedPage':page,'page':corrected,'basis':'existing heading audit'})
    chapter['sections'].append({'title':title,'page':corrected,'level':level})
 else:
  for line in (ROOT/'content/co_contents.txt').read_text('utf-8').splitlines():
   if not line or line.startswith('#'):continue
   name,number,title,printed=line.split('|');page=int(printed)+12
   if name=='参考资料':continue
   if number=='1.2.2':
    corrections.append({'subject':sub,'title':number+' '+title,'listedPage':page,'page':15,'basis':'visually checked original pages 14 and 15'})
    page=15
   if not chapter or chapter['title']!=f'第{number.split(".")[0]}章 {name}':
    chapter={'title':f'第{number.split(".")[0]}章 {name}','page':page,'sections':[]};rows.append(chapter)
   chapter['sections'].append({'title':number+' '+title,'page':page,'level':len(number.split('.'))})
 if sub=='ds':
  for chapter in rows:
   first=chapter['sections'][0]['page']
   if chapter['page']!=first:
    corrections.append({'subject':sub,'title':chapter['title'],'listedPage':chapter['page'],'page':first,'basis':'corrected first section on chapter opening page'})
    chapter['page']=first
 assert len(rows)=={'ds':8,'co':7,'os':5,'net':6}[sub], (sub, [r['title'] for r in rows])
 assert all(1<=r['page']<=len(doc) and all(1<=s['page']<=len(doc) for s in r['sections']) for r in rows)
 output[sub]=rows
(ROOT/'app/assets/book-toc.js').write_text('window.BOOK_TOC = '+json.dumps(output,ensure_ascii=False,separators=(',',':'))+';\n','utf-8')
(ROOT/'content/book-toc-corrections.json').write_text(json.dumps(corrections,ensure_ascii=False,indent=2)+'\n','utf-8')
print({s:{'chapters':len(rows),'sections':sum(len(c['sections']) for c in rows)} for s,rows in output.items()})
