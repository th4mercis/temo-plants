import {mkdir,copyFile,readFile,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const files=["admin.js","assistant-domain.js","assistant-ui.js","backup-export.js","brand-leaf-52b3102d7d.webp","brand-leaf.jpeg","brand-logo-d9723ed1a9.webp","brand-logo.jpeg","brand-pattern-675169bd51.webp","brand-pattern-ba825aad1d.webp","brand-pattern.jpeg","brand.css","catalog-fields.js","config.js","customer-account.js","customer-domain.js","customers.js","domain.js","favicon.svg","image-upload.js","index.html","market-domain.js","market-ui.js","marketing.css","marketing.js","migration-core.js","migration.js","origin-cost.js","plant-hub.js","plant-workflows.js","purchase-cost.js","robots.txt","sale-catalog.js","service-core.js","service.js","shop-checkout.js","shop-layout.css","shop-requests.js","shop.html","shop.js","store.js","storefront-content.js","styles.css","temo-plants.html","ui.js","unified-orders.js","_headers","_redirects"];
const target=path.resolve('dist');
if(target!==path.join(process.cwd(),'dist'))throw Error('Unsafe output');
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
for(const file of files)await copyFile(file,path.join(target,file));
await mkdir('dist/assets',{recursive:true});
for(const file of ["brand-leaf-52b3102d7d.webp","brand-leaf.jpeg","brand-logo-d9723ed1a9.webp","brand-logo.jpeg","brand-pattern-675169bd51.webp","brand-pattern-ba825aad1d.webp","brand-pattern.jpeg"])await copyFile(file,'dist/assets/'+file);
await mkdir('netlify/functions',{recursive:true});
for(const [name,file]of Object.entries({"order-notifications":"order-notifications-source.mjs","market-estimate":"market-function-source.mjs","shop-orders":"shop-orders-source.mjs","assistant":"assistant-source.mjs","admin-commands":"admin-commands-source.mjs"}))await copyFile(file,'netlify/functions/'+name+'.mjs');
for(const file of files.filter(f=>f.endsWith('.js'))){
 const source=await readFile('dist/'+file,'utf8');
 for(const match of source.matchAll(/(?:from\s*|import\s*\()(['"])(\.\/?[^'"]+)\1/g)){
  const imported=path.resolve('dist',path.dirname(file),match[2]);
  if(!imported.startsWith(target+path.sep))throw Error('Private import: '+file);
  await stat(imported);
 }
}
execFileSync(process.execPath,['--test',...["deploy-security.test.mjs","deploy-customer-accounts.test.mjs","deploy-receipts.test.mjs","deploy-domain.test.mjs"]],{stdio:'inherit'});
execFileSync(process.execPath,['--no-experimental-require-module','--input-type=module','-e',"const {initializeApp}=await import('firebase-admin/app');await import('firebase-admin/auth');const {getFirestore}=await import('firebase-admin/firestore');getFirestore(initializeApp({projectId:'build-smoke-test'}));"],{stdio:'inherit'});
console.log('Verified build: public imports and backend security regression tests.');
