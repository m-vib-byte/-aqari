'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'v209-global-search.js'),'utf8');

function activeContext(userId='user-a',workspaceId='workspace-a'){
  return {
    user:{id:userId},
    workspace:{id:workspaceId},
    membership:{is_active:true,user_id:userId,workspace_id:workspaceId,role:'property_manager'}
  };
}

function createClock(){
  let now=0;
  let nextId=1;
  const pending=new Map();

  function setTimeout(callback,delay=0,...args){
    const id=nextId++;
    pending.set(id,{id,time:now+Math.max(0,Number(delay)||0),callback,args});
    return id;
  }

  function clearTimeout(id){
    pending.delete(id);
  }

  function tick(milliseconds){
    const target=now+milliseconds;
    for(;;){
      let next=null;
      for(const task of pending.values()){
        if(task.time>target)continue;
        if(!next||task.time<next.time||(task.time===next.time&&task.id<next.id))next=task;
      }
      if(!next)break;
      pending.delete(next.id);
      now=next.time;
      next.callback(...next.args);
    }
    now=target;
  }

  return {setTimeout,clearTimeout,tick,pendingCount:()=>pending.size};
}

function createDom(){
  class FakeClassList{
    constructor(owner){this.owner=owner}
    add(...names){for(const name of names)this.owner._classes.add(String(name))}
    remove(...names){for(const name of names)this.owner._classes.delete(String(name))}
    contains(name){return this.owner._classes.has(String(name))}
  }

  class FakeHTMLElement{
    constructor(tagName='div',ownerDocument=null){
      this.tagName=String(tagName).toUpperCase();
      this.ownerDocument=ownerDocument;
      this.parentElement=null;
      this.children=[];
      this.attributes=new Map();
      this.dataset=Object.create(null);
      this._classes=new Set();
      this.classList=new FakeClassList(this);
      this._innerHTML='';
      this.textContent='';
      this.value='';
      this.placeholder='';
      this.id='';
      this.name='';
      this.type='';
      this.isContentEditable=false;
      this.listeners=new Map();
      this.focused=false;
      this.clicked=false;
      const values=Object.create(null);
      this.style={
        display:'',
        setProperty(name,value){values[String(name)]=String(value);this[String(name)]=String(value)},
        getPropertyValue(name){return values[String(name)]||''}
      };
    }

    get className(){return [...this._classes].join(' ')}
    set className(value){this._classes=new Set(String(value||'').split(/\s+/).filter(Boolean))}

    get innerHTML(){return this._innerHTML}
    set innerHTML(value){
      this._innerHTML=String(value==null?'':value);
      for(const child of this.children)child.parentElement=null;
      this.children=[];
      if(/id=["']v209SearchPeriod["']/.test(this._innerHTML)){
        const input=this.ownerDocument.createElement('input');
        input.id='v209SearchPeriod';
        input.type='month';
        const match=this._innerHTML.match(/id=["']v209SearchPeriod["'][^>]*\bvalue=["']([^"']*)["']/);
        input.value=match?match[1]:'';
        this.appendChild(input);
      }
    }

    appendChild(child){
      if(child.parentElement)child.remove();
      child.parentElement=this;
      if(!child.ownerDocument)child.ownerDocument=this.ownerDocument;
      this.children.push(child);
      return child;
    }

    replaceChildren(...children){
      for(const child of this.children)child.parentElement=null;
      this.children=[];
      this._innerHTML='';
      for(const child of children)this.appendChild(child);
    }

    remove(){
      if(!this.parentElement)return;
      const siblings=this.parentElement.children;
      const index=siblings.indexOf(this);
      if(index>=0)siblings.splice(index,1);
      this.parentElement=null;
    }

    setAttribute(name,value){
      name=String(name);
      value=String(value);
      this.attributes.set(name,value);
      if(name==='id')this.id=value;
      if(name==='class')this.className=value;
      if(name==='name')this.name=value;
      if(name.startsWith('data-')){
        const key=name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
        this.dataset[key]=value;
      }
    }

    getAttribute(name){
      name=String(name);
      if(name==='id')return this.id||null;
      if(name==='class')return this.className||null;
      if(name==='name')return this.name||null;
      return this.attributes.has(name)?this.attributes.get(name):null;
    }

    addEventListener(type,callback,options){
      const listeners=this.listeners.get(type)||[];
      listeners.push({callback,capture:options===true||Boolean(options?.capture)});
      this.listeners.set(type,listeners);
    }

    dispatchEvent(event){
      prepareEvent(event,this);
      const listeners=[...(this.listeners.get(event.type)||[])].sort((left,right)=>Number(right.capture)-Number(left.capture));
      for(const listener of listeners){
        listener.callback.call(this,event);
        if(event.immediatePropagationStopped)break;
      }
      return !event.defaultPrevented;
    }

    querySelector(selector){
      return descendants(this).find((node)=>matches(node,selector))||null;
    }

    querySelectorAll(selector){
      return descendants(this).filter((node)=>matches(node,selector));
    }

    closest(selector){
      if(selector==='#v209SearchResults [data-v209-action]'){
        let action=this;
        while(action&&!action.attributes.has('data-v209-action'))action=action.parentElement;
        if(!action)return null;
        let ancestor=action.parentElement;
        while(ancestor&&ancestor.id!=='v209SearchResults')ancestor=ancestor.parentElement;
        return ancestor?action:null;
      }
      let node=this;
      while(node){
        if(matches(node,selector))return node;
        node=node.parentElement;
      }
      return null;
    }

    focus(){this.focused=true}
    click(){this.clicked=true;this.dispatchEvent({type:'click'})}
  }

  class FakeHTMLInputElement extends FakeHTMLElement{
    constructor(ownerDocument){super('input',ownerDocument)}
  }
  class FakeHTMLTextAreaElement extends FakeHTMLElement{
    constructor(ownerDocument){super('textarea',ownerDocument)}
  }
  class FakeHTMLSelectElement extends FakeHTMLElement{
    constructor(ownerDocument){super('select',ownerDocument)}
  }

  function descendants(rootNode){
    const found=[];
    const visit=(node)=>{
      for(const child of node.children){found.push(child);visit(child)}
    };
    visit(rootNode);
    return found;
  }

  function matches(node,selector){
    if(selector.startsWith('#')&&!selector.includes(' '))return node.id===selector.slice(1);
    let match=selector.match(/^([a-z]+)?\[([^=\]]+)(?:=["']([^"']*)["'])?\]$/i);
    if(match){
      if(match[1]&&node.tagName!==match[1].toUpperCase())return false;
      const value=node.getAttribute(match[2]);
      return match[3]===undefined?value!==null:value===match[3];
    }
    return node.tagName===selector.toUpperCase();
  }

  function prepareEvent(event,target){
    if(!event.target)event.target=target;
    if(typeof event.preventDefault!=='function')event.preventDefault=function(){this.defaultPrevented=true};
    if(typeof event.stopImmediatePropagation!=='function')event.stopImmediatePropagation=function(){this.immediatePropagationStopped=true};
    event.defaultPrevented=Boolean(event.defaultPrevented);
    event.immediatePropagationStopped=false;
    return event;
  }

  class FakeDocument{
    constructor(){
      this.readyState='complete';
      this.listeners=new Map();
      this.queries=[];
      this.documentElement=new FakeHTMLElement('html',this);
      this.head=new FakeHTMLElement('head',this);
      this.body=new FakeHTMLElement('body',this);
      this.documentElement.appendChild(this.head);
      this.documentElement.appendChild(this.body);
    }

    createElement(tagName){
      switch(String(tagName).toLowerCase()){
        case 'input':return new FakeHTMLInputElement(this);
        case 'textarea':return new FakeHTMLTextAreaElement(this);
        case 'select':return new FakeHTMLSelectElement(this);
        default:return new FakeHTMLElement(tagName,this);
      }
    }

    getElementById(id){
      return descendants(this.documentElement).find((node)=>node.id===id)||null;
    }

    querySelector(selector){
      this.queries.push(selector);
      return descendants(this.documentElement).find((node)=>matches(node,selector))||null;
    }

    querySelectorAll(selector){
      this.queries.push(selector);
      return descendants(this.documentElement).filter((node)=>matches(node,selector));
    }

    addEventListener(type,callback){
      const listeners=this.listeners.get(type)||[];
      listeners.push(callback);
      this.listeners.set(type,listeners);
    }

    dispatchEvent(event){
      prepareEvent(event,this);
      for(const listener of this.listeners.get(event.type)||[]){
        listener.call(this,event);
        if(event.immediatePropagationStopped)break;
      }
      return !event.defaultPrevented;
    }
  }

  const document=new FakeDocument();
  return {
    document,
    HTMLElement:FakeHTMLElement,
    HTMLInputElement:FakeHTMLInputElement,
    HTMLTextAreaElement:FakeHTMLTextAreaElement,
    HTMLSelectElement:FakeHTMLSelectElement
  };
}

function record(overrides={}){
  return {
    key:'key-1',
    tenant:'مستأجر الهدف',
    unit:'101',
    contractNo:'C-101',
    hasContract:true,
    receiptNo:'',
    paymentStatus:'مسدد',
    balance:0,
    pending:0,
    billable:true,
    collectible:true,
    ...overrides
  };
}

function office(property,period,records,overrides={}){
  return {property,period,records,canRecordPayment:true,...overrides};
}

function createHarness(options={}){
  const dom=createDom();
  const clock=createClock();
  const document=dom.document;
  const calls={properties:0,data:[],open:[],action:[],refreshExpected:[]};
  let authCallback=null;

  const panel=document.createElement('section');
  panel.id='v199SearchPanel';
  document.body.appendChild(panel);

  const label=document.createElement('label');
  label.setAttribute('for','v199SearchInput');
  label.textContent='بحث';
  panel.appendChild(label);

  const input=document.createElement('input');
  input.id='v199SearchInput';
  panel.appendChild(input);

  const legacy=document.createElement('div');
  legacy.id='searchBox';
  document.body.appendChild(legacy);

  const trigger=document.createElement('button');
  trigger.setAttribute('data-v199-action','search');
  document.body.appendChild(trigger);

  if(options.readyWorkspace){
    const workspace=document.createElement('section');
    workspace.id='v202PropertyWorkspace';
    workspace.classList.add('on');
    document.body.appendChild(workspace);
    const title=document.createElement('h2');
    title.id='v202PropertyTitle';
    title.textContent=options.readyWorkspace;
    document.body.appendChild(title);
  }

  const context=options.context||activeContext();
  const gateScope=options.gateScope||{
    userId:context.user.id,
    workspaceId:context.workspace.id
  };
  const supabase={
    context,
    onAuthStateChange(callback){authCallback=callback;return {unsubscribe(){}}},
    refreshContext(expected){
      calls.refreshExpected.push(expected);
      return options.refreshContext?options.refreshContext.call(this,expected):Promise.resolve(this.context);
    }
  };

  const propertyNames=options.properties||['برج الأمان'];
  const propertyApi=options.rentOfficeProperties||function(){return propertyNames};
  const dataApi=options.rentOfficeData||function(name,period){return office(name,period,[record()])};
  const v202={
    rentOfficeProperties(){calls.properties+=1;return propertyApi.call(this)},
    rentOfficeData(name,period){calls.data.push([name,period]);return dataApi.call(this,name,period)},
    openProperty(name,period){calls.open.push([name,period]);return options.openProperty?options.openProperty(name,period):true},
    rentOfficeAction(name,key,period,action,button){
      calls.action.push([name,key,period,action,button]);
      return options.rentOfficeAction?options.rentOfficeAction(name,key,period,action,button):true;
    }
  };
  const window={
    AQARI_SUPABASE:supabase,
    AQARI_V202:v202,
    AQARI_DATA_GATE:{scope:gateScope},
    AQARI_EARLY_STORAGE_GATE:{scope:gateScope}
  };
  window.window=window;
  window.document=document;

  class FakeMutationObserver{observe(){} disconnect(){}}

  vm.runInNewContext(source,{
    window,
    document,
    MutationObserver:FakeMutationObserver,
    setTimeout:clock.setTimeout,
    clearTimeout:clock.clearTimeout,
    Intl,
    Date,
    Promise,
    Event,
    HTMLElement:dom.HTMLElement,
    HTMLInputElement:dom.HTMLInputElement,
    HTMLTextAreaElement:dom.HTMLTextAreaElement,
    HTMLSelectElement:dom.HTMLSelectElement
  },{filename:'v209-global-search.js'});

  function search(value){
    input.value=value;
    input.dispatchEvent({type:'input'});
    clock.tick(100);
    return document.getElementById('v209SearchResults').innerHTML;
  }

  function clickResult(index=0,action='statement'){
    const results=document.getElementById('v209SearchResults');
    const button=document.createElement('button');
    button.setAttribute('data-v209-index',String(index));
    button.setAttribute('data-v209-action',action);
    results.appendChild(button);
    document.dispatchEvent({type:'click',target:button});
    return button;
  }

  function changePeriod(value){
    const target=document.getElementById('v209SearchPeriod');
    assert.ok(target,'the search period input should exist');
    target.value=value;
    document.dispatchEvent({type:'change',target});
    return target;
  }

  return {
    window,document,input,panel,clock,calls,supabase,search,clickResult,changePeriod,
    auth(event){assert.ok(authCallback,'auth callback should be installed');return authCallback(event)}
  };
}

function resultArticles(html){
  return html.match(/<article class="v209-result">[\s\S]*?<\/article>/g)||[];
}


test('finds an authorized property with no rent records',()=>{
 const env=createHarness({properties:['برج مرزوق'],rentOfficeData:(name,period)=>office(name,period,[])});
 const html=env.search('برج مرزوق');assert.match(html,/فتح ملف العقار/);assert.match(html,/data-v209-action="property"/);assert.doesNotMatch(html,/data-v209-action="payment"/);
});
test('property result opens the exact file through the guarded application action',()=>{
 const env=createHarness({properties:['برج مرزوق'],rentOfficeData:(name,period)=>office(name,period,[])});
 const opened=[];env.window.AQARI_OWNER_EXACT={openProperty:name=>{opened.push(name);return true;}};
 env.search('مرزوق');env.clickResult(0,'property');assert.deepEqual(opened,['برج مرزوق']);
});
test('property removal or scope change after search prevents opening',()=>{
 for(const change of ['property','scope']){
  let names=['برج مرزوق'];const env=createHarness({rentOfficeProperties:()=>names,rentOfficeData:()=>null});const opened=[];
  env.window.AQARI_OWNER_EXACT={openProperty:name=>opened.push(name)};env.search('مرزوق');
  if(change==='property')names=[];else env.window.AQARI_DATA_GATE.scope={userId:'other',workspaceId:'workspace-a'};
  env.clickResult(0,'property');assert.deepEqual(opened,[]);
 }
});
test('existing tenant and contract results retain their original actions',()=>{
 const env=createHarness();const html=env.search('C-101');assert.match(html,/data-v209-action="contract"/);assert.match(html,/data-v209-action="payment"/);assert.doesNotMatch(html,/data-v209-action="property"/);
});
