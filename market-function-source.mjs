// Retired endpoint: no credentials, database access or AI calls.
export async function handler(){return {statusCode:410,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({error:'تم إلغاء خدمة التسعير الذكي.'})};}
