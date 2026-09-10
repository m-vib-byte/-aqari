import {checksum} from './scan-image.js';

// One immutable object per reservation. A retry reads before another insert-only upload.
export function createVerifiedUpload(session,{path,blob,bucket='aqari-documents',readFirst=false}){
 let attempted=readFirst;
 return async function verifyUpload(){
  session.check();
  const hash=await checksum(blob);session.check();let stored;
  if(attempted){
   try{stored=await session.storage('GET',path,undefined,bucket);}
   catch(error){session.check();if(error.status!==404)throw error;}
  }
  if(!stored){
   attempted=true;
   try{await session.storage('POST',path,blob,bucket);}
   catch(error){
    session.check();
    if([401,403].includes(error.status))throw error;
    // Lost responses and duplicate-object responses are never proof of success.
    try{stored=await session.storage('GET',path,undefined,bucket);}
    catch{session.check();throw error;}
   }
   if(!stored)stored=await session.storage('GET',path,undefined,bucket);
  }
  session.check();
  if(!stored||stored.size!==blob.size)throw Error('لم تتطابق إعادة قراءة المستند. لن يتم تأكيده.');
  const actual=await checksum(stored);session.check();
  if(actual!==hash)throw Error('لم تتطابق إعادة قراءة المستند. لن يتم تأكيده.');
  return hash;
 };
}
