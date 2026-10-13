// Run only by the project owner with Application Default Credentials.
// Never export keys into the website, shell history, or this tool's output.
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
const [action,uid,confirmation]=process.argv.slice(2);
if(!['status','enable-totp','require'].includes(action))throw Error('Use status [uid], enable-totp --confirm, or require <uid> --confirmed-login-and-recovery');
initializeApp({credential:applicationDefault(),projectId:'temo-plants'});
const auth=getAuth(),db=getFirestore();
if(action==='enable-totp'){
 if(uid!=='--confirm')throw Error('Explicit project-owner approval required.');
 const manager=auth.projectConfigManager(),config=await manager.getProjectConfig();
 const providers=(config.multiFactorConfig?.providerConfigs||[]).filter(p=>!p.totpProviderConfig);
 await manager.updateProjectConfig({multiFactorConfig:{...config.multiFactorConfig,providerConfigs:[...providers,{state:'ENABLED',totpProviderConfig:{adjacentIntervals:1}}]}});
 console.log('TOTP enabled; no users enrolled and no admin policy changed.');
}else{
 if(!uid){const config=await auth.projectConfigManager().getProjectConfig();console.log(JSON.stringify({totpEnabled:config.multiFactorConfig?.providerConfigs?.some(p=>p.totpProviderConfig&&p.state==='ENABLED')||false}));}
 else{
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw Error('Invalid UID');
  if((await db.doc('admins/'+uid).get()).data()?.active!==true)throw Error('Not an active administrator');
  const user=await auth.getUser(uid),enrolled=user.multiFactor?.enrolledFactors?.some(f=>f.factorId==='totp')||false;
  if(action==='status')console.log(JSON.stringify({enrolled,emailVerified:user.emailVerified,required:user.customClaims?.admin_mfa_required===true}));
  else{
   if(confirmation!=='--confirmed-login-and-recovery'||!enrolled||!user.emailVerified)throw Error('Verify enrollment, fresh MFA login, recovery and deployed Firestore/Storage rules before enforcing.');
   await auth.setCustomUserClaims(uid,{...user.customClaims,admin_mfa_required:true});
   await auth.revokeRefreshTokens(uid);console.log('Admin policy enabled. Sign in again with the authenticator. Existing ID tokens can remain valid in Rules until expiry (up to one hour).');
  }
 }
}
