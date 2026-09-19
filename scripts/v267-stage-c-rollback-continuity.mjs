const SHA256_RE=/^[0-9a-f]{64}$/;
const MAX_REHEARSAL_WINDOW_SECONDS=3600;

function text(value){return typeof value==='string'?value.trim():''}
function nonNegativeInt(value){return Number.isSafeInteger(value)&&value>=0}
function positiveInt(value){return Number.isSafeInteger(value)&&value>0}

export function validateStageCRollbackContinuity(bundle={}){
  const errors=[];
  const rollback=bundle&&typeof bundle==='object'&&!Array.isArray(bundle)&&bundle.rollback&&typeof bundle.rollback==='object'&&!Array.isArray(bundle.rollback)
    ?bundle.rollback:{};

  if(rollback.verified!==true)errors.push('rollback continuity requires an explicitly verified rehearsal');
  if(!positiveInt(rollback.rehearsal_window_seconds)||rollback.rehearsal_window_seconds>MAX_REHEARSAL_WINDOW_SECONDS){
    errors.push(`rollback continuity requires a positive rehearsal window no greater than ${MAX_REHEARSAL_WINDOW_SECONDS} seconds`);
  }

  const checkpointCount=rollback.checkpoint_record_count;
  const newRecordCount=rollback.new_record_count;
  const afterCount=rollback.after_record_count;
  if(!positiveInt(checkpointCount))errors.push('rollback continuity requires a positive integer checkpoint_record_count');
  if(!positiveInt(newRecordCount))errors.push('rollback continuity requires a positive integer new_record_count proving newly created transactions');
  if(!positiveInt(afterCount))errors.push('rollback continuity requires a positive integer after_record_count');
  if(positiveInt(checkpointCount)&&positiveInt(newRecordCount)&&positiveInt(afterCount)&&afterCount!==checkpointCount+newRecordCount){
    errors.push('rollback continuity after_record_count must equal checkpoint_record_count + new_record_count');
  }

  const counts=rollback.counts_by_kind&&typeof rollback.counts_by_kind==='object'&&!Array.isArray(rollback.counts_by_kind)?rollback.counts_by_kind:null;
  if(!counts||Object.keys(counts).length===0){
    errors.push('rollback continuity requires non-empty counts_by_kind evidence');
  }else{
    let total=0;
    let valid=true;
    for(const [kind,count] of Object.entries(counts)){
      if(!text(kind)||!nonNegativeInt(count)){valid=false;break}
      total+=count;
      if(!Number.isSafeInteger(total)){valid=false;break}
    }
    if(!valid)errors.push('rollback continuity counts_by_kind requires safe non-negative integer counts and non-empty kinds');
    else if(positiveInt(afterCount)&&total!==afterCount)errors.push('rollback continuity counts_by_kind must sum exactly to after_record_count');
  }

  const checkpoint=text(rollback.checkpoint_records_sha256);
  const during=text(rollback.during_records_sha256);
  const after=text(rollback.after_records_sha256);
  for(const [name,digest] of [['checkpoint',checkpoint],['during',during],['after',after]]){
    if(!SHA256_RE.test(digest))errors.push(`rollback ${name} transaction digest must be SHA-256`);
  }

  if(SHA256_RE.test(checkpoint)&&SHA256_RE.test(during)&&positiveInt(newRecordCount)&&checkpoint===during){
    errors.push('rollback rehearsal did not prove a distinct newly-created transaction subset');
  }
  if(SHA256_RE.test(checkpoint)&&SHA256_RE.test(after)&&positiveInt(newRecordCount)&&checkpoint===after){
    errors.push('rollback rehearsal after digest must differ from the checkpoint subset digest when new transactions are preserved');
  }
  if(SHA256_RE.test(during)&&SHA256_RE.test(after)&&positiveInt(checkpointCount)&&during===after){
    errors.push('rollback rehearsal after digest must differ from the during-window new-transaction subset digest when checkpoint transactions are preserved');
  }

  return {ok:errors.length===0,errors};
}
