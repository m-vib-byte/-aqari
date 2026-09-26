let defaultChecker;
async function resolveDefaultChecker(){
  if(defaultChecker)return defaultChecker;
  const module=await import('botid/server');
  if(typeof module.checkBotId!=='function')throw Error('BOTID_CHECKER_UNAVAILABLE');
  defaultChecker=module.checkBotId;
  return defaultChecker;
}

export async function requireHumanBotId(req, res, options = {}){
  try{
    const check = options.check || await resolveDefaultChecker();
    const verification = await check({ advancedOptions:{ headers:req.headers || {} } });
    if(verification?.isBot === true){
      res.status(403).json({ error:'BOT_ACCESS_DENIED' });
      return false;
    }
    return true;
  }catch{
    res.status(503).json({ error:'BOT_VERIFICATION_UNAVAILABLE' });
    return false;
  }
}
