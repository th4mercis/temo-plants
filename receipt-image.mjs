import sharp from 'sharp';
import {PublicError} from './security.mjs';

export async function normalizeReceiptImage(image) {
  if (typeof image !== 'string' || image.length > 610000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    throw new PublicError('أرفق صورة إيصال JPEG صالحة وأقل من 450KB.');
  }
  const bytes = Buffer.from(image.split(',')[1], 'base64');
  if (bytes.length < 100 || bytes.length > 450000) throw new PublicError('حجم الإيصال غير صالح.');
  try {
    const decoder = sharp(bytes, {limitInputPixels: 12_000_000, failOn: 'warning'});
    const metadata = await decoder.metadata();
    if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height) throw new Error();
    const normalized = await decoder.rotate()
      .resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true})
      .jpeg({quality:80}).timeout({seconds:5}).toBuffer();
    if (normalized.length > 450000) throw new Error();
    return 'data:image/jpeg;base64,' + normalized.toString('base64');
  } catch {
    throw new PublicError('تعذر قراءة الإيصال. أرفق صورة واضحة وسليمة بحجم أصغر.');
  }
}
