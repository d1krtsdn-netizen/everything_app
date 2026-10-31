// Called every minute by Supabase cron (see supabase/cron.sql). Sends due reminders.
import { admin } from './_lib/supabase-admin.js';
import { sendToUser } from './_lib/push.js';

const TZ = process.env.APP_TIMEZONE || 'Europe/London';

function advanceDate(value, frequency) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  if (frequency === 'Weekly') {
    date.setUTCDate(date.getUTCDate() + 7);
  } else if (frequency === 'Monthly') {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
  } else if (frequency === 'Yearly') {
    const day = date.getUTCDate();
    const month = date.getUTCMonth();
    date.setUTCDate(1);
    date.setUTCFullYear(date.getUTCFullYear() + 1);
    date.setUTCMonth(month);
    date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate()));
  } else return null;

  return date.toISOString();
}

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  const db = admin();
  const now = new Date();
  const { data: automaticBills, error: automaticBillsError } = await db
    .from('items')
    .select('id, due_at, remind_at, status, data, spaces!inner(type)')
    .eq('spaces.type', 'bills')
    .eq('status', 'due')
    .contains('data', { payment_method: 'Automatic' })
    .not('due_at', 'is', null)
    .lte('due_at', now.toISOString())
    .order('due_at', { ascending: true })
    .limit(100);
  if (automaticBillsError) return res.status(500).json({ error: automaticBillsError.message });

  const automaticUpdateErrors = [];
  let automaticUpdated = 0;
  for (const bill of automaticBills || []) {
    const frequency = bill.data?.frequency;
    if (!['Weekly', 'Monthly', 'Yearly'].includes(frequency)) continue;

    let nextDue = bill.due_at;
    let nextReminder = bill.remind_at;
    do {
      nextDue = advanceDate(nextDue, frequency);
      if (!nextDue) break;
      if (nextReminder) nextReminder = advanceDate(nextReminder, frequency);
    } while (new Date(nextDue) <= now);
    if (!nextDue) continue;

    const patch = { due_at: nextDue };
    if (bill.remind_at) patch.remind_at = nextReminder;
    const { data, error } = await db.from('items').update(patch)
      .eq('id', bill.id)
      .eq('due_at', bill.due_at)
      .eq('status', 'due')
      .contains('data', { payment_method: 'Automatic' })
      .select('id');
    if (error) {
      console.error(`Could not advance automatic bill ${bill.id}:`, error);
      automaticUpdateErrors.push(bill.id);
    } else if (data?.length) {
      automaticUpdated += 1;
    }
  }

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
  if (automaticUpdateErrors.length) {
    return res.status(500).json({
      error: `Could not advance ${automaticUpdateErrors.length} automatic bill(s)`,
      automaticUpdateErrors,
    });
  }
  res.json({ due: due?.length || 0, sent, automaticUpdated });
}
