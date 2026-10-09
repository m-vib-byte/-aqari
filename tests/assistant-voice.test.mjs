import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssistantVoice} from '../src/v267/components/assistant-voice.js';
function setup(){
 let allowed=true,busy=false,rec,timer;const texts=[],states=[],spoken=[];
 class Recognition{constructor(){rec=this;}start(){this.started=true;}abort(){this.aborted=true;this.onend?.();}}
 const host={webkitSpeechRecognition:Recognition,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{cancel(){},getVoices:()=>[{lang:'ar-KW'}],speak:u=>spoken.push(u)},setTimeout:fn=>(timer=fn,1),clearTimeout:()=>timer=null};
 const voice=createAssistantVoice({host,allowed:()=>allowed,busy:()=>busy,language:()=> 'ar-KW',onText:x=>texts.push(x),onState:x=>states.push(x)});
 const result=text=>({results:[Object.assign([{transcript:text}],{isFinal:true})]});
 return {voice,host,texts,states,spoken,rec:()=>rec,result,deny:()=>allowed=false,busy:()=>busy=true,timeout:()=>timer?.()};
}
test('voice turn sends once and speaks the answer in Arabic',()=>{const f=setup();assert.equal(f.voice.start(),true);const r=f.rec();assert.equal(r.lang,'ar-KW');r.onresult(f.result('اشرح دورك'));r.onresult(f.result('مكرر'));assert.deepEqual(f.texts,['اشرح دورك']);f.voice.requestStarted();f.voice.answer('أنا مساعد عقاري');assert.equal(f.spoken.length,1);assert.equal(f.spoken[0].lang,'ar-KW');});
test('stop and logout discard late transcripts and prevent reading private replies',()=>{for(const stop of ['stop','deny']){const f=setup();f.voice.start();const r=f.rec();stop==='stop'?f.voice.stop():f.deny();r.onresult(f.result('قديم'));assert.equal(f.texts.length,0);f.voice.answer('جواب');assert.equal(f.spoken.length,0);}});
test('manual stop while waiting prevents automatic speech but allows explicit playback',()=>{const f=setup();f.voice.start();f.voice.requestStarted();f.voice.stop();f.voice.answer('جواب');assert.equal(f.spoken.length,0);f.voice.read();assert.equal(f.spoken.length,1);f.voice.clear();f.voice.read();assert.equal(f.spoken.length,1);});
test('permission errors and timeout leave a usable retry state',()=>{const f=setup();f.voice.start();f.rec().onerror({error:'not-allowed'});assert.equal(f.states.at(-1),'permission-denied');f.voice.start();f.timeout();assert.equal(f.states.at(-1),'no-speech');assert.equal(f.rec().aborted,true);});
test('busy requests and unsupported browsers never start a microphone',()=>{const f=setup();f.busy();assert.equal(f.voice.start(),false);const states=[];const voice=createAssistantVoice({host:{},allowed:()=>true,language:()=> 'ar-KW',onText:()=>assert.fail(),onState:s=>states.push(s)});assert.equal(voice.start(),false);assert.equal(states.at(-1),'unsupported');});
test('typed replies stay silent until explicitly requested and playback errors are visible',()=>{const f=setup();f.voice.answer('نص');assert.equal(f.spoken.length,0);f.voice.read();f.spoken[0].onerror();assert.equal(f.states.at(-1),'playback-error');});
test('late results after permission rejection or an empty end cannot send',()=>{for(const event of ['error','end']){const f=setup();f.voice.start();const r=f.rec();event==='error'?r.onerror({error:'not-allowed'}):r.onend();r.onresult(f.result('متأخر'));assert.equal(f.texts.length,0);}});
