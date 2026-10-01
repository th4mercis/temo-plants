export const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function validateDraft(d){
 if(!d||!['production','reserve','unsupported'].includes(d.action))throw Error('لم أفهم العملية. اكتب إنتاجاً أو حجزاً لنبتة واحدة.');
 if(d.action==='unsupported')throw Error(d.question||'هذه العملية غير مدعومة بعد. اكتب إنتاجاً أو حجزاً لنبتة واحدة.');
 for(const k of ['plant','type','customer','phone','question'])if(typeof d[k]!=='string'||d[k].length>500)throw Error('النتيجة غير صالحة. أعد صياغة الرسالة.');
 if(d.qty!==null&&(!Number.isSafeInteger(d.qty)||d.qty<1||d.qty>10000))throw Error('الكمية غير صالحة.');
 if(d.price!==null&&(!Number.isFinite(d.price)||d.price<0||d.price>1000000))throw Error('السعر غير صالح.');
 if(typeof d.offer!=='boolean')throw Error('النتيجة غير صالحة.');
 return d;
}
export function exactPlant(products,name){const n=normalize(name);const found=products.filter(p=>!p.archived&&(normalize(p.name)===n||normalize(p.code)===n));return found.length===1?found[0]:null;}
export function variantMatch(p,type){const n=normalize(type),aliases=[['كورمة','كورمات','corm'],['شتلة','شتلة صغيرة','baby plant'],['كتنج','cutting'],['مذر','نبتة أم','mother']];const group=aliases.find(g=>g.some(x=>normalize(x)===n))||[type];const found=p.variants.filter(v=>!v.hidden&&group.some(x=>normalize(x)===normalize(v.type)));return found.length===1?found[0]:null;}
export async function operationId(uid,message,date){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uid+'|'+date+'|'+normalize(message)));return 'assistant-'+Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
