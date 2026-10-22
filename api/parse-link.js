// POST { url } → event details. Used by the app's "Fetch details" and quick-add.
import { userFromRequest } from './_lib/supabase-admin.js';
import { parseLink } from './_lib/parse.js';

export default async function handler(req, res) {
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Please sign in again' });
  const url = req.body?.url || req.query.url;
  if (!url) return res.status(400).json({ error: 'No link provided' });
  try {
    res.json(await parseLink(url));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
