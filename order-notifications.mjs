export function queueNotification(tx,db,{id,kind,number}) {
  tx.set(db.doc('notificationOutbox/'+id),{id,kind,number,status:'pending',createdAt:new Date().toISOString(),attempts:0});
}
export async function deliverNotification(db,id,{env=process.env,send=fetch,now=Date.now()}={}){
  if(!env.RESEND_API_KEY)return {status:'not-configured'};
  const ref=db.doc('notificationOutbox/'+id);
  const item=await db.runTransaction(async tx=>{
    const v=(await tx.get(ref)).data();if(!v||v.status==='sent'||v.status==='review'||(v.leaseUntil||0)>now||(v.retryAt||0)>now)return null;
    if(now-Date.parse(v.createdAt)>20*3600000){tx.set(ref,{...v,status:'review'});return null;}
    tx.set(ref,{...v,leaseUntil:now+60000,attempts:(v.attempts||0)+1});return v;
  });
  if(!item)return {status:'skipped'};
  try{
    const subject=item.kind==='receipt'?'إيصال تحويل جديد للمراجعة':'طلب جديد في Temo Plants';
    const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'temo-notice-'+id},body:JSON.stringify({from:env.NOTIFICATION_FROM||'Temo Plants <notifications@temoplants.com>',to:['th4mer.cis@gmail.com'],subject,text:subject+'\nرقم الطلب: '+item.number+'\nافتح الإدارة للمراجعة:\nhttps://temoplants.com/temo-plants.html\nهذا التنبيه لا يعني تأكيد السداد.'}),signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw Error('provider');
    const result=await response.json();if(!result.id)throw Error('provider');
    await ref.set({...item,status:'sent',providerId:result.id,sentAt:new Date(now).toISOString(),attempts:(item.attempts||0)+1,leaseUntil:0});return {status:'sent'};
  }catch{
    await ref.set({...item,status:'pending',attempts:(item.attempts||0)+1,retryAt:now+300000,leaseUntil:0});return {status:'pending'};
  }
}
export async function tryNotification(db,id){try{return await deliverNotification(db,id);}catch{return {status:'pending'};}}
