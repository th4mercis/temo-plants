import {createServer} from 'node:http';
import {readFile,realpath,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=await realpath(process.argv[2]||'dist');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp'};
const server=createServer(async(req,res)=>{try{const file=await realpath(path.join(root,new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)||!mime[path.extname(file)])throw Error();res.setHeader('Content-Type',mime[path.extname(file)]);res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.E2E_BROWSER_PATH?{executablePath:process.env.E2E_BROWSER_PATH}:{})});
 await mkdir('mfa-results',{recursive:true});
 for(const width of [375,1366]){
  const ctx=await browser.newContext({viewport:{width,height:812}}),page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await ctx.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();
   if(u.pathname==='/store.js')return route.fulfill({contentType:'text/javascript',body:`
    export const demo=false,collections=['customers','products','orders','purchases','expenses','cash','movements','supplies','shipments','audit','legacy'];export async function connect(){}export function watchAuth(){}export async function checkAdmin(){return true}export function subscribe(){}export async function logout(){}export const uid=()=> 'test';export const command=async()=>{};
    export async function login(){return location.search.includes('unverified')?{uid:'test'}:null}export async function list(){return []}export async function get(){return null}export async function atomic(){}export async function uploadImage(){}export async function getLegacy(){}export async function marketToken(){return ''}
    let emailAttempts=0;export const adminMfa={cancel(){},choices:()=>[{uid:'test',name:'Authenticator'}],async resolve(code){if(code!=='012345')throw {code:'auth/invalid-verification-code'};return {uid:'test'};},async status(){return {enrolled:false,verified:!location.search.includes('unverified')}},async verifyEmail(){await new Promise(r=>setTimeout(r,10));if(++emailAttempts===1)throw {code:'auth/network-request-failed'};},async begin(){return {key:'TEST-ONLY-DO-NOT-USE',account:'test@example.test'}},async enroll(){throw {code:'auth/invalid-verification-code'}}};
   `});return route.continue();});
  await page.goto(origin+'/temo-plants.html');await page.getByLabel('البريد الإلكتروني',{exact:true}).fill('test@example.test');await page.getByLabel('كلمة المرور',{exact:true}).fill('test-only');await page.getByRole('button',{name:'تسجيل الدخول',exact:true}).click();
  await page.getByRole('heading',{name:'تأكيد الدخول'}).waitFor();assert.equal(await page.locator('#password').inputValue(),'');assert.equal(await page.locator('#app').isVisible(),false);
  await page.getByLabel('رمز تطبيق التحقق').fill('999999');await page.getByRole('button',{name:'تحقق ودخول'}).click();await page.getByText('الرمز غير صحيح أو انتهت صلاحيته.',{exact:false}).waitFor();assert.equal(await page.locator('#app').isVisible(),false);
  await page.screenshot({path:'mfa-results/challenge-'+width+'.png'});
  await page.getByLabel('رمز تطبيق التحقق').fill('012345');await page.getByRole('button',{name:'تحقق ودخول'}).click();await page.locator('#app').waitFor({state:'visible'});
  await page.getByRole('button',{name:'أمان الحساب',exact:true}).click();await page.getByLabel('كلمة المرور الحالية').fill('test-only');await page.getByRole('button',{name:'بدء ربط التطبيق'}).click();await page.getByLabel('مفتاح الإعداد — خاص بك').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  await page.screenshot({path:'mfa-results/setup-'+width+'.png'});
  await page.getByRole('button',{name:'إغلاق',exact:true}).click();await page.getByLabel('مفتاح الإعداد — خاص بك').waitFor({state:'detached'});assert.deepEqual(errors,[]);
  await page.goto(origin+'/temo-plants.html?unverified=1');
  await page.getByLabel('البريد الإلكتروني',{exact:true}).fill('test@example.test');await page.getByLabel('كلمة المرور',{exact:true}).fill('test-only');await page.getByRole('button',{name:'تسجيل الدخول',exact:true}).click();await page.locator('#app').waitFor({state:'visible'});
  await page.getByRole('button',{name:'أمان الحساب',exact:true}).click();
  const emailButton=page.getByRole('button',{name:'إرسال رسالة توثيق البريد',exact:true});await emailButton.click();await page.locator('#notice').waitFor({state:'visible'});assert.equal(await emailButton.isEnabled(),true);assert.equal((await page.locator('#notice').textContent()).includes('null'),false);
  await emailButton.click();await page.getByRole('button',{name:'أُرسلت الرسالة — أكّد البريد ثم سجّل الدخول مجدداً',exact:true}).waitFor();assert.deepEqual(errors,[]);
  await ctx.close();console.log('PASS MFA login, invalid code, enrollment privacy and width '+width);
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}

