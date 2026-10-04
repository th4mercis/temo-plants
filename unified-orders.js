import {orderStage} from './domain.js';

// Confirmed orders are authoritative for payment, shipping and inventory.
export function mergeOrderRequests(orders,requests){
 const ids=new Set(orders.map(o=>o.id));
 return [...orders,...requests.filter(r=>!ids.has(r.id)).map(r=>({
  ...r,webRequest:true,source:'website',customer:r.name,customerPhone:r.phone,
  date:(r.createdAt||'').slice(0,10),total:r.total??r.subtotal,paid:r.paid||0
 }))].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
}
export function unifiedOrderStage(o){
 if(o.webRequest){if(o.status==='pending')return 'new';if(o.status==='rejected')return 'closed';return 'attention';}
 return orderStage(o);
}
