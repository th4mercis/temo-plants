import {quantity,assert} from './domain.js';
export const genusDetails={
 alocasia:{title:'ألوكاسيا — Alocasia',text:'تصفح مجموعة الألوكاسيا، واختر من الكورمات والشتلات المعروضة. تفاصيل الحجم والجذور والصور الحديثة متاحة عند الاستفسار.'},
 anthurium:{title:'أنثوريوم — Anthurium',text:'اكتشف مجموعة الأنثوريوم المعروضة. استفسر عن اسم الهجين، وحجم النبتة، وصور الأوراق والجذور قبل تأكيد الطلب.'},
 hoya:{title:'هويا — Hoya',text:'تصفح الهويا المتاحة، وراجع شكل القطعة المعروضة: نبتة أو كتنج. استفسر عن التجذير والحجم والصورة الحالية.'},
 monstera:{title:'مونستيرا — Monstera',text:'تصفح المونستيرا المعروضة، واطلب صور القطعة الفعلية وتفاصيل حجمها وحالة الجذور قبل اختيارها.'},
 philodendron:{title:'فيلودندرون — Philodendron',text:'اكتشف الفيلودندرون المتاح ضمن المجموعة. نوضح لك الصنف ومرحلة النمو وحالة القطعة عند الاستفسار.'},
 begonia:{title:'بيجونيا — Begonia',text:'تصفح مجموعة البيجونيا، واستفسر عن حجم القطعة والتجذير والصور الحديثة وخيارات الشحن.'}
};
export function variantLabel(type){const t=String(type||'').trim(),key=t.toLowerCase();if(/\s[-–—]\s/.test(t)&&/[a-z]/i.test(t))return t;const en=({'كورمة':'Corm','كورمات':'Corm','شتلة':'Baby Plant','شتلة صغيرة':'Baby Plant','مذر':'Mother','نبتة أم':'Mother','ام':'Mother','أم':'Mother','كتنج':'Cutting','كتنق':'Cutting','عقلة':'Cutting','نبتة':'Plant'})[key];const ar=({corm:'كورمة','baby plant':'شتلة',seedling:'شتلة',mother:'مذر',cutting:'كتنج',plant:'نبتة'})[key];return en?t+' — '+en:ar?ar+' — '+t:t;}
export const availableVariants=p=>(p.variants||[]).filter(v=>v.available>0);
export function inquiryText(p,variantId,rawQty,url){const qty=quantity(rawQty),v=availableVariants(p).find(v=>v.id===variantId);assert(p.published&&v&&v.available>=qty,'الكمية المطلوبة غير متاحة حالياً. عدّل الكمية أو استفسر عن موعد التوفر.');return `مرحباً Temo Plants 🌿\nأرغب بالاستفسار عن تفاصيل الطلب:\nالنبتة: ${p.name}\nالكود: ${p.code}\nالصنف: ${variantLabel(v.type)}\nالكمية المطلوبة: ${qty}\nالرابط: ${url}\nأرجو تزويدي بالسعر وصور القطعة وتفاصيل التوفر والشحن.`;}
