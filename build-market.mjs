import {mkdir,copyFile,readFile,writeFile,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {errorPage} from './seo.mjs';
import {execFileSync} from 'node:child_process';
const files=["order-merge.js","invoice-pdf.js","public-domain.js","share-redirect.js","plant-routes.js","plant-route-names.js","shop-i18n.js","shop-language-init.js","seo.mjs","admin-mfa.js","admin-auth.js","admin.js","assistant-domain.js","assistant-ui.js","backup-export.js","brand-leaf-52b3102d7d.webp","brand-leaf.jpeg","brand-logo-d9723ed1a9.webp","brand-logo.jpeg","brand-pattern-675169bd51.webp","brand-pattern-ba825aad1d.webp","brand-pattern.jpeg","brand.css","catalog-fields.js","config.js","customer-account.js","customer-domain.js","customers.js","domain.js","favicon.svg","image-upload.js","index.html","market-domain.js","market-ui.js","marketing.css","marketing.js","migration-core.js","migration.js","origin-cost.js","plant-hub.js","plant-workflows.js","purchase-cost.js","robots.txt","sale-catalog.js","service-core.js","service.js","shop-checkout.js","shop-layout.css","shop-requests.js","shop.html","shop.js","store.js","storefront-content.js","styles.css","temo-plants.html","ui.js","unified-orders.js","_headers","_redirects"];
const target=path.resolve('dist');
if(target!==path.join(process.cwd(),'dist'))throw Error('Unsafe output');
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
for(const file of files)await copyFile(file,path.join(target,file));
await copyFile('seo.mjs','dist/seo-client.js');
await mkdir('dist/assets',{recursive:true});
for(const file of ["brand-leaf-52b3102d7d.webp","brand-leaf.jpeg","brand-logo-d9723ed1a9.webp","brand-logo.jpeg","brand-pattern-675169bd51.webp","brand-pattern-ba825aad1d.webp","brand-pattern.jpeg"])await copyFile(file,'dist/assets/'+file);
await mkdir('netlify/functions/lib',{recursive:true});
await copyFile('seo.mjs','netlify/functions/lib/seo.mjs');
for(const f of ['plant-routes.js','plant-route-names.js','public-catalog-source.mjs'])await copyFile(f,'netlify/functions/lib/'+f);
for(const [name,file]of Object.entries({"sitemap":"sitemap-source.mjs","product-share":"product-share-source.mjs","order-notifications":"order-notifications-source.mjs","market-estimate":"market-function-source.mjs","shop-orders":"shop-orders-source.mjs","assistant":"assistant-source.mjs","admin-commands":"admin-commands-source.mjs"}))await writeFile('netlify/functions/'+name+'.mjs',(await readFile(file,'utf8')).replace("'./seo.mjs'","'./lib/seo.mjs'").replace("'./plant-routes.js'","'./lib/plant-routes.js'").replace("'./public-catalog-source.mjs'","'./lib/public-catalog-source.mjs'"));
await writeFile('netlify/functions/product-page.mjs', (await readFile('product-page-source.mjs','utf8')).replace('./product-share-source.mjs','./product-share.mjs').replace("'./seo.mjs'","'./lib/seo.mjs'").replace("'./plant-routes.js'","'./lib/plant-routes.js'").replace("'./public-catalog-source.mjs'","'./lib/public-catalog-source.mjs'")+'\nexport const handler=createPageHandler('+JSON.stringify(await readFile('dist/shop.html','utf8'))+');\n');
await writeFile('dist/404.html',errorPage());
await sharp('brand-logo-d9723ed1a9.webp').resize(180,180).png().toFile('dist/apple-touch-icon.png');
const icon=await sharp('brand-logo-d9723ed1a9.webp').resize(32,32).png().toBuffer();
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=32;ico[7]=32;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(icon.length,14);ico.writeUInt32LE(22,18);await writeFile('dist/favicon.ico',Buffer.concat([ico,icon]));
const logo=await sharp('brand-leaf-52b3102d7d.webp').resize(560,560).png().toBuffer();
await sharp({create:{width:1200,height:630,channels:3,background:'#faf8f5'}}).composite([{input:logo,gravity:'centre'}]).jpeg({quality:85}).toFile('dist/social-preview.jpg');
for(const file of files.filter(f=>f.endsWith('.js'))){
 const source=await readFile('dist/'+file,'utf8');
 for(const match of source.matchAll(/(?:from\s*|import\s*\()(['"])(\.\/?[^'"]+)\1/g)){
  const imported=path.resolve('dist',path.dirname(file),match[2]);
  if(!imported.startsWith(target+path.sep))throw Error('Private import: '+file);
  await stat(imported);
 }
}
execFileSync(process.execPath,['--test',...["deploy-order-merge.test.mjs","deploy-security.test.mjs","deploy-hardening.test.mjs","deploy-mfa.test.mjs","deploy-customer-accounts.test.mjs","deploy-receipts.test.mjs","deploy-domain.test.mjs","deploy-admin-clarity.test.mjs","deploy-share.test.mjs","deploy-product-page.test.mjs","deploy-seo.test.mjs","deploy-plant-routes.test.mjs"]],{stdio:'inherit'});
execFileSync(process.execPath,['--no-experimental-require-module','--input-type=module','-e',"const {initializeApp}=await import('firebase-admin/app');await import('firebase-admin/auth');const {getFirestore}=await import('firebase-admin/firestore');getFirestore(initializeApp({projectId:'build-smoke-test'}));"],{stdio:'inherit'});
console.log('Verified build: public imports and backend security regression tests.');

