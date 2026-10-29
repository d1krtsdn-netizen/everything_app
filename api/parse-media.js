// POST { file } or { text } → event details, with uploaded media URLs where relevant.
import { userFromRequest, admin } from './_lib/supabase-admin.js';
import { decodeBase64, detectFileType, parseFile, parseText } from './_lib/parse.js';
import { uploadMedia } from './_lib/media.js';

export default async function handler(req, res) {
  let stage = 'API_RECEIVED';
  console.log(stage);
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed', stage: 'method_validation' });
    }

    stage = 'AUTHENTICATION';
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Please sign in again', stage: stage.toLowerCase() });

    stage = 'REQUEST_VALIDATION';
    const file = typeof req.body?.file === 'string' ? req.body.file.trim() : '';
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!file && !text) {
      return res.status(400).json({ error: 'No file or text provided', stage: stage.toLowerCase() });
    }

    if (!file) {
      stage = 'TEXT_PARSING';
      const parsed = await parseText(text);
      return res.json({ ...parsed, uploadedUrl: '', mimeType: 'text/plain' });
    }

    stage = 'FILE_DECODE';
    const bytes = decodeBase64(file);
    const mimeType = detectFileType(bytes);
    stage = 'FILE_PARSING';
    const parsed = await parseFile(file);
    let uploadedUrl = '';
    if (mimeType) {
      stage = 'MEDIA_UPLOAD_STARTED';
      console.log(stage, { mimeType, size: bytes.length });
      uploadedUrl = await uploadMedia(admin(), user.id, file, mimeType);
      stage = 'MEDIA_UPLOAD_COMPLETED';
      console.log(stage, { mimeType });
    }
    return res.json({
      events: parsed.events,
      source: parsed.source,
      uploadedUrl,
      mimeType: mimeType || 'text/plain',
    });
  } catch (error) {
    const message = error?.message || String(error || 'Could not read the supplied content');
    const rawStage = error?.stage || stage;
    const errorStage = rawStage.toLowerCase();
    const safeMessage = [process.env.GEMINI_API_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY]
      .filter(Boolean)
      .reduce((value, secret) => value.split(secret).join('[redacted]'), message);
    console.error('parse-media failed', { stage: errorStage, error: safeMessage });
    const isTimeout = error?.code === 'GEMINI_TIMEOUT';
    const isInvalidInput = ['request_validation', 'file_decode'].includes(errorStage)
      || message.includes('too large');
    const status = isTimeout ? 504 : isInvalidInput ? (message.includes('too large') ? 413 : 400) : 500;
    return res.status(status).json({ error: message, stage: errorStage });
  }
}
