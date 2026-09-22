export async function openSignup({email,password,setStatus,setBusy,ensureCore,withTimeout,friendlyError}){
      if(window.AQARI_PUBLIC_CONFIG?.releaseStage!=='preview')return;
      var emailValue=String(email.value||'').trim().toLowerCase(),passwordValue=password.value||'';
      if(!emailValue||passwordValue.length<10){setStatus('أدخل البريد المصرح له وكلمة مرور جديدة من ١٠ أحرف على الأقل.','bad');return;}
      setBusy(true);setStatus('جاري إنشاء حسابك المصرح به…','');
      try{
        await withTimeout(ensureCore(false,true),18000,'تجهيز الحساب');
        var client=await window.AQARI_SUPABASE.getClient();
        var result=await withTimeout(client.auth.signUp({email:emailValue,password:passwordValue,options:{emailRedirectTo:window.AQARI_SUPABASE.authRedirectUrl()}}),20000,'إنشاء الحساب');
        if(result.error)throw result.error;
        setStatus('راجع بريدك لتأكيد حسابك، ثم ارجع إلى هذا الرابط وسجل الدخول بالصلاحيات التي حددتها الإدارة.','ready');
      }catch(error){setStatus(friendlyError(error),'bad');}
      finally{password.value='';setBusy(false);}
}
