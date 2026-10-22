// Push notification setup on this device.
import { config } from './lib/supabase.js';
import { savePushSubscription } from './store.js';

export async function pushStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'enabled' : 'off';
}

export const PUSH_TEXT = {
  unsupported: 'Notifications only work when the app is opened from its Home Screen icon (Safari → Share → Add to Home Screen).',
  denied: 'Notifications are blocked. Turn them on in iPhone Settings → Notifications → Everything.',
  enabled: 'Notifications are on for this device.',
  off: 'Notifications are off for this device.',
};

// Must be called from a button tap (iOS rule).
export async function enablePush() {
  if ((await pushStatus()) === 'unsupported') throw new Error(PUSH_TEXT.unsupported);
  if (!config.vapidPublicKey) throw new Error('VAPID_PUBLIC_KEY is missing in Vercel environment variables.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(PUSH_TEXT.denied);
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(config.vapidPublicKey) });
  await saveSub(sub);
}

// Keeps this device linked to the signed-in account.
export async function syncPush() {
  if ((await pushStatus()) !== 'enabled') return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await saveSub(sub);
}

function saveSub(sub) {
  const j = sub.toJSON();
  return savePushSubscription({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
}

function b64ToBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
