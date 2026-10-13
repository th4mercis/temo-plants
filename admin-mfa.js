// All challenges and enrollment secrets stay in memory, never in storage or logs.
export function normalizeOtp(value){
  const code=String(value).trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
  if(!/^\d{6}$/.test(code))throw new Error('أدخل الرمز المكوّن من 6 أرقام.');
  return code;
}
export function mfaError(error){
  const messages={
    'auth/invalid-verification-code':'الرمز غير صحيح أو انتهت صلاحيته. أدخل الرمز الحالي من التطبيق.',
    'auth/code-expired':'انتهت مهلة التحقق. ارجع وسجّل الدخول مجدداً.',
    'auth/invalid-multi-factor-session':'انتهت جلسة التحقق. سجّل الدخول مجدداً.',
    'auth/requires-recent-login':'أعد تسجيل الدخول قبل إعداد التحقق الثنائي.',
    'auth/unverified-email':'وثّق بريد حساب الإدارة أولاً ثم أعد تسجيل الدخول.',
    'auth/too-many-requests':'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.',
    'auth/network-request-failed':'تعذر الاتصال. تحقق من الشبكة ثم حاول مجدداً.',
    'auth/operation-not-allowed':'لم يُفعّل تطبيق التحقق في إعدادات المشروع بعد.',
    'auth/invalid-credential':'تعذر التحقق من بيانات الدخول.',
    'auth/wrong-password':'تعذر التحقق من بيانات الدخول.'
  };
  return messages[error?.code]||(error?.code?.startsWith('auth/')?'تعذر إكمال التحقق. أعد تسجيل الدخول وحاول مجدداً.':error?.message)||'تعذر إكمال التحقق.';
}
export function createAdminMfa(sdk,auth){
  let resolver=null,secret=null,secretUid=null,generation=0;
  const cancel=()=>{generation++;resolver=null;secret=null;secretUid=null;};
  const factors=()=>sdk.multiFactor(auth.currentUser).enrolledFactors.filter(f=>f.factorId===sdk.TotpMultiFactorGenerator.FACTOR_ID);
  return {
    cancel,
    capture(error){
      cancel();if(error?.code!=='auth/multi-factor-auth-required')return false;
      const candidate=sdk.getMultiFactorResolver(auth,error);
      if(!candidate.hints.some(f=>f.factorId===sdk.TotpMultiFactorGenerator.FACTOR_ID))throw new Error('هذا الحساب يحتاج وسيلة تحقق غير مدعومة هنا. راجع مسؤول المشروع.');
      resolver=candidate;return true;
    },
    choices:()=>resolver?.hints.filter(f=>f.factorId===sdk.TotpMultiFactorGenerator.FACTOR_ID).map(f=>({uid:f.uid,name:f.displayName||'تطبيق التحقق'}))||[],
    async resolve(code,factorUid){
      if(!resolver)throw new Error('انتهت جلسة التحقق. سجّل الدخول مجدداً.');
      const factor=resolver.hints.find(f=>f.uid===factorUid&&f.factorId===sdk.TotpMultiFactorGenerator.FACTOR_ID);
      if(!factor)throw new Error('اختر تطبيق التحقق المسجل.');
      const result=await resolver.resolveSignIn(sdk.TotpMultiFactorGenerator.assertionForSignIn(factor.uid,normalizeOtp(code)));
      cancel();return result.user;
    },
    async status(){
      if(!auth.currentUser)throw new Error('سجّل الدخول أولاً.');
      const token=await auth.currentUser.getIdTokenResult();
      return {enrolled:factors().length>0,verified:auth.currentUser.emailVerified,required:token.claims.admin_mfa_required===true,secondFactor:token.claims.firebase?.sign_in_second_factor==='totp'};
    },
    async begin(password){
      cancel();const attempt=generation,current=auth.currentUser;
      if(!current?.emailVerified)throw Object.assign(new Error(),{code:'auth/unverified-email'});
      if(factors().length)throw new Error('تطبيق التحقق مرتبط بالفعل.');
      await sdk.reauthenticateWithCredential(current,sdk.EmailAuthProvider.credential(current.email,password));
      const generated=await sdk.TotpMultiFactorGenerator.generateSecret(await sdk.multiFactor(current).getSession());
      if(attempt!==generation||auth.currentUser?.uid!==current.uid)throw new Error('أُلغي إعداد التطبيق. ابدأ مجدداً.');
      secret=generated;
      secretUid=current.uid;return {key:secret.secretKey,account:current.email};
    },
    async enroll(code){
      if(!secret||secretUid!==auth.currentUser?.uid)throw new Error('ابدأ إعداد التطبيق مجدداً.');
      await sdk.multiFactor(auth.currentUser).enroll(sdk.TotpMultiFactorGenerator.assertionForEnrollment(secret,normalizeOtp(code)),'Temo Plants Admin');
      cancel();await sdk.signOut(auth);
    },
    async verifyEmail(){if(!auth.currentUser)throw new Error('سجّل الدخول أولاً.');await sdk.sendEmailVerification(auth.currentUser);}
  };
}

