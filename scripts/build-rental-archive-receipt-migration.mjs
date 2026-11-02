// Local-only generation/parity check. Never connects to or migrates a database.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const source='staging-database/sql/rental-archive-receipt-permission.sql';
const target='staging-database/supabase/migrations/20261026012044_v267_rental_archive_receipt_permission.sql';
const args=process.argv.slice(2);
if(args.length!==1||!['--write','--check'].includes(args[0]))throw Error('Use --write to generate or --check to verify the local migration.');
const canonical=fs.readFileSync(path.join(root,source));
const hash=createHash('sha256').update(canonical).digest('hex');
const header=[
 '-- Generated from '+source+'; do not edit this candidate independently.',
 '-- Canonical SHA256: '+hash,
 '-- Regenerate: node scripts/build-rental-archive-receipt-migration.mjs --write',
 '-- Verify: node scripts/build-rental-archive-receipt-migration.mjs --check',
 '-- Prepared local candidate only; no hosted application is asserted.',
 ''
].join('\n');
const generated=Buffer.concat([Buffer.from(header),canonical]);
if(args[0]==='--write')fs.writeFileSync(path.join(root,target),generated);
else if(!fs.readFileSync(path.join(root,target)).equals(generated))throw Error('RECEIPT_ARCHIVE_MIGRATION_SOURCE_DRIFT');
console.log(JSON.stringify({mode:args[0],source,target,source_sha256:hash,migration_sha256:createHash('sha256').update(generated).digest('hex'),matched:true}));
