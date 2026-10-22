// Called by the iOS Shortcut from the Share button.
// POST /api/share?token=YOUR_TOKEN   body: { "url": "<shared link>" }   (optional "space": "Events")
// Replies with plain text so the Shortcut can show it as a notification.
import { admin } from './_lib/supabase-admin.js';
import { parseLink, extractUrl } from './_lib/parse.js';

export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  const token = req.query.token || body.token;
  const input = [body.url, body.text, req.query.url].flat().filter(Boolean).join(' ');
  const wantedSpace = String(body.space || req.query.space || '').toLowerCase();

  if (!token) return res.status(401).send('Missing token – copy the Shortcut URL from the app Settings.');
  const url = extractUrl(input);
  if (!url) return res.status(400).send('No link received from the Share button.');

  const db = admin();
  const { data: profile } = await db.from('profiles').select('id').eq('share_token', token).maybeSingle();
  if (!profile) return res.status(401).send('Invalid token – copy the Shortcut URL again from the app Settings.');

  const { data: rows } = await db
    .from('space_members')
    .select('role, spaces!inner(id, name, type, created_at)')
    .eq('user_id', profile.id)
    .in('role', ['owner', 'editor'])
    .eq('spaces.type', 'events');
  const spaces = (rows || []).map((r) => r.spaces).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const space = spaces.find((s) => s.name.toLowerCase() === wantedSpace) || spaces[0];
  if (!space) return res.status(404).send('No Events category found. Open the app once first.');

  const { data: dupes } = await db.from('items').select('id, title').eq('space_id', space.id).eq('data->>url', url).limit(1);
  const existing = dupes?.[0];
  if (existing) return res.status(200).send(`Already saved: ${existing.title}`);

  const info = await parseLink(url);
  const { error } = await db.from('items').insert({
    space_id: space.id,
    title: info.title,
    status: 'pending',
    due_at: info.start,
    created_by: profile.id,
    data: { url: info.url, site: info.site, image: info.image, location: info.location, price: info.price },
  });
  if (error) return res.status(500).send('Could not save: ' + error.message);
  res.status(200).send(`Added to ${space.name}: ${info.title}`);
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return { text: s }; }
}
