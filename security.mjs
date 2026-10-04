import {createHash, randomUUID} from 'node:crypto';

export class PublicError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'PublicError'; this.status = status; }
}
export function parseBody(event, maxBytes = 650000) {
  const encoded = String(event.body || '');
  if (encoded.length > maxBytes * 1.4) throw new PublicError('الطلب كبير جداً.', 413);
  const bytes = Buffer.from(encoded, event.isBase64Encoded ? 'base64' : 'utf8');
  if (bytes.length > maxBytes) throw new PublicError('الطلب كبير جداً.', 413);
  let body;
  try { body = JSON.parse(bytes.toString('utf8')); } catch { throw new PublicError('طلب غير صالح.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PublicError('طلب غير صالح.');
  return body;
}
export function errorResponse(error, action = 'unknown') {
  if (error instanceof PublicError || error?.name === 'ValidationError') {
    return {status: error.status || 400, data: {error: error.message}};
  }
  const requestId = randomUUID();
  // Deliberately omit request bodies, messages, tokens, names, emails and images.
  console.error(JSON.stringify({event: 'api-error', requestId, action, code: typeof error?.code === 'string' ? error.code.slice(0,80) : 'unexpected'}));
  return {status: 500, data: {error: 'تعذر إكمال العملية. أعد المحاولة، أو أرسل رقم المرجع للدعم.', requestId}};
}
export async function consumeLimit(db, identity, action, limit = 60, now = Date.now()) {
  const key = createHash('sha256').update(identity + ':' + action).digest('hex');
  // One document per identity/action, overwritten each window; no unbounded time buckets.
  const ref = db.doc('shopRequestLimits/api-' + key);
  await db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data() || {};
    const window = Math.floor(now / 60000);
    const count = old.window === window ? old.count || 0 : 0;
    if (count >= limit) throw new PublicError('محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة.', 429);
    tx.set(ref, {window, count: count + 1, expiresAt: new Date(now + 172800000)});
  });
}
export function requireRecentAdmin(user) {
  // Opt-in rollout only after MFA enrollment and recovery have been verified.
  if (process.env.REQUIRE_ADMIN_MFA === 'true' && !user.firebase?.sign_in_second_factor) {
    throw new PublicError('يلزم تسجيل الدخول بالمصادقة الثنائية لحساب المدير.', 403);
  }
}
