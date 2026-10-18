/* User handwriting is stored separately from the original book pages. */
'use strict';
window.EbookTools=(()=>{
 const KEY='naidamn-handwriting-v1';
 const colors={'朱红':'#bb3737','墨蓝':'#2463aa','翠绿':'#257450','紫色':'#7945aa','墨黑':'#26332e'};
 let db={notes:[],drafts:{}},loadError=false,editor=null,panel=null,cleanup=null;
 const copy=x=>JSON.parse(JSON.stringify(x));
 const bookExists=id=>BOOK_META.some(b=>b.id===id);
 function validStroke(s){return s&&Object.values(colors).includes(s.color)&&Array.isArray(s.points)&&s.points.length>0&&s.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=1));}
 function validNote(n,saved){return n&&bookExists(n.subject)&&Number.isInteger(n.page)&&n.page>=1&&n.page<=BOOK_META.find(b=>b.id===n.subject).pages&&typeof n.label==='string'&&(!saved||n.label.trim())&&Array.isArray(n.strokes)&&n.strokes.every(validStroke)&&(!saved||typeof n.id==='string');}
 try{const raw=localStorage.getItem(KEY);if(raw){const d=JSON.parse(raw);if(!Array.isArray(d.notes)||!d.notes.every(n=>validNote(n,true))||!d.drafts||!Object.values(d.drafts).every(n=>validNote(n,false)))throw Error('invalid');db=d;}}catch{loadError=true;}
 function commit(next){if(loadError){message('笔记记录暂时无法读取，已保护原数据，请勿清除浏览器数据。');return false;}try{localStorage.setItem(KEY,JSON.stringify(next));db=next;return true;}catch{message('保存失败：本地存储空间不足或不可用，请保留当前页面后重试。');return false;}}
 function message(text){const el=document.getElementById('note-status')||document.querySelector('.reader-context');if(el)el.textContent=text;}
 function subject(){return activeReader?.mode==='ebook'?activeReader.subject:null;}
 function key(){return subject()+':'+activeReader.page;}
 function notesFor(sub,page){return db.notes.filter(n=>n.subject===sub&&(page===undefined||n.page===page));}
 function stash(){if(!editor)return true;const next=copy(db);if(editor.strokes.length||editor.label.trim())next.drafts[editor.key]={subject:editor.subject,page:editor.page,label:editor.label,strokes:copy(editor.strokes),editingId:editor.editingId||null,color:editor.color};else delete next.drafts[editor.key];return commit(next);}
 function toolbar(){if(activeReader?.mode!=='ebook')return '';return `<nav class="ebook-toolbar" aria-label="电子书工具"><button data-ebook="note">手写笔记${db.drafts[subject()+':'+activeReader.page]?' · 草稿':''}</button><button data-ebook="search">书内检索</button><button data-ebook="toc">章节目录</button><button data-ebook="page-notes">本页笔记 <span>${notesFor(subject(),activeReader.page).length}</span></button></nav><div id="note-editor"></div>`;}
 function unmount(){if(editor)stash();cleanup?.();cleanup=null;editor=null;closePanel();}
 function mount(){if(!subject())return;renderInk();}
 function paths(strokes){return strokes.map(s=>`<polyline points="${s.points.map(p=>(p[0]*1000).toFixed(3)+','+(p[1]*1000).toFixed(3)).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`).join('');}
 function renderInk(){
  const stage=document.querySelector('.reader-stage');if(!stage||!subject())return;
  let svg=stage.querySelector('.note-ink');if(!svg){svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('note-ink');svg.setAttribute('viewBox','0 0 1000 1000');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-label','本页已保存的手写笔记');stage.append(svg);}
  svg.innerHTML=notesFor(subject(),activeReader.page).filter(n=>n.id!==editor?.editingId).map(n=>`<g data-note-id="${esc(n.id)}">${paths(n.strokes)}</g>`).join('')+(editor?`<g class="draft-ink">${paths(editor.strokes)}</g><g class="live-ink"></g>`:'');
  svg.classList.toggle('drawing',!!editor&&editor.tool==='pen');
 }
 function renderEditor(){
  const host=document.getElementById('note-editor');if(!host)return;document.querySelector('.book-reader')?.classList.toggle('note-editing',!!editor);
  if(!editor){host.innerHTML='';centerReaderPage();return;}
  host.innerHTML=`<div class="note-editor"><div class="note-tools"><button data-ebook="pen" aria-pressed="${editor.tool==='pen'}">书写</button><button data-ebook="pan" aria-pressed="${editor.tool==='pan'}">移动页面</button><div class="note-colors" role="group" aria-label="笔迹颜色">${Object.entries(colors).map(([name,color])=>`<button class="note-color" style="--note-color:${color}" data-ebook="color" data-color="${color}" aria-label="${name}" aria-pressed="${editor.color===color}"><span></span></button>`).join('')}</div><button data-ebook="undo" ${editor.strokes.length?'':'disabled'}>撤销一笔</button></div><div class="note-save-row"><label>标签<input id="note-label" maxlength="80" value="${esc(editor.label)}" placeholder="必填，例如：链表易错点" autocomplete="off"></label><button data-ebook="save">保存笔记</button><button data-ebook="leave">暂存退出</button></div><p id="note-status" role="status">书写时单指／笔尖画线，双指移动或缩放；保存前请命名标签。</p></div>`;
  centerReaderPage();renderInk();cleanup?.();cleanup=installInk();
 }
 function begin(id){
  if(loadError){message('原有笔记无法读取，已保护原数据。');return;}
  if(editor){message('请先保存或暂存当前笔记。');return;}
  if(id&&db.drafts[key()]&&db.drafts[key()].editingId!==id){message('本页还有未保存草稿，请先打开“手写笔记”处理草稿。');return;}
  readerGestureController?.cancel();
  const n=id?(db.drafts[key()]?.editingId===id?db.drafts[key()]:db.notes.find(n=>n.id===id)):db.drafts[key()];
  editor={key:key(),subject:subject(),page:activeReader.page,label:n?.label||'',strokes:copy(n?.strokes||[]),editingId:id||n?.editingId||null,color:n?.color||Object.values(colors)[0],tool:'pen'};
  renderEditor();
 }
 function leave(){if(!stash())return;cleanup?.();cleanup=null;editor=null;renderEditor();renderInk();}
 function save(){
  if(!editor)return;const label=editor.label.trim(),input=document.getElementById('note-label');
  if(!label){input.setCustomValidity('请先为笔记命名标签');input.reportValidity();message('标签不能为空，命名后才能保存。');return;}
  if(!editor.strokes.length){message('请先在书页上写字或划线。');return;}
  const next=copy(db),id=editor.editingId||('note-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
  const note={id,subject:editor.subject,page:editor.page,label,strokes:copy(editor.strokes),updatedAt:Date.now()};
  const index=next.notes.findIndex(n=>n.id===id);if(index<0)next.notes.push(note);else next.notes[index]=note;delete next.drafts[editor.key];
  if(!commit(next))return;
  cleanup?.();cleanup=null;editor=null;renderEditor();renderInk();
  const counter=document.querySelector('[data-ebook="page-notes"] span');if(counter)counter.textContent=notesFor(subject(),activeReader.page).length;
  document.querySelector('[data-ebook="note"]').textContent='手写笔记';message('已保存笔记：'+label);
 }
 function installInk(){
  const svg=document.querySelector('.note-ink'),points=new Map();let stroke=null,pinch=null,multi=false,frame=0;
  const local=e=>{const r=svg.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];};
  function preview(){frame=0;const live=svg.querySelector('.live-ink');if(live)live.innerHTML=stroke?paths([stroke]):'';}
  function reset(){cancelAnimationFrame(frame);frame=0;points.clear();stroke=null;pinch=null;multi=false;preview();}
  function pair(){const [a,b]=[...points.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};}
  function down(e){if(!editor||editor.tool!=='pen'||e.button>0||!document.getElementById('page-image')?.naturalWidth)return;
   e.preventDefault();e.stopPropagation();svg.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(points.size===1&&!multi){stroke={color:editor.color,points:[local(e)]};preview();}
   else{multi=true;stroke=null;preview();if(points.size===2){const p=pair(),r=svg.getBoundingClientRect();pinch={...p,zoom:activeReader.zoom,anchor:{x:(p.x-r.left)/r.width,y:(p.y-r.top)/r.width}};}else pinch=null;}
  }
  function move(e){if(!points.has(e.pointerId)||!editor)return;e.preventDefault();points.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(points.size===2&&pinch){const p=pair();setReaderZoom(pinch.zoom*p.d/pinch.d,p,pinch.anchor);return;}
   if(multi||!stroke)return;const p=local(e),last=stroke.points[stroke.points.length-1];if(Math.hypot(p[0]-last[0],p[1]-last[1])>.0005){stroke.points.push(p);if(!frame)frame=requestAnimationFrame(preview);}
  }
  function up(e){if(!points.has(e.pointerId))return;e.preventDefault();
   if(!multi&&stroke&&editor){if(stroke.points.length===1)stroke.points.push([...stroke.points[0]]);editor.strokes.push(stroke);stroke=null;stash();renderInk();document.querySelector('[data-ebook="undo"]').disabled=false;}
   points.delete(e.pointerId);if(!points.size){stroke=null;pinch=null;multi=false;}else{multi=true;stroke=null;pinch=null;}preview();
  }
  svg.addEventListener('pointerdown',down);svg.addEventListener('pointermove',move);svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',reset);
  window.addEventListener('blur',reset);window.addEventListener('resize',reset);
  return ()=>{reset();svg.removeEventListener('pointerdown',down);svg.removeEventListener('pointermove',move);svg.removeEventListener('pointerup',up);svg.removeEventListener('pointercancel',reset);window.removeEventListener('blur',reset);window.removeEventListener('resize',reset);};
 }
 const noteNorm=s=>String(s).normalize('NFKC').toLowerCase().replace(/\s+/g,'');
 function matches(query,sub){const q=noteNorm(query);return db.notes.filter(n=>(!sub||sub==='all'||n.subject===sub)&&(!q||noteNorm(n.label).includes(q))).sort((a,b)=>b.updatedAt-a.updatedAt);}
 function noteRows(list){return list.map(n=>`<div class="note-result-row"><button class="note-result" data-ebook="open-note" data-id="${esc(n.id)}"><strong>${esc(n.label)}</strong><small>${subjectNames[n.subject]} · PDF ${n.page} 页 · ${n.strokes.length} 笔</small></button></div>`).join('');}
 function homeResults(){const list=matches(browse.query,browse.scope);return `${scopes()}<div class="search-heading"><h1>笔记标签</h1><span>${list.length} 条笔记</span></div>${loadError?'<p role="alert">笔记数据读取失败，原记录已保留。</p>':list.length?noteRows(list.slice(0,browse.limit))+(list.length>browse.limit?'<button class="more" data-action="more">显示更多笔记</button>':''):'<div class="empty">没有匹配的已保存笔记。可在电子书中手写，并命名标签后保存。</div>'}`;}
 let exportBusy=false;
 function exportControls(scope='all'){
  const count=scope==='all'?db.notes.length:notesFor(scope).length;
  return `<div class="notes-export"><button data-ebook="export" data-scope="${scope}" ${!count||loadError?'disabled':''}>${scope==='all'?'导出全部笔记':'导出本书笔记'}（${count}）</button><button data-ebook="import" ${loadError?'disabled':''}>导入笔记</button><input class="notes-import-file" type="file" accept=".json,application/json" hidden><p>JSON 备份，包含标签、页码、颜色和手写笔迹；仅导出已保存笔记，不含草稿和课本图片。</p><span class="notes-export-status" role="status"></span></div>`;
 }
 function exportStatus(state){exportBusy=false;document.querySelectorAll('.notes-export-status').forEach(el=>el.textContent=state==='saved'?'笔记文件已保存。':state==='cancelled'?'已取消导出，笔记未改变。':state==='download'?'已发起下载，请在浏览器下载列表查看。':'导出失败，请重试；原笔记未改变。');}
 function exportNotes(scope){
  if(exportBusy||loadError)return;
  const list=scope==='all'?db.notes:notesFor(scope);if(!list.length)return;
  const used=new Set(list.map(n=>n.subject));
  const payload={format:'naidamn-handwriting-backup',version:1,exportedAt:new Date().toISOString(),scope,coordinateSystem:'normalized-page-xy-0-to-1',pageNumbering:'PDF physical page including cover and preface',books:BOOK_META.filter(b=>used.has(b.id)),notes:copy(list)};
  const now=new Date(),stamp=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  const name='Naidamn-notes-'+scope+'-'+stamp+'.json',text=JSON.stringify(payload,null,2);
  exportBusy=true;
  try{
   if(window.NaidamnExport?.saveNotes){
    if(!window.NaidamnExport.saveNotes(name,text))throw Error('native export unavailable');
    document.querySelectorAll('.notes-export-status').forEach(el=>el.textContent='请在系统窗口中选择保存位置。');return;
   }
   const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'})),a=document.createElement('a');
   a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);exportStatus('download');
  }catch{exportStatus('error');}
 }
 let importDialog=null,importPending=null;
 const importMessage=text=>document.querySelectorAll('.notes-export-status').forEach(el=>el.textContent=text);
 function closeImport(){importDialog?.close();importDialog?.remove();importDialog=null;importPending=null;}
 function receiveImport(text,status='ready'){
  if(status!=='ready'){importMessage(status==='cancelled'?'已取消导入，笔记未改变。':'读取失败，请重新选择备份文件。');return;}
  if(loadError)return;
  try{
   if(typeof text!=='string'||new Blob([text]).size>20*1024*1024)throw Error('文件超过 20 MB');
   const data=JSON.parse(text.replace(/^\uFEFF/,''));
   if(data.format!=='naidamn-handwriting-backup'||data.version!==1||data.coordinateSystem!=='normalized-page-xy-0-to-1'||!Array.isArray(data.notes)||!data.notes.length||data.notes.length>10000)throw Error('不是受支持的 Naidamn 笔记备份');
   const list=data.notes.map(n=>{
    if(!validNote(n,true)||!n.id.trim()||n.id.length>200||n.label.length>80||!n.strokes.length||!Number.isFinite(n.updatedAt)||n.updatedAt<0)throw Error('包含无效笔记、页码或笔迹');
    return {id:n.id,subject:n.subject,page:n.page,label:n.label,strokes:n.strokes.map(s=>({color:s.color,points:s.points.map(p=>[...p])})),updatedAt:n.updatedAt};
   });
   closeImport();importPending=list;
   const result=mergeImport(list);
   importDialog=document.createElement('dialog');importDialog.className='ebook-panel notes-import-dialog';importDialog.setAttribute('aria-label','导入笔记预览');
   const counts=BOOK_META.map(b=>{const count=list.filter(n=>n.subject===b.id).length;return count?`${esc(subjectNames[b.id])}：${count} 条`:'';}).filter(Boolean).join(' · ');
   importDialog.innerHTML=`<header><h2>导入笔记</h2><button data-ebook="import-cancel">取消</button></header><div class="ebook-panel-body"><p>${counts}</p><p>新增 ${result.added} 条，跳过重复 ${result.skipped} 条。</p><p>已有笔记和草稿会保留；同一记录内容不同时另存一条，不覆盖。</p><button data-ebook="import-confirm">确认导入</button><p class="notes-import-status" role="status"></p></div>`;
   importDialog.addEventListener('cancel',e=>{e.preventDefault();closeImport();importMessage('已取消导入，笔记未改变。');});document.body.append(importDialog);importDialog.showModal();
  }catch(e){importMessage('导入失败：'+(e instanceof SyntaxError?'文件不是有效 JSON':e.message)+'。原笔记未改变。');}
 }
 function mergeImport(list){
  const next=copy(db),signature=n=>JSON.stringify([n.subject,n.page,n.label,n.strokes]),seen=new Set(next.notes.map(signature)),ids=new Set(next.notes.map(n=>n.id));let added=0,skipped=0;
  for(const original of list){const sig=signature(original);if(seen.has(sig)){skipped++;continue;}const n=copy(original);while(ids.has(n.id))n.id='note-import-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);ids.add(n.id);seen.add(sig);next.notes.push(n);added++;}
  return {next,added,skipped};
 }
 function confirmImport(){
  if(!importPending||loadError)return;
  const result=mergeImport(importPending);
  if(!commit(result.next)){importDialog.querySelector('.notes-import-status').textContent='导入保存失败，原笔记未改变。请检查存储空间后重试。';return;}
  closeImport();
  if(panel)renderPanel();else if(!activeReader)render();
  renderInk();const counter=document.querySelector('[data-ebook="page-notes"] span');if(counter)counter.textContent=notesFor(subject(),activeReader.page).length;
  importMessage(`导入完成：新增 ${result.added} 条，跳过重复 ${result.skipped} 条。`);
 }
 document.addEventListener('change',async e=>{
  if(!e.target.matches('.notes-import-file'))return;const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(file.size>20*1024*1024){importMessage('导入失败：文件超过 20 MB。原笔记未改变。');return;}
  try{receiveImport(await file.text());}catch{receiveImport('', 'error');}
 });
 function closePanel(){const el=document.querySelector('.ebook-panel');if(el){el.close();el.remove();}panel=null;}
 function openPanel(type){
  if(editor&&!stash())return;
  readerGestureController?.cancel();closePanel();panel={type,mode:'knowledge',query:'',limit:60};
  const dialog=document.createElement('dialog');dialog.className='ebook-panel';dialog.setAttribute('aria-label',type==='toc'?'本书章节目录':type==='page-notes'?'本页笔记':'本书检索');
  dialog.innerHTML=`<header><div><small>${esc(books[subject()].name)}</small><h2>${type==='toc'?'章节与小节':type==='page-notes'?'本页笔记':'书内检索'}</h2></div><button data-ebook="close-panel" aria-label="关闭阅读工具">${icon('close')}</button></header>${type==='search'?'<div class="search-kind" role="group" aria-label="书内检索类型"><button data-ebook="search-kind" data-kind="knowledge" aria-pressed="true">书本知识点</button><button data-ebook="search-kind" data-kind="notes" aria-pressed="false">笔记标签</button></div><label class="book-search-label"><span id="book-search-label">检索本书知识点</span><input id="book-search" type="search" aria-labelledby="book-search-label" placeholder="输入知识点名称或缩写" autocomplete="off"></label>':''}<div class="ebook-panel-body" id="ebook-panel-results"></div>`;
  dialog.addEventListener('cancel',e=>{e.preventDefault();closePanel();});document.body.append(dialog);renderPanel();dialog.showModal();
 }
 function renderPanel(){
  if(!panel||!subject())return;const host=document.getElementById('ebook-panel-results');
  if(panel.type==='toc'){
   host.innerHTML=BOOK_TOC[subject()].map(c=>`<details class="book-chapter"><summary>${esc(c.title)}</summary><button class="toc-jump chapter-jump" data-ebook="jump" data-page="${c.page}">打开本章 · PDF ${c.page}</button>${c.sections.map(s=>`<button class="toc-jump level-${s.level}" data-ebook="jump" data-page="${s.page}"><span>${esc(s.title)}</span><small>PDF ${s.page}</small></button>`).join('')}</details>`).join('');return;
  }
  if(panel.type==='page-notes'){
   const list=notesFor(subject(),activeReader.page);host.innerHTML=exportControls(subject())+(list.length?list.map(n=>`<article class="page-note"><strong>${esc(n.label)}</strong><small>${n.strokes.length} 笔 · PDF ${n.page}</small><div><button data-ebook="edit" data-id="${esc(n.id)}">编辑笔记</button><button data-ebook="delete-ask" data-id="${esc(n.id)}">删除</button></div><div class="note-delete-confirm" data-confirm="${esc(n.id)}" hidden><p>确认删除这条笔记及其笔迹？</p><button data-ebook="delete-cancel">取消</button><button data-ebook="delete" data-id="${esc(n.id)}">确认删除</button></div></article>`).join(''):'<p class="empty">本页还没有已保存笔记。</p>');return;
  }
  if(panel.mode==='notes'){const list=matches(panel.query,subject());host.innerHTML=loadError?'<p>笔记读取失败，原数据已保留。</p>':list.length?noteRows(list.slice(0,panel.limit))+(list.length>panel.limit?'<button class="more" data-ebook="more">显示更多</button>':''):'<p class="empty">本书暂无匹配的笔记标签。</p>';return;}
  if(!normal(panel.query)){host.innerHTML='<p class="empty">输入名称查找本书知识点，也可手动切换为笔记标签检索。</p>';return;}
  const seen=new Set(),list=[];
  for(const hit of search(panel.query,subject()))for(const id of hit.sourceIds){if(!seen.has(id)){seen.add(id);list.push({hit,s:sourceById[id]});}}
  host.innerHTML=list.length?list.slice(0,panel.limit).map(({hit,s})=>`<button class="book-hit" data-ebook="jump" data-page="${s.page}"><strong>${esc(hit.title)}</strong><small>${esc(s.sectionLabel||s.title)} · PDF ${range(s)}</small></button>`).join('')+(list.length>panel.limit?'<button class="more" data-ebook="more">显示更多</button>':''):'<p class="empty">本书未找到匹配的知识点。</p>';
 }
 function jump(page,note){
  if(editor&&!stash())return;
  closePanel();activeReader.page=page;activeReader.zoom=1;delete activeReader.restorePosition;renderReader();
  if(note){const first=note.strokes[0]?.points[0];if(first)activeReader.noteFocus=first[1];message('笔记：'+note.label);}
 }
 function openNote(id){const n=db.notes.find(n=>n.id===id);if(!n)return;
  if(activeReader?.mode==='ebook'&&subject()===n.subject){jump(n.page,n);return;}
  openBook(n.subject);jump(n.page,n);
 }
 function back(){if(importDialog){closeImport();return true;}if(panel){closePanel();return true;}if(editor){leave();return true;}return false;}
 document.addEventListener('input',e=>{
  if(e.target.id==='note-label'&&editor){editor.label=e.target.value;e.target.setCustomValidity('');stash();}
  if(e.target.id==='book-search'&&panel){panel.query=e.target.value;panel.limit=60;renderPanel();}
 });
 document.addEventListener('click',e=>{
  const b=e.target.closest('button[data-ebook]');if(!b||b.disabled)return;const action=b.dataset.ebook,id=b.dataset.id;
  if(action==='export')exportNotes(b.dataset.scope);
  if(action==='import'){
   if(window.NaidamnExport?.pickNotes){if(!window.NaidamnExport.pickNotes())receiveImport('','error');}
   else b.closest('.notes-export').querySelector('.notes-import-file').click();
  }
  if(action==='import-cancel'){closeImport();importMessage('已取消导入，笔记未改变。');}
  if(action==='import-confirm')confirmImport();
  if(action==='note')begin();
  if(action==='save')save();
  if(action==='leave')leave();
  if(action==='pen'||action==='pan'){readerGestureController?.cancel();editor.tool=action;renderEditor();}
  if(action==='color'){editor.color=b.dataset.color;renderEditor();stash();}
  if(action==='undo'){editor.strokes.pop();stash();renderEditor();}
  if(action==='search'||action==='toc'||action==='page-notes')openPanel(action);
  if(action==='close-panel')closePanel();
  if(action==='search-kind'){
   panel.mode=b.dataset.kind;panel.limit=60;document.querySelectorAll('[data-ebook="search-kind"]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));
   const label=panel.mode==='notes'?'检索本书笔记标签':'检索本书知识点';document.getElementById('book-search-label').textContent=label;document.getElementById('book-search').placeholder=panel.mode==='notes'?'输入已命名的笔记标签':'输入知识点名称或缩写';renderPanel();
  }
  if(action==='more'){panel.limit+=60;renderPanel();}
  if(action==='jump')jump(Number(b.dataset.page));
  if(action==='open-note')openNote(id);
  if(action==='edit'){if(editor){message('请先保存或暂存当前笔记。');return;}closePanel();begin(id);}
  if(action==='delete-ask')b.closest('.page-note').querySelector('.note-delete-confirm').hidden=false;
  if(action==='delete-cancel')b.closest('.note-delete-confirm').hidden=true;
  if(action==='delete'){
   if(editor?.editingId===id){message('请先退出这条笔记的编辑。');return;}
   const next=copy(db);next.notes=next.notes.filter(n=>n.id!==id);for(const [k,d] of Object.entries(next.drafts))if(d.editingId===id)delete next.drafts[k];
   if(commit(next)){renderPanel();renderInk();const count=document.querySelector('[data-ebook="page-notes"] span');if(count)count.textContent=notesFor(subject(),activeReader.page).length;}
  }
 });
 document.addEventListener('keydown',e=>{
  if(importDialog||panel||editor){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();back();}else if(panel)e.stopImmediatePropagation();}
 },true);
 window.addEventListener('pagehide',stash);
 return {toolbar,mount,unmount,homeResults,exportControls,exportStatus,receiveImport,back,isDrawing:()=>!!editor&&editor.tool==='pen',isEditing:()=>!!editor,canNavigate:()=>!editor||stash(),hasPanel:()=>!!panel,stash};
})();
