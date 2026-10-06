import {PublicError} from './security.mjs';

// Called only after the existing token, active-admin, configured MFA and rate checks.
// This is an export, never a restore endpoint. Credentials are deliberately excluded.
export async function backupExport(rt, input) {
  if(input.kind==='inventory')return {collections:(await rt.db.listCollections()).map(c=>c.id)};
  if(input.kind==='documents'){
    if(typeof input.collection!=='string'||!/^\w[\w.-]{0,179}$/.test(input.collection))throw new PublicError('قسم غير صالح.');
    const {FieldPath}=await import('firebase-admin/firestore');
    const size=/^tp2_(audit|cash|customers|movements|orders|products|publicProducts|purchases|shipments|expenses|supplies)$/.test(input.collection)?25:3;
    let q=rt.db.collection(input.collection).orderBy(FieldPath.documentId()).limit(size);
    if(input.after){if(!/^[\w.-]{1,180}$/.test(input.after))throw new PublicError('مؤشر غير صالح.');q=q.startAfter(input.after);}
    const s=await q.get();
    const rows=[];
    for(const d of s.docs){const children=await d.ref.listCollections();if(children.length)throw new PublicError('توجد مجموعات فرعية؛ يلزم تصدير خادمي شامل قبل اعتبار النسخة مكتملة.');rows.push({id:d.id,data:d.data()});}
    return {rows,next:rows.length===size?rows.at(-1).id:null};
  }
  if(input.kind==='accounts'){
    const page=await rt.auth.listUsers(100,input.after||undefined);
    return {rows:page.users.map(u=>({uid:u.uid,email:u.email||'',emailVerified:u.emailVerified,disabled:u.disabled,displayName:u.displayName||'',phoneNumber:u.phoneNumber||'',providerData:u.providerData,customClaims:u.customClaims||{},metadata:u.metadata.toJSON()})),next:page.pageToken||null,requiresPasswordResetOnDisaster:true};
  }
  throw new PublicError('نوع التصدير غير صالح.');
}
