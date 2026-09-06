/* Login presentation only. No session, account, permission or business-data writes. */
(function(){
  'use strict';
  var root=document.getElementById('luxuryLogin');
  var gate=document.getElementById('aqariCloudGateV168');
  if(root){
    var email=document.getElementById('email');
    var password=document.getElementById('password');
    var form=document.getElementById('loginForm');
    var status=document.getElementById('status');
    var toggle=document.getElementById('passwordToggle');
    var caps=document.getElementById('capsHint');
    var login=document.getElementById('loginButton');
    var help=document.getElementById('loginHelp');
    function network(){
      var offline=navigator.onLine===false;
      var label=document.getElementById('connectionState');
      label.textContent=offline?'غير متصل بالشبكة':'الشبكة متاحة';
      label.classList.toggle('offline',offline);
      document.getElementById('networkHint').hidden=!offline;
    }
    function invalid(input,message){
      input.setAttribute('aria-invalid','true');
      input.setAttribute('aria-describedby','status');
      status.textContent=message;status.className='status bad';input.focus();
    }
    function validEmail(){
      email.value=email.value.trim();
      if(!email.value){invalid(email,'أدخل بريدك الإلكتروني للمتابعة.');return false;}
      if(!email.validity.valid){invalid(email,'راجع صيغة البريد الإلكتروني، مثل name@example.com.');return false;}
      return true;
    }
    function resetError(event){event.target.removeAttribute('aria-invalid');event.target.removeAttribute('aria-describedby');}
    email.addEventListener('input',resetError);password.addEventListener('input',resetError);
    form.addEventListener('submit',function(event){
      if(!validEmail()||!password.value){
        if(email.validity.valid&&email.value&&!password.value)invalid(password,'أدخل كلمة المرور للمتابعة.');
        event.preventDefault();event.stopImmediatePropagation();
      }
    },true);
    document.getElementById('recoveryButton').addEventListener('click',function(event){
      if(!validEmail()){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    toggle.hidden=false;
    toggle.addEventListener('click',function(){
      var shown=password.type==='password';password.type=shown?'text':'password';
      toggle.textContent=shown?'إخفاء':'إظهار';
      toggle.setAttribute('aria-label',shown?'إخفاء كلمة المرور':'إظهار كلمة المرور');
      toggle.setAttribute('aria-pressed',String(shown));
    });
    function showCaps(event){caps.hidden=!(event.getModifierState&&event.getModifierState('CapsLock'));}
    password.addEventListener('keydown',showCaps);password.addEventListener('keyup',showCaps);
    password.addEventListener('blur',function(){caps.hidden=true;});
    document.addEventListener('visibilitychange',function(){
      if(document.hidden&&password.type==='text'){
        password.type='password';toggle.textContent='إظهار';toggle.setAttribute('aria-label','إظهار كلمة المرور');toggle.setAttribute('aria-pressed','false');
      }
    });
    var support=document.querySelector('.desktop-help');
    if(support)support.addEventListener('click',function(){help.open=true;});
    function busy(){form.setAttribute('aria-busy',String(login.disabled));}
    new MutationObserver(busy).observe(login,{attributes:true,attributeFilter:['disabled']});
    busy();network();window.addEventListener('online',network);window.addEventListener('offline',network);
  }
  if(gate&&!gate.dataset.loginDesign){
    var card=gate.querySelector('.aq-v168-login');
    if(!card)return;
    gate.dataset.loginDesign='L1';
    var style=document.createElement('style');style.id='aqari-login-luxury-style';
    style.textContent=`
#aqariCloudGateV168[data-login-design="L1"].on{background:#f7f2e9!important;padding:30px!important;gap:4vw!important;overflow-y:auto!important}
#aqariCloudGateV168[data-login-design="L1"] .v199-login-intro{background:radial-gradient(ellipse at 15% 60%,#69503255,transparent 65%),#29221d!important;border:1px solid #5c4b38;border-radius:28px;padding:48px!important;min-height:580px;align-content:center;position:relative;overflow:hidden;color:#f9f4eb!important}
#aqariCloudGateV168[data-login-design="L1"] .v199-login-intro:after{content:"";position:absolute;left:-60px;bottom:-55px;width:260px;height:300px;border:1px solid #c5a46e22;transform:rotate(-22deg);box-shadow:40px -40px 0 #b9976010,80px -80px 0 #b9976010;pointer-events:none}
#aqariCloudGateV168[data-login-design="L1"] .v199-login-intro h2{color:#e4c68e!important;font-size:clamp(32px,4vw,53px)!important;line-height:1.45!important;letter-spacing:-1px!important}
#aqariCloudGateV168[data-login-design="L1"] .v199-login-intro>p:not(.v199-eyebrow){color:#d3c8b8!important;line-height:2!important}
#aqariCloudGateV168[data-login-design="L1"] .v199-eyebrow{color:#d3b785!important}
#aqariCloudGateV168[data-login-design="L1"] .v199-brand-mark{background:transparent!important;color:#d4b47a!important;border:1px solid #ac8c4f77!important;box-shadow:none!important}
#aqariCloudGateV168[data-login-design="L1"] .v199-login-point{background:transparent!important;color:#d3c6b2!important;border-color:#ac8c4f44!important;box-shadow:none!important;font-size:11px!important}
#aqariCloudGateV168[data-login-design="L1"] .aq-v168-login{background:#fffcf7!important;box-shadow:0 18px 60px #4c38260a!important;border:1px solid #e5dbcb!important;border-radius:26px!important;padding:40px!important;max-width:500px!important;width:100%!important;min-width:0!important;text-align:right!important}
#aqariCloudGateV168[data-login-design="L1"] .aq-v168-logo{margin:0 0 25px!important;text-align:right!important}
#aqariCloudGateV168[data-login-design="L1"] .aq-v168-logo h1{font-size:36px!important;color:#33271d!important;margin:16px 0 8px!important;letter-spacing:-1px!important}
#aqariCloudGateV168[data-login-design="L1"] .aq-v168-logo p{color:#847561!important;font-size:14px!important}
#aqariCloudGateV168[data-login-design="L1"] .v199-gate-version{background:#eee1c766!important;color:#8e6932!important;border:1px solid #dac69d66!important;font-size:10px!important;letter-spacing:1px!important;border-radius:8px!important;padding:6px 9px!important}
#aqariCloudGateV168[data-login-design="L1"] .v199-gate-version:before,#aqariCloudGateV168[data-login-design="L1"] .v199-gate-version:after{content:none!important}
#aqariCloudGateV168[data-login-design="L1"] input{background:#fffcf9!important;border:1px solid #ddcfbc!important;border-radius:12px!important;min-height:52px!important;font-size:16px!important;color:#33271f!important;box-shadow:none!important}
#aqariCloudGateV168[data-login-design="L1"] input:focus{border-color:#a17a40!important;outline:3px solid #c7a87233!important}
#aqariCloudGateV168[data-login-design="L1"] [data-cloud-auth-action]{border-radius:12px!important;min-height:48px!important}
#aqariCloudGateV168[data-login-design="L1"] [onclick="cloudLoginV168()"],#aqariCloudGateV168[data-login-design="L1"] [onclick="cloudLoginV198()"]{background:linear-gradient(110deg,#e3c48c,#c8a367)!important;color:#352619!important;border:1px solid #ac864e!important;box-shadow:0 6px 18px #83612e13!important}
#aqariCloudGateV168[data-login-design="L1"] .aq-v168-msg{border-radius:10px!important;font-size:12px!important;line-height:1.9!important;padding:13px!important;box-shadow:none!important;border:1px solid #e7d9c177!important;background:#f5eddd88!important;color:#7d6237!important}
#aqariCloudGateV168[data-login-design="L1"] .aq-v168-msg.bad{background:#fbede7!important;color:#8f4538!important;border-color:#e9c6b9!important}
#aqariCloudGateV168[data-login-design="L1"] #aqariStartupDiagnostic{font-size:11px!important;color:#8d7b64!important;line-height:1.9!important;overflow-wrap:anywhere!important}
#aqariCloudGateV168[data-login-design="L1"] #aqariManualLoginRecovery{color:#88622d!important;font-size:13px!important;border-radius:10px!important;padding:12px!important;min-height:44px!important;text-underline-offset:5px}
#aqariCloudGateV168[data-login-design="L1"] .v199-login-footer{border-top:1px solid #e5dbcc!important;padding-top:19px!important;color:#95846e!important;font-size:10px!important;margin-top:22px!important}
#aqariCloudGateV168[data-login-design="L1"] .luxury-stages{display:flex;gap:8px;margin:17px 0 8px}
#aqariCloudGateV168[data-login-design="L1"] .luxury-stages[hidden]{display:none}
#aqariCloudGateV168[data-login-design="L1"] .luxury-stages span{flex:1;border-top:2px solid #e4dccf;padding-top:9px;font-size:10px;color:#9a8c79}
#aqariCloudGateV168[data-login-design="L1"] .luxury-stages span[aria-current="step"]{border-color:#ad8344;color:#86612e;font-weight:700}
#aqariCloudGateV168[data-login-design="L1"] .luxury-wait{font-size:11px;line-height:1.8;color:#936b32;margin:9px 0}
@media(min-width:900px){#aqariCloudGateV168[data-login-design="L1"].on{display:grid!important;grid-template-columns:1fr 1fr!important;align-items:center!important}#aqariCloudGateV168[data-login-design="L1"] .v199-login-intro{width:100%!important;max-width:680px!important;justify-self:center}#aqariCloudGateV168[data-login-design="L1"] .aq-v168-login{justify-self:center}}
@media(max-width:899px){#aqariCloudGateV168[data-login-design="L1"].on{padding:max(22px,env(safe-area-inset-top)) 20px max(24px,env(safe-area-inset-bottom))!important;align-items:center!important}#aqariCloudGateV168[data-login-design="L1"] .v199-login-intro{display:none!important}#aqariCloudGateV168[data-login-design="L1"] .aq-v168-login{padding:29px 24px!important;max-width:440px!important;margin:auto!important}}
@media(prefers-reduced-motion:reduce){#aqariCloudGateV168[data-login-design="L1"] *{animation:none!important;transition:none!important}}
`;
    document.head.appendChild(style);
    var intro=gate.querySelector('#v199LoginIntro');
    if(intro){
      var hero=intro.querySelector('h2');if(hero)hero.textContent='كل تفاصيل أملاكك. في مكانٍ يليق بها.';
      var eyebrow=intro.querySelector('.v199-eyebrow');if(eyebrow)eyebrow.textContent='إدارة أملاك، برؤية مختلفة';
    }
    var version=card.querySelector('.v199-gate-version');if(version)version.textContent='MYAQARI · L1';
    var label=card.querySelector('.aq-v168-logo p');if(label)label.textContent='مرحبًا بعودتك إلى مساحة عملك.';
    var stages=document.createElement('div');stages.className='luxury-stages';stages.setAttribute('aria-label','خطوات فتح المنصة');stages.hidden=true;
    ['الاتصال','الحساب','مساحة العمل'].forEach(function(name){var span=document.createElement('span');span.textContent=name;stages.appendChild(span);});
    var wait=document.createElement('p');wait.className='luxury-wait';wait.hidden=true;wait.setAttribute('role','status');
    var message=document.getElementById('cloudGateMsgV168');
    if(message){message.insertAdjacentElement('afterend',stages);stages.insertAdjacentElement('afterend',wait);}
    var started=0,timer=0;
    function sync(){
      var phase=gate.getAttribute('data-auth-phase'),stage=gate.getAttribute('data-auth-stage')||'session';
      var active=gate.classList.contains('on')&&phase==='restoring';
      stages.hidden=!active;
      var step=/confirm|render|data/.test(stage)?2:/snapshot|verify-session/.test(stage)?1:0;
      Array.from(stages.children).forEach(function(span,i){if(active&&i===step)span.setAttribute('aria-current','step');else span.removeAttribute('aria-current');});
      if(!active){started=0;clearTimeout(timer);timer=0;wait.hidden=true;return;}
      if(!started){started=Date.now();timer=setTimeout(function(){
        timer=0;
        if(gate.classList.contains('on')&&gate.getAttribute('data-auth-phase')==='restoring'){
          wait.textContent='استغرق فتح المنصة أكثر من المتوقع. العودة إلى تسجيل الدخول متاحة أدناه.';wait.hidden=false;
        }
      },12000);}
    }
    new MutationObserver(sync).observe(gate,{attributes:true,attributeFilter:['class','data-auth-phase','data-auth-stage']});sync();
  }
  window.AQARI_LOGIN_DESIGN=Object.freeze({version:'L1',presentationOnly:true});
})();
