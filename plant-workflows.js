import {genusField,readGenus} from './catalog-fields.js';
import * as D from './domain.js';
import * as api from './service.js';
import {el,field,select,check,dialog} from './ui.js';
const value=(f,k)=>String(f.get(k)||'').trim();
const amount=(f,k)=>D.money(value(f,k));
const number=(label,name,initial='0')=>field(label,name,'number',initial,{min:'0',step:'.01',required:''});
const quantity=()=>field('العدد المضاف','qty','number','1',{min:'1',step:'1',required:''});
const details=(...fields)=>el('details',{class:'full'},el('summary',{},'تفاصيل إضافية'),el('div',{class:'form-grid'},fields));
export function newPlant(){
  const id=D.id(),vid=D.id(),op=D.id();
  const type=select('كيف وصلت النبتة إليك؟','kind',[['purchase','اشتريتها الآن — تسجيل المبلغ المدفوع'],['opening','موجودة لدي سابقاً — دون تسجيل دفع جديد']]);
  const summary=el('p',{class:'hint full',role:'status'});
  const content=el('div',{class:'form-grid'},field('اسم النبتة','name','text','',{required:'',maxlength:'200'}),genusField(),field('الصنف / شكل النبتة','type','text','شتلة',{required:'',maxlength:'100'}),type,quantity(),number('تكلفة شراء القطعة الواحدة (ر.س)','cost'),number('سعر بيع القطعة الواحدة (ر.س)','price'),check('هذا الصنف مخصص للبيع','sell',false),details(field('المورد','supplier','text','',{maxlength:'500'}),number('شحن وجمارك الدفعة كاملة (ر.س)','landed'),field('تاريخ الاستلام','date','date',D.localDate(),{required:''}),field('ملاحظات داخلية','notes','textarea','',{maxlength:'4000'})),summary,el('p',{class:'hint full'},'ستُحفظ النبتة والكمية والتكلفة معاً. تبدأ كمسودة؛ أضف صورتها ووصفها من «تعديل / عرض للبيع».'));
  function update(){const q=Number(content.querySelector('[name=qty]').value),c=Number(content.querySelector('[name=cost]').value),s=Number(content.querySelector('[name=landed]').value);summary.textContent=type.querySelector('select').value==='purchase'?'سيُسجّل دفع بقيمة '+D.formatMoney(Math.round((q*c+s)*100))+' وتضاف الكمية للمخزون. لا تسجّل المبلغ مرة أخرى في المصاريف.':'سيضاف المخزون بتكلفته فقط، دون تسجيل دفعة نقدية جديدة.';}
  content.addEventListener('input',update);content.addEventListener('change',update);update();
  dialog('إضافة نبتة ومخزونها',content,async f=>{
    const p={id,code:'TP-'+id.slice(0,6).toUpperCase(),name:value(f,'name'),genus:readGenus(f),internalNotes:value(f,'notes'),publicDescription:'',image:'',published:false,archived:false,revision:0,variants:[{id:vid,type:value(f,'type'),qty:0,reserved:0,cost:0,price:amount(f,'price'),sell:f.has('sell')}]};
    await api.receivePlant(p,{kind:value(f,'kind'),variantId:vid,qty:D.quantity(value(f,'qty')),unitCost:amount(f,'cost'),landed:amount(f,'landed'),date:value(f,'date'),reason:value(f,'supplier')},op);
    return 'أُضيفت النبتة والكمية والتكلفة بنجاح. تجدها الآن في «نباتاتي».';
  });
}
export function addProduction(p){
  const op=D.id(),newId=D.id();
  const choice=select('أضف الإنتاج إلى','variant',[...p.variants.map(v=>[v.id,v.type]),['new','صنف جديد: كورمة أو كتنج']],p.variants.find(v=>/كورم/.test(v.type))?.id||'new');
  const name=field('اسم الصنف الجديد','type','text','كورمة',{required:'',maxlength:'100'}),price=number('سعر بيع القطعة الواحدة (ر.س)','price'),sell=check('متاح للبيع','sell',true);
  const content=el('div',{class:'form-grid'},el('p',{class:'hint full'},p.name+' — أضف عدد القطع المنتجة، وليس إجمالي المخزون. النبتة الأم تبقى كما هي.'),choice,name,quantity(),price,sell,details(number('تكلفة جديدة مدفوعة للقطعة (ر.س)','cost'),field('تاريخ الإنتاج','date','date',D.localDate(),{required:''})),el('p',{class:'hint full'},'اترك التكلفة صفراً إن لم تدفع مبلغاً جديداً. لا تكرر تكلفة مستلزمات مسجلة سابقاً. إذا كانت النبتة منشورة، يظهر الصنف المتاح للبيع بعد الحفظ.'));
  const syncVariant=()=>{const v=p.variants.find(v=>v.id===choice.querySelector('select').value);name.hidden=!!v;name.querySelector('input').disabled=!!v;price.querySelector('input').value=((v?.price||0)/100).toFixed(2);sell.querySelector('input').checked=v?!!v.sell:true;};choice.querySelector('select').addEventListener('change',syncVariant);syncVariant();
  dialog('إضافة إنتاج — '+p.name,content,async f=>{await api.receivePlant(p,{kind:'production',variantId:value(f,'variant')==='new'?newId:value(f,'variant'),type:value(f,'type'),price:amount(f,'price'),sell:f.has('sell'),qty:D.quantity(value(f,'qty')),unitCost:amount(f,'cost'),date:value(f,'date'),reason:'إنتاج من '+p.name},op);return 'أُضيف الإنتاج إلى النبتة وسُجّلت حركة المخزون تلقائياً.';});
}
