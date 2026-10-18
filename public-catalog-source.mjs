let cached,expires=0,pending;
export async function listPublished(){
 if(cached&&Date.now()<expires)return cached;
 if(pending)return pending;
 pending=(async()=>{
  const r=await fetch('https://firestore.googleapis.com/v1/projects/temo-plants/databases/(default)/documents:runQuery',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),body:JSON.stringify({structuredQuery:{select:{fields:[{fieldPath:'__name__'},{fieldPath:'name'}]},from:[{collectionId:'tp2_publicProducts'}],where:{fieldFilter:{field:{fieldPath:'published'},op:'EQUAL',value:{booleanValue:true}}},limit:50000}})});
  if(!r.ok)throw Error('unavailable');const rows=(await r.json()).filter(x=>x.document).map(x=>({id:x.document.name.split('/').pop(),name:x.document.fields?.name?.stringValue||''}));
  if(rows.length>=50000)throw Error('Catalogue requires pagination');cached=rows;expires=Date.now()+300000;return rows;
 })();try{return await pending;}finally{pending=undefined;}
}
