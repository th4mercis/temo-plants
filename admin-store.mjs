import {createHash} from 'node:crypto';
import {PublicError} from './security.mjs';
import {validateProduct,integerMoney} from './domain.js';
export const collections=['customers','products','orders','purchases','expenses','cash','movements','supplies','shipments','audit','legacy'];
const allowed=new Set([...collections,'publicProducts']);
const appendOnly=new Set(['purchases','expenses','cash','movements','audit','legacy']);
export function createAdminStore(db,actor,request){
  const fingerprint=createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const ref=path=>{
    const [collection,id,...extra]=path.split('/');
    if(!allowed.has(collection)||extra.length||!id||!/^[\w.-]{1,180}$/.test(id))throw new PublicError('معرف سجل غير صالح.');
    return db.doc('tp2_'+collection+'/'+id);
  };
  return {collections,uid:()=>actor.uid,
    get:async path=>(await ref(path).get()).data()||null,
    list:async collection=>{if(!allowed.has(collection))throw new PublicError('قسم غير صالح.');return (await db.collection('tp2_'+collection).get()).docs.map(s=>s.data());},
    atomic:async(paths,build)=>db.runTransaction(async tx=>{
      paths=[...new Set(paths)];
      const docs=Object.fromEntries(await Promise.all(paths.map(async p=>[p,(await tx.get(ref(p))).data()||null])));
      const plan=await build(docs),entries=Object.entries(plan.writes||{});
      if(entries.length>400)throw new PublicError('العملية كبيرة؛ يلزم نقل مخصص للبيانات.');
      // Check every append-only destination before writes, even if service omitted it from read set.
      const historical=entries.filter(([p])=>appendOnly.has(p.split('/')[0]));
      const previous=await Promise.all(historical.map(([p])=>tx.get(ref(p))));
      historical.forEach(([p],i)=>{if(previous[i].exists)throw new PublicError('تعارض مع سجل سابق؛ حدّث البيانات قبل المحاولة.');});
      for(const [path,value] of entries){
        const [collection,id]=path.split('/');ref(path);
        if(!value||value.id!==id)throw new PublicError('معرف السجل غير متسق.');
        if(collection==='products')validateProduct(value);
        if(['cash','expenses'].includes(collection))integerMoney(value.amount);
        if(collection==='orders'){
          integerMoney(value.total);integerMoney(value.paid);
          if(value.paid>value.total)throw new PublicError('المبلغ يتجاوز الإجمالي.');
        }
        if(collection==='audit')Object.assign(value,{by:actor.uid,at:new Date().toISOString(),command:request.action,requestHash:fingerprint});
        if(collection==='movements')Object.assign(value,{by:actor.uid,at:new Date().toISOString()});
        tx.set(ref(path),value);
      }
      return plan.result;
    })
  };
}
