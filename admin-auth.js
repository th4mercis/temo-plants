import {$,el,btn,field,select,dialog} from './ui.js';
import {mfaError} from './admin-mfa.js';

const otpField=name=>field('رمز تطبيق التحقق',name,'text','',{required:'',inputmode:'numeric',autocomplete:'one-time-code',maxlength:'6',dir:'ltr'});
export function setupAdminAuth({store,start}){
  const passwordForm=$('login-form');let challenge;
  function reset(){store.adminMfa?.cancel();challenge?.remove();challenge=null;passwordForm.hidden=false;$('password').value='';$('password').focus();}
  function showChallenge(){
    passwordForm.hidden=true;$('password').value='';challenge?.remove();
    const choices=store.adminMfa.choices(),code=otpField('admin-otp'),error=el('p',{class:'form-error',role:'alert'});
    const factor=select('تطبيق التحقق','admin-factor',choices.map(f=>[f.uid,f.name]),choices[0]?.uid);
    const submit=el('button',{type:'submit',class:'button primary'},'تحقق ودخول');
    const back=btn('العودة لتسجيل الدخول',reset,'button subtle');
    challenge=el('form',{class:'stack','aria-label':'التحقق بخطوتين'},el('h2',{},'تأكيد الدخول'),el('p',{},'أدخل الرمز الحالي من Google Authenticator أو Microsoft Authenticator.'),choices.length>1?factor:null,code,error,submit,back,el('p',{class:'hint'},'فقدت التطبيق؟ يحتاج استعادة الحساب إلى مالك مشروع Firebase والتحقق من هويتك. لا ترسل كلمة المرور أو مفتاح التطبيق لأي شخص.'));
    passwordForm.after(challenge);code.querySelector('input').focus();
    challenge.addEventListener('submit',async event=>{
      event.preventDefault();if(submit.disabled)return;submit.disabled=back.disabled=true;error.textContent='';submit.textContent='جارٍ التحقق…';
      try{await store.adminMfa.resolve(code.querySelector('input').value,factor.querySelector('select').value);code.querySelector('input').value='';submit.textContent='تم التحقق، جارٍ فتح الإدارة…';await start();challenge?.remove();challenge=null;passwordForm.hidden=false;}
      catch(e){error.textContent=mfaError(e);code.querySelector('input').value='';code.querySelector('input').focus();}
      finally{submit.disabled=back.disabled=false;submit.textContent='تحقق ودخول';}
    });
  }
  passwordForm.addEventListener('submit',async event=>{
    event.preventDefault();const submit=passwordForm.querySelector('button');if(submit.disabled)return;submit.disabled=true;$('login-error').textContent='';
    try{const user=await store.login($('email').value.trim(),$('password').value);$('password').value='';if(user)await start();else showChallenge();}
    catch(error){$('password').value='';$('login-error').textContent=mfaError(error);}
    finally{submit.disabled=false;}
  });
  $('admin-security').addEventListener('click',async()=>{
    try{
      const status=await store.adminMfa.status();
      if(status.enrolled){dialog('أمان الحساب',el('div',{class:'stack'},el('p',{},'تطبيق التحقق مرتبط بحسابك.'),el('p',{},status.secondFactor?'تم التحقق بالتطبيق في جلسة الدخول الحالية.':'سجّل الخروج ثم ادخل برمز التطبيق لاختبار الربط.'),el('p',{class:'hint'},status.required?'التحقق بالتطبيق مطلوب للوصول إلى الإدارة.':'يلزم إكمال اختبار الدخول وتفعيل سياسة الحماية على الخادم قبل إعلان اكتمال الإعداد.'),el('p',{},'احتفظ بنسخة آمنة من إعداد التطبيق. عند فقدان الوصول، تكون الاستعادة من خلال مالك مشروع Firebase بعد التحقق من هويتك.')));return;}
      if(!status.verified){dialog('تأكيد بريد الإدارة',el('div',{class:'stack'},el('p',{},'يجب توثيق بريد الحساب قبل ربط تطبيق التحقق.'),btn('إرسال رسالة توثيق البريد',async e=>{const button=e.currentTarget;button.disabled=true;try{await store.adminMfa.verifyEmail();button.textContent='أُرسلت الرسالة — أكّد البريد ثم سجّل الدخول مجدداً';}catch(error){button.disabled=false;throw error;}})));return;}
      const password=field('كلمة المرور الحالية','mfa-password','password','',{required:'',autocomplete:'current-password'}),error=el('p',{class:'form-error',role:'alert'}),body=el('div',{class:'stack'},el('p',{},'سنربط تطبيق التحقق بحساب الإدارة. أدخل كلمة المرور لتأكيد هويتك.'),password,error);
      let closed=false;
      const begin=btn('بدء ربط التطبيق',async()=>{
        const input=password.querySelector('input');if(!input.reportValidity())return;begin.disabled=true;error.textContent='';
        try{
          await store.checkAdmin();const setup=await store.adminMfa.begin(input.value);input.value='';if(closed){store.adminMfa.cancel();return;}
          const key=field('مفتاح الإعداد — خاص بك','mfa-secret','text',setup.key,{readonly:'',dir:'ltr',autocomplete:'off'}),code=otpField('enroll-otp'),verifyError=el('p',{class:'form-error',role:'alert'});
          const finish=btn('تأكيد الربط وتسجيل الخروج',async()=>{
            if(!code.querySelector('input').reportValidity())return;finish.disabled=true;verifyError.textContent='';
            try{await store.adminMfa.enroll(code.querySelector('input').value);key.querySelector('input').value='';code.querySelector('input').value='';location.reload();}catch(e){verifyError.textContent=mfaError(e);code.querySelector('input').value='';finish.disabled=false;}
          },'button primary');
          body.replaceChildren(el('p',{},'في تطبيق Authenticator اختر إضافة حساب ثم إدخال مفتاح إعداد يدوياً، واختر رمزاً مستنداً إلى الوقت.'),el('p',{},'اسم الحساب: Temo Plants — '+setup.account),key,el('p',{class:'hint'},'احفظ مفتاح الإعداد في مكان آمن قبل التأكيد لاستعادة التطبيق عند فقدان الجوال. لا تشاركه ولا ترسله في المحادثة.'),code,verifyError,finish,el('p',{},'بعد التأكيد ستسجل الدخول من جديد بكلمة المرور ورمز التطبيق.'));
          code.querySelector('input').focus();
        }catch(e){input.value='';error.textContent=mfaError(e);begin.disabled=false;}
      },'button primary');
      body.append(begin);dialog('ربط تطبيق التحقق',body);
      $('dialog').addEventListener('close',()=>{closed=true;store.adminMfa.cancel();body.replaceChildren();},{once:true});
    }catch(e){$('login-error').textContent=mfaError(e);dialog('أمان الحساب',el('p',{role:'alert'},mfaError(e)));}
  });
}


