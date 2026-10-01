import {el,btn,field,select,check,dialog} from './ui.js';
import * as D from './domain.js';
import * as store from './store.js';
import * as api from './service.js';
import {validateDraft,exactPlant,variantMatch,operationId} from './assistant-domain.js';
let view,stateRef;
export function assistantPage(state){
 stateRef=state;if(view)return [view];
 const message=field('رسالتك للمساعد','assistant-message','textarea','',{maxlength:2000,rows:5,placeholder:'أنتجت 4 كورمات من Alocasia Polly Pink Variegated، اعرضها بسعر 250 للواحدة'}),status=el('p',{role:'status','aria-live':'polite'}),result=el('div',{class:'stack'});
 const run=btn('جهّز العملية',async()=>{const text=message.querySelector('textarea').value.trim();if(!text){status.textContent='اكتب العملية أولاً.';return;}run.disabled=true;result.replaceChildren();status.textContent='جارٍ فهم الرسالة… لم يتم تغيير البيانات.';
 try{if(store.demo)throw Error('المساعد الحي يحتاج تسجيل الدخول. استخدم مثال التجربة أدناه لاختبار الحفظ على بيانات افتراضية.');const r=await fetch('/.netlify/functions/assistant',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await store.marketToken()},body:JSON.stringify({message:text}),signal:AbortSignal.timeout(35000)});const data=await r.json();if(!r.ok)throw Error(data.error||'تعذر الاتصال بالمساعد.');const draft=validateDraft(data.draft);status.textContent='فهمت الرسالة. راجع النبتة والكمية والسعر قبل التنفيذ.';result.append(el('p',{},draft.action==='production'?'إضافة إنتاج':'حجز لعميل'),el('p',{},draft.plant+' · '+draft.type+' · '+(draft.qty??'الكمية مطلوبة')),btn('مراجعة وتنفيذ',()=>review(draft,text,status),'button primary'));}
 catch(e){status.textContent=e.message||'تعذر الاتصال. حاول مرة أخرى.';}finally{run.disabled=false;}},'button primary');
 view=el('section',{class:'panel stack'},el('h1',{},'مساعد Temo'),el('p',{},'إنتاج وعرض للبيع، أو حجز وعميل، من رسالة واحدة.'),el('p',{class:'hint'},'نسخة أولى: نبتة واحدة في الرسالة. لا تُحفظ العملية حتى تراجعها وتؤكدها. رسالتك تُرسل إلى OpenAI لفهمها؛ لا نرسل قائمة العملاء أو سجلات الحسابات. لا يوجد ربط مباشر برسائل Instagram بعد.'),message,run,status,result,el('details',{},el('summary',{},'أمثلة وحدود المساعد'),el('p',{},'أنتجت 4 كورمات من اسم النبتة، اعرضها بـ250 للواحدة.'),el('p',{},'احجز كورمتين من اسم النبتة لمحمد، رقمه مع رمز الدولة.'),el('p',{},'التحويل والشحن والإلغاء تُسجل من الطلبات حالياً. الرسائل المتطابقة في اليوم نفسه لا تنفذ مرتين. لإنتاج مستقل جديد استخدم وصف دفعة مختلفاً.')));
 if(store.demo)view.append(btn('تجربة إنتاج افتراضي',()=>{const p=stateRef.products.find(p=>!p.archived);if(!p)return;review({action:'production',plant:p.name,type:'كورمة',qty:4,price:250,offer:true,customer:'',phone:'',question:''},'مثال تجريبي '+p.id,status);}));
 return [view];
}
function review(d,text,status){
 const products=stateRef.products.filter(p=>!p.archived),p0=exactPlant(products,d.plant),date=D.localDate();
 const plant=select('تأكيد النبتة','plant',[['','— اختر النبتة الصحيحة —'],...products.map(p=>[p.id,p.name])],p0?.id||'');
 const variant=select('الصنف','variant',[['','— اختر الصنف —']]);
 const type=field('اسم الصنف الجديد','type','text',d.type,{maxlength:100});
 const price=field('سعر القطعة (ر.س)','price','number',d.price??'',{min:0,step:'.01',required:''});
 const offer=check('عرض هذا الإنتاج للبيع في المتجر','offer',d.offer);
 const summary=el('p',{class:'hint full',role:'status'});
 const content=el('div',{class:'form-grid'},el('p',{class:'hint full'},p0?'طابقت الاسم تماماً؛ تحقق من الصنف أدناه.':'الاسم غير مطابق تماماً: '+d.plant+' — اختر النبتة بنفسك حتى لا يُضاف لنبتة أخرى.'),plant,variant,type,field('الكمية','qty','number',d.qty??'',{required:'',min:1,max:10000,step:1}),price,field('تاريخ العملية','date','date',date,{required:''}),summary);
 const customer=select('عميل مسجل (اختياري)','customerId',[['','عميل جديد / اكتب البيانات'],...stateRef.customers.map(c=>[c.id,c.name])]);
 if(d.action==='production')content.append(offer,el('p',{class:'hint full'},'يضاف العدد إلى الموجود، وتبقى النبتة الأم كما هي. لا تسجل تكلفة أو دفعة مالية. إذا للإنتاج تكلفة جديدة سجلها من إضافة الإنتاج المعتادة.'));
 else content.append(customer,field('اسم العميل','customer','text',d.customer,{required:'',maxlength:200}),field('رقم العميل مع رمز الدولة','phone','tel',d.phone,{maxlength:20}),field('انتهاء الحجز','expires','date','',{required:'',min:date}),el('p',{class:'hint full'},'حجز دون تحصيل؛ لا تسجل دفعة أو شحناً. إذا لم تدخل رقماً ولم تختر عميلاً مسجلاً يحفظ الاسم في الطلب فقط. العميل الجديد لا يشترك في العروض تلقائياً.'));
 let selected;
 const sync=()=>{const p=products.find(p=>p.id===plant.querySelector('select').value);selected=p;const options=[['','— اختر الصنف —'],...(p?.variants||[]).filter(v=>!v.hidden).map(v=>[v.id,v.type+' · متاح '+D.available(v)]),...(d.action==='production'?[['new','إضافة صنف جديد']]:[])];const node=variant.querySelector('select');node.replaceChildren(...options.map(([value,label])=>el('option',{value},label)));node.value=p?(variantMatch(p,d.type)?.id||''):'';update();};
 const update=()=>{const key=variant.querySelector('select').value,v=selected?.variants.find(v=>v.id===key);type.hidden=key!=='new';type.querySelector('input').required=key==='new';price.querySelector('input').value=d.price??(v?(v.price/100).toFixed(2):'');summary.textContent=v?'السعر المسجل: '+D.formatMoney(v.price)+' · المتاح حالياً '+D.available(v):'حدد الصنف وسعر القطعة. إنشاء صنف جديد لا ينشئ نبتة أم جديدة.';};
 plant.querySelector('select').addEventListener('change',sync);variant.querySelector('select').addEventListener('change',update);customer.querySelector('select').addEventListener('change',()=>{const c=stateRef.customers.find(c=>c.id===customer.querySelector('select').value);if(c){content.querySelector('[name=customer]').value=c.name;content.querySelector('[name=phone]').value=c.phone;}});sync();
 const newVariant=D.id();
 dialog('راجع العملية قبل الحفظ',content,async f=>{
 const p=selected;D.assert(p,'اختر النبتة.');const vid=String(f.get('variant')||'');D.assert(vid,'اختر الصنف.');const qty=D.quantity(f.get('qty')),unitPrice=D.money(String(f.get('price'))),when=String(f.get('date'));D.dateValue(when);const op=await operationId(store.uid(),text,when);
 if(await store.get('audit/'+op)){status.textContent='هذه الرسالة نُفذت لهذا التاريخ بالفعل. لم تُكرر العملية.';return status.textContent;}
 if(d.action==='production'){D.assert(!f.has('offer')||unitPrice>0,'أدخل سعر بيع أكبر من صفر لعرض الإنتاج.');await api.receivePlant(p,{kind:'production',variantId:vid==='new'?newVariant:vid,type:String(f.get('type')||'').trim(),qty,unitCost:0,price:unitPrice,sell:f.has('offer'),date:when,reason:'إنتاج عبر مساعد Temo'},op);}
 else await api.createOrder({customerId:String(f.get('customerId')||''),customer:String(f.get('customer')||'').trim(),customerPhone:String(f.get('phone')||'').trim(),date:when,expires:String(f.get('expires')),paid:0,shippingCharged:0,shippingCost:0,source:'مساعد Temo',notes:'حجز بمراجعة المدير عبر المساعد',items:[{productId:p.id,variantId:vid,qty,price:unitPrice}]},'reserve',op);
 status.textContent=d.action==='production'?'تم حفظ الإنتاج وتحديث العرض حسب اختيارك. راجعه في ملف النبتة.':'تم حفظ الحجز والعميل حسب البيانات المدخلة. راجعه في الطلبات والمبيعات.';return status.textContent;
 });
}
