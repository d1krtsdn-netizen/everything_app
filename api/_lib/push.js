// Sends web push notifications to every registered device of a user.
import webpush from 'web-push';

let ready = false;
function init() {
  if (ready) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('VAPID keys are missing in Vercel environment variables');
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  ready = true;
}

export async function sendToUser(db, userId, payload) {
  init();
  const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', userId);
  let sent = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      );
      sent++;
    } catch (e) {
      // Device unsubscribed or app removed → forget it
      if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('Push failed', e.statusCode, e.body);
    }
  }
  return sent;
}
