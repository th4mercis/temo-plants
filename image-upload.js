// Safari may decode images with <img> while createImageBitmap fails, and may
// return PNG for a requested WebP canvas encoding. Respect the actual MIME type.
export async function prepareImage(file){
 if(!file||file.size===0)throw new Error('اختر صورة غير فارغة.');
 if(file.size>24*1024*1024)throw new Error('الصورة أكبر من 24MB؛ اختر نسخة أصغر.');
 if(!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)&&!(/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name||'')&&!file.type))throw new Error('اختر صورة JPG أو PNG أو WebP أو صورة من مكتبة الجوال.');
 let source,url,canvas;
 try{
  if(typeof createImageBitmap==='function')try{source=await createImageBitmap(file,{resizeWidth:1600,resizeQuality:'high'});}catch{}
  if(!source){url=URL.createObjectURL(file);source=await new Promise((resolve,reject)=>{const img=new Image();let timer=setTimeout(()=>{img.src='';reject(new Error('انتهت مهلة قراءة الصورة؛ اختر نسخة JPG من الجوال.'));},20000);img.onload=()=>{clearTimeout(timer);resolve(img);};img.onerror=()=>{clearTimeout(timer);reject(new Error('المتصفح لم يتمكن من قراءة الصورة. لصور HEIC اختر JPG أو حوّلها قبل الرفع.'));};img.src=url;});}
  const w=source.naturalWidth||source.width,h=source.naturalHeight||source.height;
  if(!w||!h)throw new Error('أبعاد الصورة غير صالحة.');
  const scale=Math.min(1,1400/w,1400/h);canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('تعذر تجهيز الصورة في المتصفح.');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);
  const encode=(type,q)=>new Promise(resolve=>canvas.toBlob(resolve,type,q));let blob=await encode('image/webp',.82);
  if(!blob||blob.type!=='image/webp')blob=await encode('image/jpeg',.82);
  if(blob?.size>2*1024*1024)blob=await encode(blob.type,.65);
  if(!blob||!['image/webp','image/jpeg'].includes(blob.type)||blob.size>2*1024*1024)throw new Error('تعذر ضغط الصورة إلى أقل من 2MB؛ اختر صورة أصغر.');
  return {blob,extension:blob.type==='image/webp'?'webp':'jpg'};
 }finally{source?.close?.();if(url)URL.revokeObjectURL(url);if(canvas){canvas.width=1;canvas.height=1;}}
}
