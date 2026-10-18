/* Offline knowledge lookup, original ebooks, and local search frequency. */
'use strict';
const app=document.getElementById('app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normal=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g,'');
const subjectNames={ds:'数据结构',co:'组成原理',os:'操作系统',net:'计算机网络'};
const sourceById=Object.fromEntries(SOURCES.map(s=>[s.id,s]));
const books=Object.fromEntries(BOOK_META.map(b=>[b.id,b]));
const maps=Object.fromEntries(MINDMAPS.subjects.map(m=>[m.subject,m]));
const nodes=Object.fromEntries(MINDMAPS.subjects.flatMap(m=>m.nodes.map(n=>[n.id,{...n,subject:m.subject}])));
const browse={subject:'ds',chapter:maps.ds.chapters[0],query:'',scope:'all',searchMode:'knowledge',limit:60,open:new Set()};
let currentSection='lookup',clearPending=false;
let activeReader=null;
let readerGestureController=null;
const READER_ZOOM_MIN=.5,READER_ZOOM_MAX=4;
const symbols={search:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/>',arrow:'<path d="m9 5 7 7-7 7"/>',back:'<path d="m15 5-7 7 7 7"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',book:'<path d="M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3zM12 6v15"/>',branch:'<path d="M5 3v12a4 4 0 0 0 4 4h10M5 7h14M19 4l3 3-3 3M19 16l3 3-3 3"/>'};
function icon(key){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[key]||symbols.book}</svg>`;}
function topicName(n){return n.text.split('\n').map(s=>s.trim()).filter(Boolean).join(' ')||n.title;}
function topicMarkup(n){const lines=n.text.split('\n').map(s=>s.trim()).filter(Boolean);return esc(lines[0]||n.title)+(lines.length>1?'<span class="topic-continuation">'+esc(lines.slice(1).join(' '))+'</span>':'');}
function chapterName(n){const a=n.text.split('\n');return /^第\s*\d+\s*章$/.test(a[0])?a.slice(0,2).join(' '):a[0];}
function range(s){return s.page+(s.endPage>s.page?'–'+s.endPage:'');}
function nodeRangeLabel(n){const ss=n.sourceIds.map(id=>sourceById[id]);if(!ss.length)return '';if(ss.length===1)return 'PDF '+range(ss[0]);return ss.length+' 个相关范围';}
function sourceIds(n){return [...new Set(n.sourceIds)].filter(id=>sourceById[id]);}
function scopes(){return `<div class="scopes" aria-label="搜索科目">${[['all','全部科目'],...Object.entries(subjectNames)].map(([id,title])=>`<button class="scope ${browse.scope===id?'selected':''}" data-action="scope" data-id="${id}" aria-pressed="${browse.scope===id}">${title}</button>`).join('')}</div>`;}
function sidebar(){return `<aside class="sidebar" aria-label="思维导图章节"><div class="sidebar-label">思维导图目录</div>${Object.entries(subjectNames).map(([sub,title])=>`<section class="subject-group"><button class="subject-name ${browse.subject===sub?'selected':''}" data-action="subject" data-id="${sub}">${title}<span>${maps[sub].chapters.length} 章</span></button>${browse.subject===sub?`<div class="chapter-list">${maps[sub].chapters.map(id=>`<button data-action="chapter" data-id="${id}" class="${browse.chapter===id?'current':''}" ${browse.chapter===id?'aria-current="page"':''}>${esc(chapterName(nodes[id]))}</button>`).join('')}</div>`:''}</section>`).join('')}</aside>`;}
function branch(id,depth=0){const n=nodes[id],expand=n.children.length>0,opened=browse.open.has(id);return `<li class="branch-item"><div class="branch-row"><button class="topic-link ${expand?'branch-toggle':''}" data-action="${expand?'expand':'open-node'}" data-id="${id}" ${expand?`aria-expanded="${opened}" aria-controls="children-${id}"`:''}><span>${topicMarkup(n)}</span><small>${expand?(opened?'收起目录':'展开目录')+' · '+n.children.length+' 项':esc(nodeRangeLabel(n))}</small>${icon(expand?'arrow':'book')}</button>${expand?`<button class="branch-read" data-action="open-node" data-id="${id}" aria-label="阅读 ${esc(topicName(n))} 对应课本">${icon('book')}<span>读课本</span></button>`:''}</div>${expand&&opened?`<ul class="branch-children" id="children-${id}">${n.children.map(c=>branch(c,depth+1)).join('')}</ul>`:''}</li>`;}
function mapContent(){const n=nodes[browse.chapter];return `<div class="content-heading"><div><span class="eyebrow">${subjectNames[n.subject]} / 思维导图</span><h1>${esc(chapterName(n))}</h1><p>点击目录名称展开；点击“读课本”查看该目录范围。</p></div><span class="map-symbol">${icon('branch')}</span></div><div class="mobile-chapter"><label for="chapter">切换章节</label><select id="chapter">${maps[browse.subject].chapters.map(id=>`<option value="${id}" ${id===browse.chapter?'selected':''}>${esc(chapterName(nodes[id]))}</option>`).join('')}</select></div><ul class="mindmap-tree">${n.children.map(id=>branch(id)).join('')}</ul>`;}
const searchable=Object.values(nodes).filter(n=>n.kind==='topic'&&n.sourceIds.length).map(n=>({id:n.id,subject:n.subject,title:topicName(n),raw:n.text,path:(n.path||[]).map(s=>s.split('\n')[0]),sourceIds:n.sourceIds,aliases:n.linkKind==='parent'?[]:n.sourceIds.flatMap(id=>sourceById[id].aliases||[])}));
function score(entry,q){const t=normal(entry.title),raw=normal(entry.raw||''),a=(entry.aliases||[]).map(normal);if(t===q)return 1100;if(a.includes(q))return 1000;if(t.includes(q))return 850+Math.max(0,80-t.length);if(raw.includes(q))return 720;if(a.some(x=>x.includes(q)))return 650;return normal(entry.path.join(' ')).includes(q)?150:0;}
function search(query=browse.query,scope=browse.scope){const q=normal(query);if(!q)return [];const hits=searchable.filter(n=>scope==='all'||n.subject===scope).map(n=>({...n,score:score(n,q)})).filter(n=>n.score>0);const shown=new Set(hits.filter(n=>n.score>=650).flatMap(n=>n.sourceIds));for(const s of SOURCES){if(scope!=='all'&&s.subject!==scope)continue;const n={id:'source:'+s.id,subject:s.subject,title:s.title,path:[s.chapter,...s.path],sourceIds:[s.id],aliases:s.aliases};const rank=score(n,q);if(rank>=650&&!shown.has(s.id))hits.push({...n,score:rank-20,fromBook:true});}return hits.sort((a,b)=>b.score-a.score||['ds','co','os','net'].indexOf(a.subject)-['ds','co','os','net'].indexOf(b.subject));}
function result(n){const s=sourceById[n.sourceIds[0]];return `<button class="search-result" data-action="${n.fromBook?'open-source':'open-node'}" data-id="${n.fromBook?s.id:n.id}"><span class="result-body"><span class="result-subject">${subjectNames[n.subject]} <span>／ ${esc(n.path.filter(Boolean).slice(0,2).join(' / '))}</span></span><strong>${esc(n.title)}</strong><small>${n.fromBook?'课本标题':'导图分支'} · ${esc(n.sourceIds.length>1?n.sourceIds.length+' 个相关范围':'PDF '+range(s))}</small></span>${icon('arrow')}</button>`;}
function results(){if(browse.searchMode==='notes')return EbookTools.homeResults();const hits=search();return `${scopes()}<div class="search-heading"><h1>查找结果</h1><span>${hits.length} 个位置</span></div>${hits.length?`<div class="search-results">${hits.slice(0,browse.limit).map(result).join('')}</div>${hits.length>browse.limit?'<button class="more" data-action="more">显示更多结果</button>':''}`:'<div class="empty">没有找到这个名称。试试更短的关键词或英文缩写。</div>'}`;}
function render(){recentOpen=false;app.innerHTML=`<header class="app-header"><div class="header-inner"><button class="brand" data-action="home" aria-label="Naidamn 首页"><img src="brand/naidamn.png" alt=""><span><b>Naidamn</b><small>王道 408 · 知识点定位</small></span></button><span class="header-note"><i></i>四科课本 · 离线查找</span></div></header><main class="workspace">${sectionNav()}<div class="section-body"><div class="search-kind home-search-kind" role="group" aria-label="首页检索类型"><button data-action="home-search-kind" data-id="knowledge" aria-pressed="${browse.searchMode!=='notes'}">知识点</button><button data-action="home-search-kind" data-id="notes" aria-pressed="${browse.searchMode==='notes'}">笔记标签</button></div><div class="search-area"><label class="search-box" for="search">${icon('search')}<input id="search" type="search" value="${esc(browse.query)}" placeholder="${browse.searchMode==='notes'?'输入笔记标签，留空查看全部笔记':'输入知识点名称，如 KMP、快表、三次握手'}" aria-label="${browse.searchMode==='notes'?'搜索笔记标签':'搜索知识点'}" aria-controls="recent-searches" aria-expanded="false" autocomplete="off"><button data-action="clear" type="button" aria-label="清空搜索">${icon('close')}</button></label><div id="recent-searches"></div></div><div class="lookup-layout">${sidebar()}<section class="main-content" id="content" aria-live="polite">${browse.searchMode==='notes'||browse.query.trim()?results():mapContent()}</section></div></div><footer>四科王道课本 · 离线查找与阅读</footer></main>`;if(currentSection!=='lookup')document.querySelector('.section-body').innerHTML=currentSection==='books'?libraryContent():currentSection==='settings'?settingsContent():frequencyContent();}
function updateContent(){document.getElementById('content').innerHTML=browse.searchMode==='notes'||browse.query.trim()?results():mapContent();}
function openNode(id){const n=nodes[id];openRanges(sourceIds(n),topicName(n),[subjectNames[n.subject],...(n.path||[]).slice(-2).map(s=>s.split('\n')[0])].join(' / '));}
function openRanges(ids,title,path){if(!ids.length)return;activeReader={ids,title,path,selected:0,page:sourceById[ids[0]].page,zoom:1};history.pushState({lookupReader:true},'',location.href);renderReader();}
function closeReader(){if(!activeReader||!EbookTools.canNavigate())return;if(history.state?.lookupReader)history.back();else{activeReader=null;clearReaderPosition();renderReader();}}
window.handleBack=()=>{if(EbookTools.back())return true;if(document.querySelector('.weekly-report'))return true;if(recentOpen&&!activeReader){hideRecent();return true;}if(currentSection!=='lookup'&&!activeReader){currentSection='lookup';render();return true;}if(activeReader){closeReader();return true;}if(browse.query){browse.query='';render();return true;}return false;};
window.addEventListener('popstate',()=>{activeReader=null;clearReaderPosition();renderReader();});
function renderReader(){EbookTools.unmount();readerGestureController?.destroy();readerGestureController=null;document.querySelector('.book-reader')?.remove();document.body.classList.toggle('reading',!!activeReader);if(!activeReader){if(currentSection==='books'||browse.searchMode==='notes')render();return;}const r=activeReader,s=readerSource(),book=books[s.subject];const el=document.createElement('section');el.className='book-reader';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','王道课本阅读器');el.innerHTML=`<header class="reader-header"><button class="icon-button" data-action="close-reader" aria-label="${r.mode==='ebook'?'返回书架':'返回知识点'}">${icon('back')}</button><div class="reader-title"><strong>${esc(r.title)}</strong><small>${esc(book.name)} · ${r.mode==='ebook'?'完整电子书':'对应 PDF '+range(s)+' 页'}</small></div><output class="reader-zoom" aria-label="缩放比例">${Math.round(r.zoom*100)}%</output></header>${EbookTools.toolbar()}${r.mode==='ebook'?'':`<div class="reader-range"><span>${esc(s.title)}</span>${r.ids.length>1?`<label>切换相关范围<select id="range-select" aria-label="切换相关课本范围">${r.ids.map((id,i)=>`<option value="${i}" ${i===r.selected?'selected':''}>${esc(sourceById[id].title)} · PDF ${range(sourceById[id])}</option>`).join('')}</select></label>`:''}</div>`}<div class="reader-scroll" tabindex="0" aria-label="课本页面，可双指缩放，按设置方向滑动翻页，放大后拖动查看"><div class="reader-stage"></div></div><div class="reader-controls"><label class="page-jump">PDF <input id="page-number" type="number" value="${r.page}" min="1" max="${book.pages}" aria-label="跳转 PDF 页码"> / ${book.pages}</label><button data-action="jump-page">跳转</button></div><div class="reader-caption"><span class="reader-context" role="status">${r.mode==='ebook'?'完整原书 · 页码含封面与前言':'页码含封面与前言 · 金色框为该知识点在本页的范围'}</span><span class="reader-gesture-hint">任意缩放均可翻页 · 到页边后继续滑动 · ${settings.swipe==='horizontal'?'左右翻页':settings.swipe==='vertical'?'上下滑至页边翻页':'左右翻页／上下滑至页边翻页'}</span></div>`;document.body.append(el);loadPage();const viewport=el.querySelector('.reader-scroll');viewport.addEventListener('scroll',saveReaderPosition,{passive:true});readerGestureController=installReaderGestures(viewport);EbookTools.mount();saveReaderPosition();}
function loadPage(){const r=activeReader;if(!r)return;const s=readerSource(),stage=document.querySelector('.reader-stage'),view=document.querySelector('.reader-scroll');const width=Math.round(Math.min(innerWidth-24,1000)*r.zoom);stage.style.width=width+'px';const image=document.createElement('img');image.id='page-image';image.alt=books[s.subject].name+'，PDF 第 '+r.page+' 页';image.draggable=false;const area=s.regions.find(x=>x.page===r.page);stage.append(image);if(area){const box=document.createElement('div');box.className='range-highlight';box.style.top=area.top/area.height*100+'%';box.style.height=(area.bottom-area.top)/area.height*100+'%';box.setAttribute('aria-label',s.title+'对应范围');stage.append(box);}else if(r.mode!=='ebook')document.querySelector('.reader-context').textContent='当前为相邻上下文页 · 对应范围在 PDF '+range(s)+' 页';image.onload=()=>{if(document.getElementById('page-image')!==image)return;requestAnimationFrame(()=>{if(document.getElementById('page-image')!==image)return;centerReaderPage();
if(r.restorePosition){view.scrollTop=r.restorePosition.top*stage.offsetWidth;view.scrollLeft=r.restorePosition.left*stage.offsetWidth;delete r.restorePosition;}
else if(view.dataset.interacted!=='true')view.scrollTop=area?Math.max(0,image.getBoundingClientRect().height*area.top/area.height-24):0;
if(r.noteFocus!==undefined){view.scrollTop=Math.max(0,image.getBoundingClientRect().height*r.noteFocus-40);delete r.noteFocus;}saveReaderPosition();});};image.onerror=()=>{if(document.getElementById('page-image')!==image)return;stage.innerHTML='<div class="image-error">页面暂未载入。<button data-action="retry-page">重新加载</button></div>';};image.src='books/'+s.subject+'/'+r.page+'.webp';}
function readerBaseWidth(){return Math.min(innerWidth-24,1000);}
function updateReaderZoomControls(){
 if(!activeReader)return;
 const el=document.querySelector('.book-reader');
 if(!el)return;
 el.querySelector('.reader-zoom').textContent=Math.round(activeReader.zoom*100)+'%';
}
function setReaderZoom(value,focus,anchor){
 const r=activeReader,stage=document.querySelector('.reader-stage'),view=document.querySelector('.reader-scroll');
 if(!r||!stage||!view)return;
 const before=stage.getBoundingClientRect(),viewport=view.getBoundingClientRect();
 focus=focus||{x:viewport.left+view.clientWidth/2,y:viewport.top+view.clientHeight/2};
 anchor=anchor||{x:(focus.x-before.left)/before.width,y:(focus.y-before.top)/before.width};
 const bounded=Math.max(READER_ZOOM_MIN,Math.min(READER_ZOOM_MAX,value));
 // Snap tiny pinch noise around the natural fit width.
 r.zoom=Math.abs(bounded-1)<.005?1:bounded;
 const width=Math.round(readerBaseWidth()*r.zoom);
 view.dataset.interacted='true';stage.style.width=width+'px';centerReaderPage();
 const after=stage.getBoundingClientRect();
 view.scrollLeft+=after.left+anchor.x*width-focus.x;
 view.scrollTop+=after.top+anchor.y*width-focus.y;
 updateReaderZoomControls();saveReaderPosition();
}
function turnReaderPage(direction,gesture=false){
 if(!activeReader||!EbookTools.canNavigate())return false;
 const s=readerSource(),next=activeReader.page+direction;
 if(next<1||next>books[s.subject].pages){
  if(gesture)document.querySelector('.reader-context').textContent=next<1?'已经是第一页':'已经是最后一页';
  return false;
 }
 activeReader.page=next;renderReader();return true;
}
function installReaderGestures(view){
 const reader=activeReader,stage=view.querySelector('.reader-stage');
 let mode='idle',pan=null,pinch=null,multi=false,frame=0,pending=null,inertia=0,blocked=false;
 const live=()=>activeReader===reader&&view.isConnected;
 const ready=()=>live()&&!EbookTools.isDrawing()&&view.querySelector('#page-image')?.naturalWidth>0;
 const point=t=>({id:t.identifier,x:t.clientX,y:t.clientY});
 const middle=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function stopInertia(){cancelAnimationFrame(inertia);inertia=0;}
 function flush(){
  cancelAnimationFrame(frame);frame=0;
  const action=pending;pending=null;
  if(action&&live())action();
 }
 function schedule(action){pending=action;if(!frame)frame=requestAnimationFrame(flush);}
 function cancel(){
  stopInertia();cancelAnimationFrame(frame);frame=0;pending=null;
  mode='idle';pan=null;pinch=null;multi=false;blocked=false;
 }
 function startPan(t,canFlip){
  const p=point(t),now=performance.now();
  mode='pan';pinch=null;
  pan={...p,startX:p.x,startY:p.y,left:view.scrollLeft,top:view.scrollTop,
   started:now,last:now,vx:0,vy:0,axis:null,canFlip,moved:false,atLeft:view.scrollLeft<=2,atRight:view.scrollLeft>=view.scrollWidth-view.clientWidth-2,atTop:view.scrollTop<=2,atBottom:view.scrollTop>=view.scrollHeight-view.clientHeight-2};
 }
 function startPinch(touches){
  flush();multi=true;mode='pinch';pan=null;
  const a=point(touches[0]),b=point(touches[1]),center=middle(a,b),rect=stage.getBoundingClientRect();
  pinch={ids:[a.id,b.id],distance:Math.max(1,distance(a,b)),zoom:reader.zoom,
   anchor:{x:(center.x-rect.left)/rect.width,y:(center.y-rect.top)/rect.width}};
 }
 function coast(vx,vy){
  if(Math.hypot(vx,vy)<.08)return;
  let last=performance.now(),began=last;
  const tick=now=>{
   if(!live())return;
   const dt=Math.min(32,now-last);last=now;
   const x=view.scrollLeft,y=view.scrollTop;
   view.scrollLeft+=vx*dt;view.scrollTop+=vy*dt;
   if(Math.abs(view.scrollLeft-x)<.1)vx=0;
   if(Math.abs(view.scrollTop-y)<.1)vy=0;
   const decay=Math.exp(-dt/220);vx*=decay;vy*=decay;
   if(Math.hypot(vx,vy)>.035&&now-began<1400)inertia=requestAnimationFrame(tick);
   else inertia=0;
  };
  inertia=requestAnimationFrame(tick);
 }
 function start(event){
  if(!ready())return;
  event.preventDefault();stopInertia();flush();view.dataset.interacted='true';
  const touches=event.touches;
  if(touches.length>2){blocked=true;multi=true;mode='idle';pan=null;pinch=null;return;}
  if(blocked)return;
  if(touches.length===2)startPinch(touches);
  else if(touches.length===1){multi=false;startPan(touches[0],!EbookTools.isEditing());}
 }
 function move(event){
  if(!live()||mode==='idle'||blocked)return;
  event.preventDefault();
  if(event.touches.length>2){flush();blocked=true;multi=true;mode='idle';return;}
  if(event.touches.length===2){
   const touches=Array.from(event.touches);
   if(mode!=='pinch'||!pinch.ids.every(id=>touches.some(t=>t.identifier===id)))startPinch(touches);
   const a=point(touches.find(t=>t.identifier===pinch.ids[0])),b=point(touches.find(t=>t.identifier===pinch.ids[1]));
   const value=pinch.zoom*distance(a,b)/pinch.distance,center=middle(a,b),anchor=pinch.anchor;
   schedule(()=>setReaderZoom(value,center,anchor));return;
  }
  if(mode!=='pan'||event.touches.length!==1)return;
  const p=point(event.touches[0]);if(p.id!==pan.id)return;
  const now=performance.now(),dt=Math.max(1,now-pan.last),dx=p.x-pan.startX,dy=p.y-pan.startY;
  if(!pan.axis&&Math.hypot(dx,dy)>10){
   if(Math.abs(dx)>Math.abs(dy)*1.4)pan.axis='x';
   else if(Math.abs(dy)>Math.abs(dx)*1.4)pan.axis='y';
  }
  const vx=Math.max(-2.5,Math.min(2.5,(pan.x-p.x)/dt)),vy=Math.max(-2.5,Math.min(2.5,(pan.y-p.y)/dt));
  pan.vx=.45*pan.vx+.55*vx;pan.vy=.45*pan.vy+.55*vy;
  pan.x=p.x;pan.y=p.y;pan.last=now;pan.moved=pan.moved||Math.hypot(dx,dy)>10;
  const x=pan.left-dx,y=pan.top-dy,axis=pan.axis,zoom=reader.zoom;
  schedule(()=>{
   if(zoom>1.001){view.scrollLeft=x;view.scrollTop=y;}
   else if(axis!=='x')view.scrollTop=y;
  });
 }
 function end(event){
  if(!live())return;
  if(mode!=='idle')event.preventDefault();
  flush();
  if(blocked){if(!event.touches.length)cancel();return;}
  if(event.touches.length===2){startPinch(event.touches);return;}
  if(event.touches.length===1){multi=true;startPan(event.touches[0],false);return;}
  const ended=pan,wasMulti=multi;
  mode='idle';pan=null;pinch=null;multi=false;
  if(!ended)return;
  const dx=ended.x-ended.startX,dy=ended.y-ended.startY,now=performance.now();
  const threshold=Math.max(72,Math.min(120,view.clientWidth*.12));
  const horizontal=settings.swipe!=='vertical'&&ended.axis==='x'&&Math.abs(dx)>=threshold&&Math.abs(dx)>Math.abs(dy)*1.8&&(dx<0?ended.atRight:ended.atLeft);
  const vertical=settings.swipe!=='horizontal'&&ended.axis==='y'&&Math.abs(dy)>=threshold&&Math.abs(dy)>Math.abs(dx)*1.8&&
   (dy<0?ended.atBottom:ended.atTop);
  if(!wasMulti&&ended.canFlip&&(horizontal||vertical)&&now-ended.started<=650){
   turnReaderPage((horizontal?dx:dy)<0?1:-1,true);return;
  }
  if(ended.moved&&now-ended.last<90){
   const zoomed=reader.zoom>1.001;
   coast(zoomed?ended.vx:0,zoomed||ended.axis!=='x'?ended.vy:0);
  }
 }
 view.addEventListener('touchstart',start,{passive:false});
 view.addEventListener('touchmove',move,{passive:false});
 view.addEventListener('touchend',end,{passive:false});
 view.addEventListener('touchcancel',cancel,{passive:false});
 window.addEventListener('blur',cancel);
 return {cancel,destroy(){
  cancel();view.removeEventListener('touchstart',start);view.removeEventListener('touchmove',move);
  view.removeEventListener('touchend',end);view.removeEventListener('touchcancel',cancel);window.removeEventListener('blur',cancel);
 }};
}
function jumpPage(){if(!EbookTools.canNavigate())return;const n=Number(document.getElementById('page-number').value),s=readerSource();if(!Number.isInteger(n)||n<1||n>books[s.subject].pages){document.getElementById('page-number').setCustomValidity('请输入 1 至 '+books[s.subject].pages+' 的整数');document.getElementById('page-number').reportValidity();return;}activeReader.page=n;renderReader();}
document.addEventListener('input',e=>{if(e.target.id==='search'){browse.query=e.target.value;browse.limit=60;updateContent();hideRecent();}if(e.target.id==='page-number')e.target.setCustomValidity('');});
document.addEventListener('change',e=>{if(e.target.id==='search')rememberSearch();if(e.target.id==='chapter'){browse.chapter=e.target.value;updateContent();}if(e.target.id==='range-select'){activeReader.selected=Number(e.target.value);activeReader.page=readerSource().page;activeReader.zoom=1;renderReader();}});
document.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b||b.disabled)return;const id=b.dataset.id;if(b.classList.contains('search-result'))recordSearch();switch(b.dataset.action){case 'home-search-kind':browse.searchMode=id;browse.query='';browse.limit=60;render();break;case 'recent-use':useRecent(id);break;case 'recent-delete':recentSearches=recentSearches.filter(x=>normal(x)!==id);saveRecent();renderRecent();break;case 'recent-clear':recentClearPending=true;renderRecent();break;case 'recent-cancel':recentClearPending=false;renderRecent();break;case 'recent-confirm':recentSearches=[];saveRecent();recentClearPending=false;renderRecent();break;case 'setting-toggle':settings[id]=!settings[id];saveSettings();render();break;case 'setting-swipe':settings.swipe=id;saveSettings();render();break;case 'section':currentSection=id;clearPending=false;render();break;case 'open-book':openBook(id);break;case 'clear-frequency':clearPending=true;render();break;case 'cancel-clear':clearPending=false;render();break;case 'confirm-clear':frequency.entries={};clearPending=false;saveFrequency();render();break;case 'finish-report':finishReport();break;case 'home':currentSection='lookup';case 'clear':browse.query='';render();document.getElementById('search').focus();break;case 'subject':browse.subject=id;browse.chapter=maps[id].chapters[0];browse.query='';render();break;case 'chapter':browse.chapter=id;browse.subject=nodes[id].subject;browse.query='';render();break;case 'expand':if(browse.open.has(id))browse.open.delete(id);else browse.open.add(id);updateContent();document.querySelector(`[data-action="expand"][data-id="${id}"]`)?.focus();break;case 'scope':browse.scope=id;browse.limit=60;updateContent();break;case 'open-node':openNode(id);break;case 'open-source':openRanges([id],sourceById[id].title,sourceById[id].chapter);break;case 'more':browse.limit+=60;updateContent();break;case 'close-reader':closeReader();break;case 'jump-page':jumpPage();break;case 'retry-page':renderReader();break;}});
document.addEventListener('keydown',e=>{if(e.target.id==='search'&&e.key==='Enter'){rememberSearch();hideRecent();}if(e.key==='Escape'&&recentOpen){hideRecent();return;}if(document.querySelector('.weekly-report')||EbookTools.hasPanel())return;if(activeReader&&!['INPUT','SELECT'].includes(e.target.tagName)){if(e.key==='ArrowRight'){e.preventDefault();turnReaderPage(1);}if(e.key==='ArrowLeft'){e.preventDefault();turnReaderPage(-1);}}if(e.key==='Escape'&&activeReader)closeReader();if(e.key==='Enter'&&e.target.id==='page-number')jumpPage();});
window.addEventListener('resize',()=>{
 readerGestureController?.cancel();
 if(!activeReader)return;
 const stage=document.querySelector('.reader-stage'),view=document.querySelector('.reader-scroll');
 if(!stage||!view)return;
 const previous=stage.offsetWidth,next=Math.round(Math.min(innerWidth-24,1000)*activeReader.zoom);
 if(!previous)return;
 const top=view.scrollTop/previous,left=view.scrollLeft/previous;
 stage.style.width=next+'px';centerReaderPage();
 view.scrollTop=top*next;view.scrollLeft=left*next;saveReaderPosition();
});
const SETTINGS_KEY='naidamn-settings-v1',RECENT_KEY='naidamn-recent-searches-v1';
function readLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
const storedSettings=readLocal(SETTINGS_KEY,{});
const settings={recent:storedSettings?.recent!==false,frequency:storedSettings?.frequency!==false,swipe:['both','horizontal','vertical'].includes(storedSettings?.swipe)?storedSettings.swipe:'both'};
let recentSearches=readLocal(RECENT_KEY,[]);
recentSearches=Array.isArray(recentSearches)?[...new Map(recentSearches.filter(x=>typeof x==='string'&&normal(x)).map(x=>[normal(x),x])).values()].slice(0,5):[];
let recentOpen=false,recentClearPending=false;
function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}}
function saveRecent(){try{localStorage.setItem(RECENT_KEY,JSON.stringify(recentSearches));}catch{}}
function rememberSearch(){if(browse.searchMode==='notes')return;const query=browse.query.trim();if(!normal(query))return;recentSearches=[query,...recentSearches.filter(x=>normal(x)!==normal(query))].slice(0,5);saveRecent();}
function hideRecent(){recentOpen=false;recentClearPending=false;renderRecent();}
function renderRecent(){
 const host=document.getElementById('recent-searches');if(!host)return;
 const visible=recentOpen&&settings.recent;
 document.getElementById('search')?.setAttribute('aria-expanded',String(visible));
 host.innerHTML=visible?`<section class="recent-panel" aria-label="最近搜索"><div class="recent-heading"><strong>最近搜索</strong>${recentSearches.length?'<button data-action="recent-clear">清空全部</button>':''}</div>${recentClearPending?'<div class="recent-confirm"><span>清空全部最近搜索？</span><button data-action="recent-cancel">取消</button><button data-action="recent-confirm">确认清空</button></div>':''}${recentSearches.length?`<ul>${recentSearches.map(query=>`<li><button class="recent-use" data-action="recent-use" data-id="${esc(normal(query))}">${icon('search')}<span>${esc(query)}</span></button><button class="recent-delete" data-action="recent-delete" data-id="${esc(normal(query))}" aria-label="删除最近搜索 ${esc(query)}">删除</button></li>`).join('')}</ul>`:'<p class="recent-empty">暂无最近搜索</p>'}</section>`:'';
}
function showRecent(){if(settings.recent&&browse.searchMode!=='notes'){recentOpen=true;recentClearPending=false;renderRecent();}}
function useRecent(id){const query=recentSearches.find(x=>normal(x)===id);if(!query)return;browse.query=query;browse.limit=60;document.getElementById('search').value=query;rememberSearch();hideRecent();updateContent();}
document.addEventListener('focusin',e=>{if(e.target.id==='search')showRecent();else if(!e.target.closest('.search-area'))hideRecent();});
document.addEventListener('click',e=>{if(e.target.id==='search')showRecent();else if(!e.target.closest('.search-area'))hideRecent();},true);
function settingsContent(){return `<div class="content-heading"><div><span class="eyebrow">此设备的使用偏好</span><h1>设置</h1><p>设置自动保存，两种阅读入口共用翻页偏好。</p></div></div><div class="settings-list"><section class="setting-row"><div><h2>弹出最近搜索</h2><p>点击搜索框显示最近 5 条。关闭仅隐藏弹出列表，不清除历史。</p></div><button role="switch" aria-checked="${settings.recent}" aria-label="弹出最近搜索" data-action="setting-toggle" data-id="recent">${settings.recent?'已开启':'已关闭'}</button></section><section class="setting-row"><div><h2>频率记录及通知</h2><p>关闭后停止记录搜索次数，也不再弹出周末报告。已有记录可在搜索频率板块清空。</p></div><button role="switch" aria-checked="${settings.frequency}" aria-label="频率记录及通知" data-action="setting-toggle" data-id="frequency">${settings.frequency?'已开启':'已关闭'}</button></section><section class="setting-row swipe-setting"><div><h2>滑动翻页方向</h2><p>所有缩放比例均生效。页内拖动查看，到对应页边后再次滑动翻页；整页可见时直接滑动翻页。</p></div><div class="swipe-options" role="group" aria-label="滑动翻页方向">${[['both','上下和左右'],['vertical','仅上下'],['horizontal','仅左右']].map(([id,label])=>`<button data-action="setting-swipe" data-id="${id}" aria-pressed="${settings.swipe===id}">${label}</button>`).join('')}</div></section></div>`;}
// A small checkpoint survives Android Activity/WebView recreation during rotation.
const READER_POSITION_KEY='naidamn-reader-position-v1';
function centerReaderPage(){
 const stage=document.querySelector('.reader-stage'),view=document.querySelector('.reader-scroll'),image=document.getElementById('page-image');
 if(!stage||!view)return;
 const height=image?.naturalWidth?stage.offsetWidth*image.naturalHeight/image.naturalWidth:0;
 stage.style.marginTop=height?Math.max(0,(view.clientHeight-24-height)/2)+'px':'0px';
}
function saveReaderPosition(){
 if(!activeReader)return;
 const stage=document.querySelector('.reader-stage'),view=document.querySelector('.reader-scroll');
 const position=activeReader.restorePosition||{top:stage?.offsetWidth?view.scrollTop/stage.offsetWidth:0,left:stage?.offsetWidth?view.scrollLeft/stage.offsetWidth:0};
 try{localStorage.setItem(READER_POSITION_KEY,JSON.stringify({reader:{...activeReader,restorePosition:position},section:currentSection,browse:{...browse,open:[...browse.open]}}));}catch{}
}
function clearReaderPosition(){try{localStorage.removeItem(READER_POSITION_KEY);}catch{}}
function restoreReaderPosition(){
 try{
  const saved=JSON.parse(localStorage.getItem(READER_POSITION_KEY)||'null'),r=saved?.reader;if(!r)return;
  if(r.mode==='ebook'){if(!books[r.subject])throw Error('book');}
  else if(!Array.isArray(r.ids)||!r.ids.length||!r.ids.every(id=>sourceById[id])||!Number.isInteger(r.selected)||!r.ids[r.selected])throw Error('range');
  const book=books[r.mode==='ebook'?r.subject:sourceById[r.ids[r.selected]].subject];
  if(!Number.isInteger(r.page)||r.page<1||r.page>book.pages||!Number.isFinite(r.zoom)||r.zoom<READER_ZOOM_MIN||r.zoom>READER_ZOOM_MAX)throw Error('page');
  const position=r.restorePosition;
  if(!position||!Number.isFinite(position.top)||!Number.isFinite(position.left)||position.top<0||position.left<0)delete r.restorePosition;
  const b=saved.browse;
  if(b&&maps[b.subject]&&maps[b.subject].chapters.includes(b.chapter)){
   Object.assign(browse,{subject:b.subject,chapter:b.chapter,query:typeof b.query==='string'?b.query:'',searchMode:b.searchMode==='notes'?'notes':'knowledge',scope:b.scope==='all'||maps[b.scope]?b.scope:'all',open:new Set((Array.isArray(b.open)?b.open:[]).filter(id=>nodes[id]))});
  }
  currentSection=['lookup','books','frequency'].includes(saved.section)?saved.section:'lookup';activeReader=r;render();
  if(!history.state?.lookupReader)history.pushState({lookupReader:true},'',location.href);
  renderReader();
 }catch{clearReaderPosition();activeReader=null;}
}
window.addEventListener('pagehide',saveReaderPosition);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveReaderPosition();});
// New records have their own key; historical application records remain untouched.
const FREQUENCY_KEY='naidamn-search-frequency-v1';
let storageFailed=false;
function readFrequency(){
 try{
  const raw=JSON.parse(localStorage.getItem(FREQUENCY_KEY)||'null');
  const clean={entries:{},reported:typeof raw?.reported==='string'?raw.reported:''};
  for(const [key,value] of Object.entries(raw?.entries||{})){
   if(value&&typeof value.label==='string'&&Number.isSafeInteger(value.count)&&value.count>0)
    clean.entries[key]={label:value.label,count:value.count};
  }
  return clean;
 }catch{storageFailed=true;return {entries:{},reported:''};}
}
let frequency=readFrequency(),reportSnapshot=null;
function saveFrequency(){try{localStorage.setItem(FREQUENCY_KEY,JSON.stringify(frequency));storageFailed=false;}catch{storageFailed=true;}}
function recordSearch(){
 rememberSearch();hideRecent();if(!settings.frequency)return;
 const label=browse.query.trim(),key=normal(label);if(!key)return;
 const previous=frequency.entries[key];
 frequency.entries[key]={label:previous?.label||label,count:(previous?.count||0)+1};saveFrequency();
}
function sectionNav(){return `<nav class="section-nav" aria-label="主要板块">${[['lookup','知识点查找'],['books','电子书'],['frequency','搜索频率'],['settings','设置']].map(([id,label])=>`<button data-action="section" data-id="${id}" aria-pressed="${currentSection===id}">${label}</button>`).join('')}</nav>`;}
function libraryContent(){return `<div class="content-heading"><div><span class="eyebrow">离线书架</span><h1>四科电子书</h1><p>完整原书阅读，不添加知识点范围标注。</p></div></div><div class="book-shelf">${Object.values(books).map((b,i)=>`<button class="book-tile" data-action="open-book" data-id="${b.id}"><span class="book-number">0${i+1}</span>${icon('book')}<strong>${esc(subjectNames[b.id])}</strong><small>${esc(b.name)} · ${b.pages} 页</small><span>打开电子书 →</span></button>`).join('')}</div>${EbookTools.exportControls()}`;}
function frequencyRows(entries){return Object.values(entries).filter(e=>e.count>0).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'zh-CN')).map((e,i)=>`<li><span class="frequency-rank">${i+1}</span><strong>${esc(e.label)}</strong><span class="frequency-count">${e.count} 次</span></li>`).join('');}
function frequencyContent(){const rows=frequencyRows(frequency.entries);return `<div class="content-heading"><div><span class="eyebrow">仅保存在此设备</span><h1>搜索频率</h1><p>输入搜索词并打开一个搜索结果，计为一次；仅输入或浏览目录不计数。</p></div></div><p class="frequency-note">${settings.frequency?'每周六 10:30 起至周日结束，首次进入显示本轮报告。':'频率记录及通知已关闭，不再新增计数或弹出报告；已有记录保留。'}点击“结束报告并清空”后开始新的记录。</p>${storageFailed?'<p role="alert">本地存储暂不可用，当前记录可能无法在重启后保留。</p>':''}${rows?`<ol class="frequency-list">${rows}</ol>${clearPending?'<div class="clear-confirm" role="group" aria-label="确认清空记录"><p>确定清空所有搜索频率记录？</p><button class="clear-frequency" data-action="cancel-clear">取消</button> <button class="clear-frequency" data-action="confirm-clear">确认清空</button></div>':'<button class="clear-frequency" data-action="clear-frequency">清空频率记录</button>'}`:'<div class="empty">还没有搜索频率记录。</div>'}`;}
function readerSource(){return activeReader.mode==='ebook'?{subject:activeReader.subject,regions:[],title:books[activeReader.subject].name,page:1,endPage:books[activeReader.subject].pages}:sourceById[activeReader.ids[activeReader.selected]];}
function openBook(subject){if(!books[subject])return;activeReader={mode:'ebook',subject,ids:[],selected:0,title:subjectNames[subject],page:1,zoom:1};history.pushState({lookupReader:true},'',location.href);renderReader();}
function weekendKey(now){
 const day=now.getDay();if(day!==6&&day!==0)return '';
 if(day===6&&(now.getHours()*60+now.getMinutes()<630))return '';
 const saturday=new Date(now);if(day===0)saturday.setDate(saturday.getDate()-1);
 return saturday.getFullYear()+'-'+String(saturday.getMonth()+1).padStart(2,'0')+'-'+String(saturday.getDate()).padStart(2,'0');
}
function checkWeeklyReport(){
 if(!settings.frequency)return;
 const key=weekendKey(new Date());if(!key||frequency.reported===key||reportSnapshot)return;
 reportSnapshot={key,entries:JSON.parse(JSON.stringify(frequency.entries))};
 const dialog=document.createElement('dialog');dialog.className='weekly-report';
 dialog.setAttribute('aria-labelledby','report-title');
 const entries=Object.values(reportSnapshot.entries),total=entries.reduce((sum,e)=>sum+e.count,0);
 dialog.innerHTML=`<span class="eyebrow">本轮搜索回顾 · ${key}</span><h1 id="report-title">搜索频率报告</h1><p>共 ${total} 次有效搜索，${entries.length} 个搜索词。</p><div class="report-body">${total?`<ol class="frequency-list">${frequencyRows(reportSnapshot.entries)}</ol>`:'<div class="empty">本轮暂无搜索记录。</div>'}</div><p class="frequency-note">结束报告后自动清空本轮频率记录；本周末不会再次弹出。</p><button data-action="finish-report">结束报告并清空</button>`;
 dialog.addEventListener('cancel',e=>e.preventDefault());document.body.append(dialog);dialog.showModal();
}
function finishReport(){
 if(!reportSnapshot)return;
 // Subtract only the displayed snapshot, preserving any later increments.
 for(const [key,value] of Object.entries(reportSnapshot.entries)){
  const entry=frequency.entries[key];if(!entry)continue;
  entry.count-=value.count;if(entry.count<=0)delete frequency.entries[key];
 }
 frequency.reported=reportSnapshot.key;saveFrequency();reportSnapshot=null;
 document.querySelector('.weekly-report')?.remove();render();
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkWeeklyReport();});
window.addEventListener('pageshow',checkWeeklyReport);
window.addEventListener('focus',checkWeeklyReport);
render();
restoreReaderPosition();
checkWeeklyReport();
