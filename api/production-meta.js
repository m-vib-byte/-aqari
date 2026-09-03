import { beginReadOnly, sendReadOnlyJson } from '../lib/read-only.js';
export default async function handler(req,res){
  if(!beginReadOnly(req,res)) return;
  return sendReadOnlyJson(req,res,{ok:true,app:'AQARI',version:'V198',stage:'release-freeze',debugUiDefault:false,deployment:{environment:process.env.VERCEL_ENV||null,gitSha:process.env.VERCEL_GIT_COMMIT_SHA||null,url:process.env.VERCEL_URL||null}});
}
