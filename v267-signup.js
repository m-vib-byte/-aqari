export async function openSignup({email,password,setStatus,setBusy,ensureCore,withTimeout,friendlyError}){
      if(window.AQARI_PUBLIC_CONFIG?.releaseStage!=='preview')return;
      var emailValue=String(email.value||'').trim().toLowerCase(),passwordValue=password.value||'';
      if(!emailValue||passwordValue.length<10){setStatus('أدخل البريد المصرح له وكلمة مرور جديدة من ١٠ أحرف على الأقل لحساب المعاينة.','bad');return;}
      setBusy(true);setStatus('جاري إنشاء حساب المعاينة المستقل…','');
      try{
        await withTimeout(ensureCore(false,true),18000,'تجهيز الحساب');
        var client=await window.AQARI_SUPABASE.getClient();
        var result=await withTimeout(client.auth.signUp({email:emailValue,password:passwordValue,options:{emailRedirectTo:window.AQARI_SUPABASE.authRedirectUrl()}}),20000,'إنشاء الحساب');
        if(result.error)throw result.error;
        setStatus('راجع بريدك لتأكيد حساب المعاينة، ثم ارجع إلى هذا الرابط وسجل الدخول. بيانات الموقع الرئيسي منفصلة.','ready');
      }catch(error){setStatus(friendlyError(error),'bad');}
      finally{password.value='';setBusy(false);}
}
