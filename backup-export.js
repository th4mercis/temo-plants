import * as store from './store.js';
import {download,notice} from './ui.js';

export async function exportExtendedBackup(){
  if(store.demo)throw Error('التصدير الموسع متاح للمدير في النسخة الحية.');
  const start=new Date().toISOString(),bundle={schemaVersion:3,kind:'temo-extended-local-backup',startedAt:start,firestore:{},accounts:[],images:[],warnings:['لا يشمل كلمات المرور أو مفاتيح الخدمات أو إعدادات المنصات. حسابات البريد تتطلب إعادة تعيين كلمة المرور عند التعافي.','التصدير متعدد الصفحات؛ تجنب تعديل البيانات أثناءه. ليس لقطة زمنية ذرية.']};
  const inventory=await store.command('backupExport',[{kind:'inventory'}]);
  for(const collection of inventory.collections){
    bundle.firestore[collection]=[];let after=null;
    do{const page=await store.command('backupExport',[{kind:'documents',collection,after}]);bundle.firestore[collection].push(...page.rows);after=page.next;notice('جارٍ تصدير '+collection+' — '+bundle.firestore[collection].length+' سجل');await new Promise(r=>setTimeout(r,1100));}while(after);
  }
  let after=null;
  do{const page=await store.command('backupExport',[{kind:'accounts',after}]);bundle.accounts.push(...page.rows);after=page.next;}while(after);
  // Fetch only the public catalog image URLs referenced by products; no arbitrary URLs.
  const photos=new Map();for(const row of bundle.firestore.tp2_products||[])if(row.data.image&&!photos.has(row.data.image))photos.set(row.data.image,row.id);
  for(const [url,productId] of photos){
    const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='firebasestorage.googleapis.com'||!u.pathname.startsWith('/v0/b/temo-plants.firebasestorage.app/o/catalog%2F')){bundle.warnings.push('صورة خارج مسار الكتالوج تحتاج نسخة مستقلة.');continue;}
    notice('جارٍ نسخ صور النباتات — '+bundle.images.length+' / '+photos.size);
    bundle.images.push(await store.command('backupExport',[{kind:'catalogImage',productId}]));
    await new Promise(r=>setTimeout(r,1100));
  }
  bundle.completedAt=new Date().toISOString();bundle.warnings.push('نسخ الصور يشمل الصور المرتبطة بالنباتات فقط، ولا يشمل ملفات Storage غير المرتبطة.');
  download('temo-extended-'+start.slice(0,10)+'.json',bundle);notice('تم تنزيل النسخة الموسعة؛ راجع حدود التغطية المسجلة داخل الملف.');
}
