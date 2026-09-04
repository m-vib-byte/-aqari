'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const loaderPath=path.join(root,'final-release-ui.js');

function secondLoaderIife(){
  const source=fs.readFileSync(loaderPath,'utf8');
  const marker=source.indexOf('function installV209GlobalSearch');
  assert.notEqual(marker,-1,'V209 loader function must exist');
  const start=source.lastIndexOf('(function(){',marker);
  assert.notEqual(start,-1,'second loader IIFE must be independently executable');
  return source.slice(start);
}

function createHarness({existingIds=[],portfolioReady=false,v202Ready=false}={}){
  const all=[];
  const appendOrder=[];
  const bodyClasses=new Set();
  const documentListeners=new Map();

  function makeElement(tagName){
    const listeners=new Map();
    const attributes=new Map();
    return {
      tagName:String(tagName).toUpperCase(),
      id:'',
      rel:'',
      href:'',
      src:'',
      dataset:{},
      classList:{add(...names){for(const name of names)bodyClasses.add(name)}},
      setAttribute(name,value){attributes.set(name,String(value))},
      getAttribute(name){return attributes.has(name)?attributes.get(name):null},
      addEventListener(type,callback,options={}){
        const entries=listeners.get(type)||[];
        entries.push({callback,once:Boolean(options&&options.once)});
        listeners.set(type,entries);
      },
      dispatch(type){
        const entries=[...(listeners.get(type)||[])];
        for(const entry of entries){
          entry.callback.call(this,{type,target:this});
          if(entry.once){
            const current=listeners.get(type)||[];
            const index=current.indexOf(entry);
            if(index!==-1)current.splice(index,1);
          }
        }
      },
      listenerCount(type){return (listeners.get(type)||[]).length}
    };
  }

  function appendTo(parent,node){
    if(!all.includes(node))all.push(node);
    parent.children.push(node);
    appendOrder.push(node.id||node.tagName.toLowerCase());
    return node;
  }

  const head={children:[],appendChild(node){return appendTo(head,node)}};
  const body=makeElement('body');
  body.children=[];
  body.appendChild=node=>appendTo(body,node);
  if(v202Ready)body.setAttribute('data-v202-ready','true');

  for(const id of existingIds){
    const node=makeElement(id.endsWith('-css')?'link':'script');
    node.id=id;
    all.push(node);
    (node.tagName==='LINK'?head.children:body.children).push(node);
  }

  const readyMeta=portfolioReady?makeElement('meta'):null;
  if(readyMeta){
    readyMeta.setAttribute('name','aqari-portfolio-collections');
    all.push(readyMeta);
    head.children.push(readyMeta);
  }

  const document={
    readyState:'complete',
    head,
    body,
    createElement:makeElement,
    getElementById(id){return all.find(node=>node.id===id)||null},
    querySelector(selector){
      if(selector==='meta[name="aqari-portfolio-collections"]')return readyMeta;
      return null;
    },
    addEventListener(type,callback,options={}){
      const entries=documentListeners.get(type)||[];
      entries.push({callback,once:Boolean(options&&options.once)});
      documentListeners.set(type,entries);
    }
  };

  return {
    document,
    appendOrder,
    bodyClasses,
    run(){vm.runInNewContext(secondLoaderIife(),{document},{filename:loaderPath})},
    get(id){return document.getElementById(id)},
    count(id){return all.filter(node=>node.id===id).length},
    load(id){
      const node=document.getElementById(id);
      assert.ok(node,`cannot dispatch load for missing element ${id}`);
      node.dispatch('load');
    }
  };
}

const readyThroughV206=[
  'aqari-v199-ui-js',
  'aqari-v201-experience-js',
  'aqari-v202-property-os-js',
  'aqari-v205-simplified-shell-js',
  'aqari-v206-rent-ledger-js'
];

function assertSingleV208AndV209Assets(harness){
  for(const id of [
    'aqari-v208-portfolio-collections-css',
    'aqari-v208-portfolio-collections-js',
    'aqari-v209-global-search-css',
    'aqari-v209-global-search-js'
  ])assert.equal(harness.count(id),1,`${id} must be unique`);
}

test('cold loader path reaches V208 before it installs V209',()=>{
  const h=createHarness();
  h.run();

  assert.ok(h.get('aqari-v199-ui-js'));
  assert.equal(h.count('aqari-v208-portfolio-collections-js'),0);
  assert.equal(h.count('aqari-v209-global-search-js'),0);

  h.load('aqari-v199-ui-js');
  h.load('aqari-v201-experience-js');
  h.load('aqari-v202-property-os-js');
  h.load('aqari-v205-simplified-shell-js');
  h.load('aqari-v206-rent-ledger-js');

  assert.equal(h.count('aqari-v208-portfolio-collections-css'),1);
  assert.equal(h.count('aqari-v208-portfolio-collections-js'),1);
  assert.equal(h.count('aqari-v209-global-search-css'),0,'V209 CSS must wait for V208 load');
  assert.equal(h.count('aqari-v209-global-search-js'),0,'V209 JS must wait for V208 load');

  h.load('aqari-v208-portfolio-collections-js');

  assertSingleV208AndV209Assets(h);
  assert.ok(
    h.appendOrder.indexOf('aqari-v208-portfolio-collections-js')<
      h.appendOrder.indexOf('aqari-v209-global-search-js'),
    'V208 must be appended before V209'
  );
  assert.ok(h.bodyClasses.has('aq-v208'));
  assert.ok(h.bodyClasses.has('aq-v209'));
});

test('an existing V208 script that is still loading delays V209 until load',()=>{
  const h=createHarness({
    existingIds:[...readyThroughV206,'aqari-v208-portfolio-collections-js'],
    v202Ready:true
  });

  h.run();

  assert.equal(h.count('aqari-v208-portfolio-collections-css'),1);
  assert.equal(h.get('aqari-v208-portfolio-collections-js').listenerCount('load'),1);
  assert.equal(h.count('aqari-v209-global-search-css'),0);
  assert.equal(h.count('aqari-v209-global-search-js'),0);

  h.load('aqari-v208-portfolio-collections-js');

  assertSingleV208AndV209Assets(h);
});

test('V208 readiness metadata permits the immediate V209 path',()=>{
  const h=createHarness({
    existingIds:[...readyThroughV206,'aqari-v208-portfolio-collections-js'],
    portfolioReady:true,
    v202Ready:true
  });

  h.run();

  assertSingleV208AndV209Assets(h);
  assert.equal(h.get('aqari-v208-portfolio-collections-js').listenerCount('load'),0);
});

test('repeated loader execution and load callbacks keep V208/V209 CSS and JS idempotent',()=>{
  const h=createHarness({
    existingIds:[...readyThroughV206,'aqari-v208-portfolio-collections-js'],
    v202Ready:true
  });

  h.run();
  h.run();
  assert.equal(h.get('aqari-v208-portfolio-collections-js').listenerCount('load'),1);

  h.load('aqari-v208-portfolio-collections-js');
  h.run();
  h.load('aqari-v208-portfolio-collections-js');

  assertSingleV208AndV209Assets(h);
});

