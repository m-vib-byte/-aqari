import { checkBotId } from 'botid/server';

export async function requireHumanBotId(req, res, { check = checkBotId } = {}){
  try{
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
