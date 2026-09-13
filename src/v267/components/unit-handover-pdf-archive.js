const PDF_MIME='application/pdf';
const SHA256=/^[a-f0-9]{64}$/;

function text(value,label){
  const normalized=String(value??'').trim();
  if(!normalized)throw new Error(`UNIT_HANDOVER_ARCHIVE_${label}_REQUIRED`);
  return normalized;
}
function positiveRevision(value){
  const revision=Number(value);
  if(!Number.isSafeInteger(revision)||revision<1)throw new Error('UNIT_HANDOVER_ARCHIVE_REVISION_INVALID');
  return revision;
}
function immutable(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value))immutable(child);
  }
  return value;
}
function asBytes(value){
  if(value instanceof Uint8Array)return new Uint8Array(value);
  if(value instanceof ArrayBuffer)return new Uint8Array(value.slice(0));
  if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength));
  throw new Error('UNIT_HANDOVER_ARCHIVE_PDF_BYTES_REQUIRED');
}
function assertPdf(bytes){
  if(bytes.byteLength<8)throw new Error('UNIT_HANDOVER_ARCHIVE_PDF_INVALID');
  const signature=String.fromCharCode(...bytes.slice(0,5));
  if(signature!=='%PDF-')throw new Error('UNIT_HANDOVER_ARCHIVE_PDF_INVALID');
}
function cryptoApi(){
  const api=globalThis.crypto?.subtle;
  if(!api)throw new Error('UNIT_HANDOVER_ARCHIVE_CRYPTO_UNAVAILABLE');
  return api;
}
async function sha256(bytes){
  const digest=await cryptoApi().digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function sha256Text(value){
  return sha256(new TextEncoder().encode(value));
}
function sourceFromBundle(bundle){
  if(!bundle||bundle.kind!=='unit_handover')throw new Error('UNIT_HANDOVER_ARCHIVE_BUNDLE_REQUIRED');
  const source=bundle.source||{};
  return {
    inspection_id:text(source.inspection_id,'INSPECTION_ID'),
    lease_id:text(source.lease_id,'LEASE_ID'),
    unit_id:text(source.unit_id,'UNIT_ID'),
    inspection_revision:positiveRevision(source.inspection_revision)
  };
}
function canonicalManifest(source,pdfSha,size){
  return JSON.stringify({
    kind:'unit_handover_pdf',
    inspection_id:source.inspection_id,
    lease_id:source.lease_id,
    unit_id:source.unit_id,
    inspection_revision:source.inspection_revision,
    content_type:PDF_MIME,
    size_bytes:size,
    pdf_sha256:pdfSha
  });
}
function requireStorage(storage){
  if(!storage||typeof storage.put!=='function'||typeof storage.get!=='function'){
    throw new Error('UNIT_HANDOVER_ARCHIVE_STORAGE_REQUIRED');
  }
  return storage;
}
function metadataFor(source,pdfSha,manifestSha,size){
  return {
    kind:'unit_handover_pdf',
    inspection_id:source.inspection_id,
    lease_id:source.lease_id,
    unit_id:source.unit_id,
    inspection_revision:String(source.inspection_revision),
    pdf_sha256:pdfSha,
    manifest_sha256:manifestSha,
    size_bytes:String(size)
  };
}
function storageKey(source,pdfSha,manifestSha){
  const safe=value=>encodeURIComponent(value).replace(/%2F/gi,'%252F');
  return `unit-handover/${safe(source.lease_id)}/${safe(source.inspection_id)}/r${source.inspection_revision}/${pdfSha.slice(0,16)}-${manifestSha.slice(0,16)}.pdf`;
}
function sameMetadata(actual,expected){
  if(!actual||typeof actual!=='object')return false;
  return Object.entries(expected).every(([key,value])=>String(actual[key]??'')===String(value));
}

export async function archiveUnitHandoverPdf({bundle,pdfBytes,storage,archivedAt=new Date().toISOString()}){
  const target=requireStorage(storage);
  const source=sourceFromBundle(bundle);
  const bytes=asBytes(pdfBytes);
  assertPdf(bytes);
  const pdfSha=await sha256(bytes);
  const manifestSha=await sha256Text(canonicalManifest(source,pdfSha,bytes.byteLength));
  const key=storageKey(source,pdfSha,manifestSha);
  const metadata=metadataFor(source,pdfSha,manifestSha,bytes.byteLength);
  await target.put(key,{bytes:new Uint8Array(bytes),contentType:PDF_MIME,metadata,ifNoneMatch:'*'});
  return immutable({
    kind:'unit_handover_pdf_archive',
    source,
    storage_key:key,
    content_type:PDF_MIME,
    size_bytes:bytes.byteLength,
    pdf_sha256:pdfSha,
    manifest_sha256:manifestSha,
    archived_at:text(archivedAt,'ARCHIVED_AT')
  });
}

export async function reopenUnitHandoverPdf({archive,storage}){
  const target=requireStorage(storage);
  if(!archive||archive.kind!=='unit_handover_pdf_archive')throw new Error('UNIT_HANDOVER_ARCHIVE_RECORD_REQUIRED');
  const source={
    inspection_id:text(archive.source?.inspection_id,'INSPECTION_ID'),
    lease_id:text(archive.source?.lease_id,'LEASE_ID'),
    unit_id:text(archive.source?.unit_id,'UNIT_ID'),
    inspection_revision:positiveRevision(archive.source?.inspection_revision)
  };
  const expectedSha=text(archive.pdf_sha256,'PDF_SHA256').toLowerCase();
  const expectedManifest=text(archive.manifest_sha256,'MANIFEST_SHA256').toLowerCase();
  if(!SHA256.test(expectedSha)||!SHA256.test(expectedManifest))throw new Error('UNIT_HANDOVER_ARCHIVE_DIGEST_INVALID');
  const expectedSize=Number(archive.size_bytes);
  if(!Number.isSafeInteger(expectedSize)||expectedSize<=0)throw new Error('UNIT_HANDOVER_ARCHIVE_SIZE_INVALID');
  if(String(archive.content_type??'').toLowerCase()!==PDF_MIME)throw new Error('UNIT_HANDOVER_ARCHIVE_MIME_INVALID');
  const expectedKey=storageKey(source,expectedSha,expectedManifest);
  if(text(archive.storage_key,'STORAGE_KEY')!==expectedKey)throw new Error('UNIT_HANDOVER_ARCHIVE_KEY_MISMATCH');

  const stored=await target.get(expectedKey);
  if(!stored)throw new Error('UNIT_HANDOVER_ARCHIVE_NOT_FOUND');
  if(String(stored.contentType??'').toLowerCase()!==PDF_MIME)throw new Error('UNIT_HANDOVER_ARCHIVE_STORED_MIME_MISMATCH');
  const bytes=asBytes(stored.bytes);
  assertPdf(bytes);
  if(bytes.byteLength!==expectedSize)throw new Error('UNIT_HANDOVER_ARCHIVE_STORED_SIZE_MISMATCH');
  const actualSha=await sha256(bytes);
  if(actualSha!==expectedSha)throw new Error('UNIT_HANDOVER_ARCHIVE_STORED_DIGEST_MISMATCH');
  const actualManifest=await sha256Text(canonicalManifest(source,actualSha,bytes.byteLength));
  if(actualManifest!==expectedManifest)throw new Error('UNIT_HANDOVER_ARCHIVE_MANIFEST_MISMATCH');
  const expectedMetadata=metadataFor(source,actualSha,actualManifest,bytes.byteLength);
  if(!sameMetadata(stored.metadata,expectedMetadata))throw new Error('UNIT_HANDOVER_ARCHIVE_METADATA_MISMATCH');
  return immutable({archive,bytes:new Uint8Array(bytes)});
}
