import { randomUUID } from 'node:crypto';
import { decodeBase64 } from './parse.js';

const EXTENSIONS = {
  'application/pdf': 'pdf',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function uploadMedia(db, userId, base64, mimeType) {
  const extension = EXTENSIONS[mimeType];
  if (!extension) throw new Error(`Unsupported media type: ${mimeType}`);
  const path = `${userId}/${randomUUID()}.${extension}`;
  const { error } = await db.storage.from('event-media').upload(path, decodeBase64(base64), {
    contentType: mimeType,
    upsert: false,
  });
  if (error) {
    const uploadError = new Error(error.message);
    uploadError.stage = 'MEDIA_UPLOAD_STARTED';
    throw uploadError;
  }

  const { data } = db.storage.from('event-media').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Could not create a public URL for the uploaded file');
  return data.publicUrl;
}
