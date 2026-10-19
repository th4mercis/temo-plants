import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminMfa,normalizeOtp,mfaError} from './admin-mfa.js';
import {requireRecentAdmin} from './security.mjs';

function fixture(){
 const calls=[];let rejectCode=true;
 const user={uid:'owner',email:'owner@example.test',emailVerified:true,getIdTokenResult:async()=>({claims:{}})};
 const auth={currentUser:user};const factor={factorId:'totp',uid:'factor1',displayName:'My app'};
 const mf={enrolledFactors:[],getSession:async()=>({}),enroll:async assertion=>{calls.push(['enroll',assertion]);}};
 const sdk={multiFactor:()=>mf,EmailAuthProvider:{credential:(email,password)=>({email,password})},reauthenticateWithCredential:async()=>calls.push('reauth'),signOut:async()=>{auth.currentUser=null;calls.push('signout');},
  getMultiFactorResolver:()=>({hints:[factor],resolveSignIn:async assertion=>{calls.push(assertion);if(rejectCode)throw {code:'auth/invalid-verification-code'};return {user};}}),
  TotpMultiFactorGenerator:{FACTOR_ID:'totp',generateSecret:async()=>({secretKey:'TEST-ONLY'}),assertionForEnrollment:(secret,code)=>({secret,code}),assertionForSignIn:(uid,code)=>({uid,code})}};
 return {controller:createAdminMfa(sdk,auth),auth,calls,mf,accept:()=>rejectCode=false};
}
test('OTP accepts pasted six digits and Arabic digits, rejects malformed input',()=>{
 assert.equal(normalizeOtp(' ٠١٢٣٤٥ '),'012345');assert.equal(normalizeOtp('۰۱۲۳۴۵'),'012345');
 for(const value of ['12345','1234567','1e2345','123 45',''])assert.throws(()=>normalizeOtp(value));
});
test('TOTP challenge retries invalid codes and clears after success or cancel',async()=>{
 const f=fixture();assert.equal(f.controller.capture({code:'auth/invalid-credential'}),false);
 assert.equal(f.controller.capture({code:'auth/multi-factor-auth-required'}),true);
 await assert.rejects(f.controller.resolve('123456','other'));assert.equal(f.calls.length,0);
 await assert.rejects(f.controller.resolve('123456','factor1'));assert.equal(f.controller.choices().length,1);
 f.accept();assert.equal((await f.controller.resolve('012345','factor1')).uid,'owner');assert.equal(f.controller.choices().length,0);
 await assert.rejects(f.controller.resolve('012345','factor1'));
 f.controller.capture({code:'auth/multi-factor-auth-required'});f.controller.cancel();assert.deepEqual(f.controller.choices(),[]);
});
test('enrollment requires verified email, reauth and current user, and signs out after success',async()=>{
 const f=fixture();f.auth.currentUser.emailVerified=false;await assert.rejects(f.controller.begin('secret'));assert.equal(f.calls.length,0);
 f.auth.currentUser.emailVerified=true;assert.equal((await f.controller.begin('secret')).key,'TEST-ONLY');assert.deepEqual(f.calls,['reauth']);
 f.auth.currentUser.uid='other';await assert.rejects(f.controller.enroll('123456'));f.auth.currentUser.uid='owner';
 await f.controller.enroll('123456');assert.equal(f.auth.currentUser,null);assert.equal(f.calls.at(-1),'signout');await assert.rejects(f.controller.enroll('123456'));
});
test('cancel removes pending enrollment and errors do not expose SDK details',async()=>{
 const f=fixture();await f.controller.begin('secret');f.controller.cancel();await assert.rejects(f.controller.enroll('123456'));
 assert.ok(!mfaError({code:'auth/unexpected',message:'private debug value'}).includes('private'));
});
test('required administrators cannot use password-only or SMS tokens; new administrators also require TOTP',()=>{
 const old=process.env.REQUIRE_ADMIN_MFA;delete process.env.REQUIRE_ADMIN_MFA;
 try{
  assert.throws(()=>requireRecentAdmin({}),e=>e.status===403);
  for(const firebase of [undefined,{}, {sign_in_second_factor:'phone'}])assert.throws(()=>requireRecentAdmin({admin_mfa_required:true,firebase}),e=>e.status===403);
  requireRecentAdmin({admin_mfa_required:true,firebase:{sign_in_second_factor:'totp'}});
  process.env.REQUIRE_ADMIN_MFA='true';assert.throws(()=>requireRecentAdmin({}));requireRecentAdmin({firebase:{sign_in_second_factor:'totp'}});
 }finally{if(old===undefined)delete process.env.REQUIRE_ADMIN_MFA;else process.env.REQUIRE_ADMIN_MFA=old;}
});
