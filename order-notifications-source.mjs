import {tryNotification} from '../../order-notifications.mjs';
export const config={schedule:'*/5 * * * *'};
export async function handler(){
 const [{initializeApp,cert,getApps},{getFirestore}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/firestore')]);
 const c=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT||'{}');if(c.project_id!=='temo-plants')throw Error('config');
 const app=getApps().find(a=>a.name==='temo-notifications')||initializeApp({credential:cert(c)},'temo-notifications'),db=getFirestore(app);
 const rows=await db.collection('notificationOutbox').where('status','==','pending').limit(20).get();
 for(const row of rows.docs)await tryNotification(db,row.id);
 return {statusCode:200,body:JSON.stringify({checked:rows.size})};
}
