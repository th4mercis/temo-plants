const money=n=>(Number(n||0)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' ر.س';
export function jpegPagesPdf(pages){
 const chunks=[],offsets=[0],enc=new TextEncoder();let size=0;
 const put=v=>{const b=typeof v==='string'?enc.encode(v):v;chunks.push(b);size+=b.length;};
 const obj=(id,s)=>{offsets[id]=size;put(`${id} 0 obj\n${s}\nendobj\n`);};
 put('%PDF-1.4\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
 pages.forEach((p,i)=>{const id=3+i*3;obj(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);offsets[id+1]=size;put(`${id+1} 0 obj\n<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.length} >>\nstream\n`);put(p);put('\nendstream\nendobj\n');const stream='q 595.28 0 0 841.89 0 0 cm /Im Do Q';obj(id+2,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);});
 const start=size;put(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);offsets.slice(1).forEach(n=>put(String(n).padStart(10,'0')+' 00000 n \n'));put(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);return new Blob(chunks,{type:'application/pdf'});
}
export async function createInvoicePdf(o){
 await document.fonts.ready;const logo=new Image();logo.src=new URL('./brand-logo-d9723ed1a9.webp',import.meta.url).href;await logo.decode().catch(()=>{});
 const pages=[];let canvas,ctx,y;
 function label(s,x,yy,size=24,bold=false,align='right'){ctx.font=`${bold?'bold ':''}${size}px Arial`;ctx.fillStyle='#111';ctx.direction='rtl';ctx.textAlign=align;ctx.fillText(String(s),x,yy);}
 function page(){canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1240,1754);
 if(logo.naturalWidth){ctx.save();ctx.beginPath();ctx.arc(1110,115,48,0,Math.PI*2);ctx.clip();ctx.drawImage(logo,1062,67,96,96);ctx.restore();}
 label(o.number,80,95,26,true,'left');label(o.date,80,140,25,false,'left');label('Temo_plants',1160,215,36,true);label('بيان طلب / بيع',1160,285);ctx.fillStyle='#b60000';ctx.fillRect(80,330,1080,4);label('العميل: '+(o.customer||'—'),1160,375);label('الحالة: '+({sold:'مباع',reserved:'محجوز',returned:'مرتجع',cancelled:'ملغي'}[o.status]||o.status),1160,435);y=480;}
 function finish(){label('شكراً لاختيارك Temo Plants',1160,Math.min(y+45,1660),20);pages.push(Uint8Array.from(atob(canvas.toDataURL('image/jpeg',.92).split(',')[1]),c=>c.charCodeAt(0)));}
 const widths=[320,90,180,160,160,170];
 function wrap(value,width){ctx.font='22px Arial';const lines=[];let line='';for(const c of String(value)){if(ctx.measureText(line+c).width>width-24){lines.push(line);line='';}line+=c;}lines.push(line);return lines;}
 function row(values,header=false){const lines=values.map((v,i)=>wrap(v,widths[i])),height=Math.max(...lines.map(v=>v.length))*32+30;let right=1160;for(let i=0;i<values.length;i++){const left=right-widths[i];ctx.strokeStyle='#ccc';ctx.lineWidth=1;ctx.strokeRect(left,y,widths[i],height);lines[i].forEach((line,j)=>label(line,right-12,y+30+j*32,22,header));right=left;}y+=height;}
 const headers=['النبات / الصنف','العدد','السعر الأصلي للقطعة','خصم القطعة','بعد الخصم','الإجمالي'];page();row(headers,true);
 for(const i of o.items){const values=[i.name+' — '+i.type,i.qty,money(i.originalPrice??i.price),money((i.originalPrice??i.price)-i.price),money(i.price),money(i.price*i.qty)];const height=Math.max(...values.map((v,j)=>wrap(v,widths[j]).length))*32+30;if(y+height>1500){finish();page();row(headers,true);}row(values);}
 y+=20;const totals=[['إجمالي الخصم',o.items.reduce((s,i)=>s+((i.originalPrice??i.price)-i.price)*i.qty,0)],['قيمة النباتات',o.subtotal],['شحن العميل',o.shippingCharged],['الإجمالي',o.total],['المستلم',o.paid],[o.status==='returned'?'المسترد':'المتبقي',o.status==='returned'?(o.refunded||0):o.total-o.paid]];
 if(y+totals.length*78>1570){finish();page();}for(const [name,value]of totals){label(name,1160,y+35,25,name==='الإجمالي');label(money(value),80,y+35,23,name==='الإجمالي','left');y+=78;ctx.strokeStyle='#ddd';ctx.beginPath();ctx.moveTo(80,y-12);ctx.lineTo(1160,y-12);ctx.stroke();}finish();
 return new File([jpegPagesPdf(pages)],'Temo-'+String(o.number||'invoice').replace(/[^a-zA-Z0-9_-]/g,'')+'.pdf',{type:'application/pdf'});
}
export function downloadInvoice(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
