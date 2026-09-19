const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','src/v267/unified-layout-runtime.js'),'utf8');
const start=source.indexOf('function decorateNativePage('),end=source.indexOf('\nfunction ',start+1);
test('shared property/tenant list updates its page heading without repeated replacement',()=>{
 let current=null,updates=0;
 const make=()=>({dataset:{},text:'',replaceWith(next){current=next;updates++;}});
 const runtime={SECTIONS:[{native:'properties',label:'العقارات'},{native:'tenants',label:'المستأجرون'}],pageHeader:(title,description)=>title+' | '+description,document:{createElement(){const holder={};Object.defineProperty(holder,'innerHTML',{set(value){holder.firstElementChild=make();holder.firstElementChild.text=value;}});return holder;}}};
 vm.runInNewContext(source.slice(start,end),runtime);
 const page={classList:{add(){}},querySelector:()=>current,prepend(next){current=next;updates++;}};
 runtime.decorateNativePage('properties',page);assert.match(current.text,/العقارات/);
 runtime.decorateNativePage('tenants',page);assert.match(current.text,/المستأجرون/);assert.doesNotMatch(current.text,/العقارات/);
 runtime.decorateNativePage('tenants',page);assert.equal(updates,2);
 runtime.decorateNativePage('properties',page);assert.match(current.text,/العقارات/);assert.equal(updates,3);
});
