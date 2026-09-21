import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const pageSource=readFileSync(new URL('../src/v267/pages/rental-contracts.js',import.meta.url),'utf8');
const source=pageSource.replace(/^import .*;$/gm,'').replace(/\bexport /g,'');

function fixture({width=360,height=100}={}){
 const cleanups=[],observers=[];let closed=false,checks=0;
 const doc={createTreeWalker(root){let used=false;return {nextNode(){if(used)return null;used=true;return {textContent:root.textContent};}};},createRange(){let root,start=0,end;return {selectNodeContents(value){root=value;end=value.textContent.length;},setStart(_node,offset){start=offset;},setEnd(_node,offset){end=offset;},cloneContents(){return node('#fragment',root.textContent.slice(start,end));}};}};
 class Element{
  constructor(tag,text=''){this.tag=tag;this._text=text;this.children=[];this.style={};this.dataset={};this.ownerDocument=doc;this.isConnected=true;this.className='';this.classList={contains:value=>this.className.split(' ').includes(value)};}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  set textContent(value){this._text=value;this.children=[];}
  get clientWidth(){return width;}
  get clientHeight(){return this.className==='aq267-contract-paper-content'?height:0;}
  get scrollHeight(){return Math.max(this.clientHeight,this.textContent.length);}
  get lastElementChild(){return this.children.at(-1);}
  setAttribute(name,value){this[name]=value;}
  append(...nodes){for(const child of nodes){child.remove();child.parentElement=this;this.children.push(child);}}
  replaceChildren(...nodes){for(const child of this.children)child.parentElement=null;this.children=[];this._text='';this.append(...nodes);}
  remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}}
  cloneNode(deep){const copy=node(this.tag,deep?this._text:'');copy.className=this.className;if(deep)copy.append(...this.children.map(x=>x.cloneNode(true)));return copy;}
  focus(){this.focused=true;}
 }
 const node=(tag,text='')=>new Element(tag,text),target=node('main');
 const d={session:{check(){checks++;if(closed)throw Error('closed');}},onDispose(fn){cleanups.push(fn);}};
 class ResizeObserver{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
 const context={node,translateStatic:x=>x,ResizeObserver};vm.createContext(context);vm.runInContext(source,context);
 const all=(root=target)=>[root,...root.children.flatMap(x=>all(x))];
 return {node,target,d,all,observers,context,get checks(){return checks;},setWidth:value=>{width=value;},close(){closed=true;for(const fn of cleanups)fn();},stale(){closed=true;},mount:html=>context.mountSavedContractViewer(d,target,html),paginate:(a,b)=>context.paginateSavedContract(a,b)};
}

test('saved contract opens at readable 100% on phones and never exposes clause editing',()=>{
 const f=fixture(),html='<article class="v267-contract-copy"><p>نص محفوظ كما هو</p></article>',viewer=f.mount(html),stage=f.all().find(x=>x.className==='aq267-contract-zoom-stage'),saved=f.all().find(x=>x.className==='aq267-contract-viewer-source');
 assert.equal(stage.style.zoom,'1');assert.equal(saved.innerHTML,html);assert.equal(f.all().find(x=>x.textContent==='100% — الحجم الأصلي')['aria-pressed'],'true');
 assert.equal(f.all().some(x=>['input','textarea'].includes(x.tag)||x.contentEditable),false);assert.equal(viewer.dataset.focus,'false');assert.equal(f.checks,0);
});

test('100%, 125%, 150% and fit affect display only and preserve the saved markup',()=>{
 const f=fixture(),html='<article>Original terms — شروط العقد</article>';f.mount(html);const byText=text=>f.all().find(x=>x.tag==='button'&&x.textContent===text),stage=f.all().find(x=>x.className==='aq267-contract-zoom-stage');
 byText('تكبير +').onclick();assert.equal(stage.style.zoom,'1.25');byText('تكبير +').onclick();assert.equal(stage.style.zoom,'1.5');
 f.setWidth(900);f.observers[0].fn();assert.equal(stage.style.zoom,'1.5');
 byText('ملاءمة العرض').onclick();assert.equal(Number(stage.style.zoom),(900-32)/794);f.setWidth(400);f.observers[0].fn();assert.equal(Number(stage.style.zoom),(400-32)/794);
 byText('100% — الحجم الأصلي').onclick();assert.equal(stage.style.zoom,'1');assert.equal(f.all().find(x=>x.className==='aq267-contract-viewer-source').innerHTML,html);
});

test('reading focus and Escape retain zoom and clear lifecycle handlers when closed',()=>{
 const f=fixture(),viewer=f.mount('<article>unchanged</article>'),larger=f.all().find(x=>x.textContent==='تكبير +'),focus=f.all().find(x=>x.textContent==='قراءة بملء الشاشة'),stage=f.all().find(x=>x.className==='aq267-contract-zoom-stage');larger.onclick();focus.onclick();
 assert.equal(viewer.dataset.focus,'true');assert.equal(stage.style.zoom,'1.25');assert.equal(focus.textContent,'إنهاء وضع القراءة');let prevented=false,stopped=false;viewer.onkeydown({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
 assert.equal(viewer.dataset.focus,'false');assert.equal(stage.style.zoom,'1.25');assert.ok(prevented&&stopped);assert.equal(focus.focused,true);f.close();assert.equal(larger.onclick,null);assert.equal(viewer.onkeydown,null);assert.equal(f.observers[0].disconnected,true);
});

test('a changed session cannot trigger viewer controls',()=>{
 const f=fixture();f.mount('<article>saved</article>');f.stale();assert.throws(()=>f.all().find(x=>x.textContent==='تكبير +').onclick(),/closed/);assert.equal(f.all().find(x=>x.className==='aq267-contract-zoom-stage').style.zoom,'1');
});

test('all 36 original clauses remain complete and in order across A4 pages',()=>{
 const f=fixture(),source=f.node('div'),article=f.node('article'),stage=f.node('div');article.className='v267-contract-copy';
 for(let i=1;i<=36;i++)article.append(f.node('p',i+'. بند العقد المحفوظ / Saved clause '+i+'\n'));
 source.append(article);const before=source.textContent;assert.equal(f.paginate(source,stage),true);assert.ok(stage.children.length>1);
 assert.equal(stage.children.map(sheet=>sheet.children[0].textContent).join(''),before);assert.equal(source.textContent,before);assert.equal(article.children.length,36);
 for(const [index,sheet]of stage.children.entries()){assert.ok(sheet.children[0].scrollHeight<=sheet.children[0].clientHeight+1);assert.equal(sheet.lastElementChild.textContent,'صفحة '+(index+1)+' / '+stage.children.length);assert.notEqual(sheet.children[0].children[0],article.children[0]);}
});

test('one clause taller than a page is split without dropping Arabic, English, whitespace or punctuation',()=>{
 const f=fixture(),source=f.node('div'),article=f.node('article'),stage=f.node('div'),text=('شروط محفوظة  —  English terms: 123.\n').repeat(40);article.className='v267-contract-copy';article.append(f.node('p',text));source.append(article);
 assert.equal(f.paginate(source,stage),true);assert.ok(stage.children.length>10);assert.equal(stage.children.map(sheet=>sheet.children[0].textContent).join(''),text);assert.equal(source.textContent,text);assert.ok(stage.children.every(sheet=>sheet.children[0].scrollHeight<=101));
});

test('unavailable layout keeps the original source readable instead of hiding it',()=>{
 const f=fixture({height:0}),source=f.node('div'),article=f.node('article'),stage=f.node('div');article.className='v267-contract-copy';article.append(f.node('p','saved clause'));source.append(article);
 assert.equal(f.paginate(source,stage),false);assert.equal(stage.children.length,0);assert.equal(source.textContent,'saved clause');assert.notEqual(source.hidden,true);
});

test('A4 layout allows positive horizontal scrolling rather than clipping large pages on tablets',()=>{
 const css=readFileSync(new URL('../src/v267/styles/saved-contract-viewer.css',import.meta.url),'utf8');assert.match(css,/\.aq267-contract-viewer-viewport\{[^}]*overflow:auto[^}]*direction:ltr/);assert.match(css,/\.aq267-contract-zoom-stage\{width:210mm;margin-inline:auto/);assert.match(css,/\.aq267-contract-paper\{height:297mm\}/);assert.doesNotMatch(css,/translate[XY]?\(-|overflow:hidden/);
 assert.match(pageSource,/mountSavedContractViewer\(d,d\.body,api\.contractMarkup\(c,1\)\)/);assert.match(pageSource,/mountSavedContractViewer\(d,d\.body,api\.contractMarkup\(existing,1\)\)/);assert.match(pageSource,/clauses:existing\?\.clauses\|\|template\.clauses/);
});
