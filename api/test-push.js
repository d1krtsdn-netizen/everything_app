// POST (signed in) → sends a test notification to all of your devices.
import { admin, userFromRequest } from './_lib/supabase-admin.js';
import { sendToUser } from './_lib/push.js';

export default async function handler(req, res) {
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Please sign in again' });
  try {
    const sent = await sendToUser(admin(), user.id, { title: 'Everything', body: 'Test notification ✅', url: '/#/settings' });
    res.json({ sent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
