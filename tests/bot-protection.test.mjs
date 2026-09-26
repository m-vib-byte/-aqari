import assert from 'node:assert/strict';
import test from 'node:test';
import { requireHumanBotId } from '../lib/bot-protection.js';

function response(){
  const output = { statusCode:null, body:null };
  return {
    output,
    status(statusCode){ output.statusCode=statusCode; return this; },
    json(body){ output.body=body; return output; }
  };
}

test('BotID allows verified human requests', async () => {
  const res=response();
  const allowed=await requireHumanBotId({headers:{'x-is-human':'challenge'}},res,{check:async options=>{
    assert.equal(options.advancedOptions.headers['x-is-human'],'challenge');
    return {isBot:false,isHuman:true};
  }});
  assert.equal(allowed,true);
  assert.equal(res.output.statusCode,null);
});

test('BotID rejects bots before assistant processing', async () => {
  const res=response();
  const allowed=await requireHumanBotId({headers:{}},res,{check:async()=>({isBot:true,isHuman:false})});
  assert.equal(allowed,false);
  assert.equal(res.output.statusCode,403);
  assert.deepEqual(res.output.body,{error:'BOT_ACCESS_DENIED'});
});

test('BotID fails closed when verification is unavailable', async () => {
  const res=response();
  const allowed=await requireHumanBotId({headers:{}},res,{check:async()=>{throw Error('unavailable');}});
  assert.equal(allowed,false);
  assert.equal(res.output.statusCode,503);
  assert.deepEqual(res.output.body,{error:'BOT_VERIFICATION_UNAVAILABLE'});
});
