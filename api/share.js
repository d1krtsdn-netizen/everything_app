// Called by the iOS Shortcut from the Share button.
import { admin } from './_lib/supabase-admin.js';
import { decodeBase64, detectFileType, extractUrl, parseFile, parseText } from './_lib/parse.js';
import { uploadMedia } from './_lib/media.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  const parsedBody = typeof req.body === 'string' ? safeJson(req.body) : req.body;
  const body = parsedBody && typeof parsedBody === 'object' ? parsedBody : {};
  const token = req.query.token || body.token;
  const file = typeof body.file === 'string' ? body.file.trim() : '';
  const input = [body.url, body.text, req.query.url]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' ');
  const wantedSpace = String(body.space || req.query.space || '').toLowerCase();

  if (!token) return res.status(401).send('Missing token – copy the Shortcut URL from the app Settings.');
  if (!file && !input.trim()) return res.status(400).send('No link, text or file received.');

  const db = admin();
  const { data: profile } = await db.from('profiles').select('id').eq('share_token', token).maybeSingle();
  if (!profile) return res.status(401).send('Invalid token – copy the Shortcut URL again from the app Settings.');

  const { data: rows } = await db
    .from('space_members')
    .select('role, spaces!inner(id, name, type, created_at)')
    .eq('user_id', profile.id)
    .in('role', ['owner', 'editor'])
    .eq('spaces.type', 'events');
  const spaces = (rows || []).map((row) => row.spaces).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const space = spaces.find((candidate) => candidate.name.toLowerCase() === wantedSpace) || spaces[0];
  if (!space) return res.status(404).send('No Events category found. Open the app once first.');

  const url = file ? null : extractUrl(input);
  if (url) {
    const { data: dupes, error } = await db.from('items')
      .select('id, title').eq('space_id', space.id).eq('data->>url', url).limit(1);
    if (error) return res.status(500).send('Could not check for duplicates: ' + error.message);
    if (dupes?.[0]) return res.status(200).send(`Already saved: ${dupes[0].title}`);
  }

  let parsed;
  try {
    parsed = file ? await parseFile(file) : await parseText(input);
  } catch (error) {
    const message = error.message || 'Could not read the shared content';
    return res.status(message.includes('too large') ? 413 : 400).send(message);
  }

  let mimeType = file ? detectFileType(decodeBase64(file)) : null;
  let uploadedUrl = '';
  if (file && mimeType) {
    try { uploadedUrl = await uploadMedia(db, profile.id, file, mimeType); }
    catch (error) { return res.status(500).send(`Could not upload file: ${error.message}`); }
  }

  const events = parsed.events.length
    ? parsed.events
    : [fallbackEvent(parsed.source, input)];
  const attachment = mimeType === 'application/pdf' ? uploadedUrl : '';
  const image = mimeType?.startsWith('image/') ? uploadedUrl : '';
  const records = events.map((event) => {
    const site = event.site || sourceLabel(parsed.source);
    return {
      space_id: space.id,
      title: event.title || event.site || input.trim().slice(0, 250) || sourceLabel(parsed.source),
      status: 'pending',
      due_at: event.start || null,
      created_by: profile.id,
      data: {
        url: event.url || url || '',
        site,
        image: image || event.image || '',
        location: event.location || '',
        price: event.price || '',
        notes: event.notes || '',
        source: parsed.source,
        attachment,
      },
    };
  });

  const { error } = await db.from('items').insert(records);
  if (error) return res.status(500).send('Could not save: ' + error.message);
  if (!parsed.found) return res.status(200).send(`No event found – saved as ${records[0].title}`);
  if (records.length === 1) return res.status(200).send(`Added to Events: ${records[0].title}`);
  return res.status(200).send(`Added ${records.length} events: ${records.map((record) => record.title).join(', ')}`);
}

function sourceLabel(source) {
  return { image: 'Screenshot', pdf: 'PDF', text: 'Message' }[source] || '';
}

function fallbackEvent(source, input) {
  return {
    title: input.trim().slice(0, 250) || sourceLabel(source) || 'Event',
    start: null,
    location: '',
    price: '',
    site: sourceLabel(source),
    url: extractUrl(input) || '',
    notes: '',
  };
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return { text: value }; }
}
