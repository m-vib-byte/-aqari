const SHA256_RE=/^[0-9a-f]{64}$/;

function text(value){return typeof value==='string'?value.trim():''}
function positiveInt(value){return Number.isInteger(value)&&value>0}

export function validateStageCRollbackContinuity(bundle={}){
  const errors=[];
  const rollback=bundle&&typeof bundle==='object'&&!Array.isArray(bundle)&&bundle.rollback&&typeof bundle.rollback==='object'&&!Array.isArray(bundle.rollback)
    ?bundle.rollback:{};

  if(rollback.verified!==true)errors.push('rollback continuity requires an explicitly verified rehearsal');
  if(!positiveInt(rollback.rehearsal_window_seconds))errors.push('rollback continuity requires a positive rehearsal window');

  const checkpoint=text(rollback.checkpoint_records_sha256);
  const during=text(rollback.during_records_sha256);
  const after=text(rollback.after_records_sha256);
  for(const [name,digest] of [['checkpoint',checkpoint],['during',during],['after',after]]){
    if(!SHA256_RE.test(digest))errors.push(`rollback ${name} transaction digest must be SHA-256`);
  }

  if(SHA256_RE.test(checkpoint)&&SHA256_RE.test(during)&&positiveInt(rollback.new_record_count)&&checkpoint===during){
    errors.push('rollback rehearsal did not prove that newly created transactions changed the canonical transaction set before rollback');
  }
  if(SHA256_RE.test(during)&&SHA256_RE.test(after)&&during!==after){
    errors.push('rollback rehearsal changed the canonical transaction set; during and after digests must match exactly');
  }

  return {ok:errors.length===0,errors};
}
