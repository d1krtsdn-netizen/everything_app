// Called every minute by Supabase cron (see supabase/cron.sql). Sends due reminders.
import { admin } from './_lib/supabase-admin.js';
import { sendToUser } from './_lib/push.js';

const TZ = process.env.APP_TIMEZONE || 'Europe/London';

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  const db = admin();
  const { data: due, error } = await db
    .from('items')
    .select('id, title, space_id, due_at, remind_user_id, created_by, spaces(name, icon)')
    .eq('reminded', false)
    .not('remind_at', 'is', null)
    .lte('remind_at', new Date().toISOString())
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });

  let sent = 0;
  for (const it of due || []) {
    const when = it.due_at
      ? ' · ' + new Date(it.due_at).toLocaleString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    try {
      sent += await sendToUser(db, it.remind_user_id || it.created_by, {
        title: `${it.spaces?.icon || '🔔'} ${it.spaces?.name || 'Reminder'}`,
        body: it.title + when,
        url: `/#/space/${it.space_id}?item=${it.id}`,
      });
    } catch (e) {
      console.error(e);
    }
    await db.from('items').update({ reminded: true }).eq('id', it.id);
  }
  res.json({ due: due?.length || 0, sent });
}
