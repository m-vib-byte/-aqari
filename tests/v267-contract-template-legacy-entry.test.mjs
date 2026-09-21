import test from 'node:test';
import assert from 'node:assert/strict';
import {openExperimentalInvestmentApartmentContract,EXPERIMENTAL_INVESTMENT_APARTMENT_CONTRACT_TEXT} from '../src/v267/components/experimental-investment-apartment-contract.js';

function fixture(openLibrary){
 const elements=[];
 const document={body:{append:e=>elements.push(e)},getElementById:id=>elements.find(e=>e.id===id),createElement:tag=>({tag,style:{},children:[],append(...items){this.children.push(...items);},showModal(){this.open=true;},close(){this.open=false;}})};
 const target={document,AQARI_V267_OPEN_TEMPLATES:openLibrary};
 openExperimentalInvestmentApartmentContract(target);
 return elements[0];
}

test('the existing reference links to the guarded A4 library and preserves its original text',async()=>{
 let opened=0;const view=fixture(async()=>{opened++;return true;});
 const action=view.children.find(e=>e.tag==='button'&&e.textContent.includes('مكتبة النماذج'));
 assert.ok(action);assert.equal(view.children.find(e=>e.tag==='pre').textContent,EXPERIMENTAL_INVESTMENT_APARTMENT_CONTRACT_TEXT);
 assert.equal(view.open,true);assert.equal(opened,0);
 await action.onclick();assert.equal(opened,1);assert.equal(view.open,false);
});

test('a rejected library entry leaves the original reference visible',async()=>{
 const view=fixture(async()=>false);
 await view.children.find(e=>e.tag==='button'&&e.textContent.includes('مكتبة النماذج')).onclick();
 assert.equal(view.open,true);
 assert.equal(view.children.find(e=>e.tag==='pre').textContent,EXPERIMENTAL_INVESTMENT_APARTMENT_CONTRACT_TEXT);
});
