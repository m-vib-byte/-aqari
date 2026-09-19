// Keep existing authorization checks; never silently discard an unavailable action.
export async function runNavigationAction({scope,action,report}){
 if(!scope()){report('تعذر فتح الخدمة.',true);return false;}
 report('');
 try{
  const result=await action();
  if(result===false){report('تعذر فتح الخدمة.',true);return false;}
  return true;
 }catch{report('تعذر فتح الخدمة.',true);return false;}
}
