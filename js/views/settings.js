// Settings: account, notifications, Share-button Shortcut.
import { h } from '../lib/dom.js';
import { header, backLink, field, busy, toast, errorText } from '../lib/ui.js';
import { state } from '../state.js';
import { supabase } from '../lib/supabase.js';
import { loadProfile, updateProfile, callApi } from '../store.js';
import { pushStatus, enablePush, PUSH_TEXT } from '../push.js';

export async function renderSettings(root) {
  const p = state.profile || (await loadProfile());

  // Account
  const name = h('input', { value: p.display_name || '' });
  const saveName = h('button', { class: 'btn', type: 'submit' }, 'Save name');

  // Notifications
  const pushText = h('p', { class: 'muted small' });
  const pushBtn = h('button', { class: 'btn primary' }, 'Turn on notifications');
  const testBtn = h('button', { class: 'btn' }, 'Send test notification');
  async function refreshPush() {
    const s = await pushStatus();
    pushText.textContent = PUSH_TEXT[s];
    pushBtn.hidden = s === 'enabled' || s === 'unsupported';
    testBtn.hidden = s !== 'enabled';
  }
  pushBtn.onclick = () => busy(pushBtn, async () => {
    try { await enablePush(); toast('Notifications on'); } catch (e) { toast(errorText(e), 5000); }
    refreshPush();
  });
  testBtn.onclick = () => busy(testBtn, async () => {
    try {
      const r = await callApi('/api/test-push');
      toast(r.sent ? 'Sent – lock your phone to see it' : 'No devices registered – turn notifications on first');
    } catch (e) { toast(errorText(e)); }
  });

  // Shortcut
  const shortcutUrl = () => `${location.origin}/api/share?token=${state.profile.share_token}`;
  const urlBox = h('code', { class: 'code' }, shortcutUrl());
  const copyBtn = h('button', { class: 'btn primary', onclick: async () => {
    try { await navigator.clipboard.writeText(shortcutUrl()); toast('Copied'); } catch { toast('Press and hold the link to copy it'); }
  } }, 'Copy Shortcut URL');
  const resetBtn = h('button', { class: 'btn danger', onclick: async () => {
    if (!confirm('Create a new token? Your current Shortcut will stop working until you paste the new URL into it.')) return;
    const token = [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, '0')).join('');
    try { await updateProfile({ share_token: token }); urlBox.textContent = shortcutUrl(); toast('New URL created'); } catch (e) { toast(errorText(e)); }
  } }, 'Reset');

  root.replaceChildren(
    header({ left: backLink(), title: 'Settings' }),
    h('main', { class: 'page stack' },
      h('section', { class: 'panel' },
        h('h2', null, 'Account'),
        h('p', { class: 'muted small' }, state.user.email),
        h('form', { class: 'form', onsubmit: async (e) => {
          e.preventDefault();
          await busy(saveName, async () => {
            try { await updateProfile({ display_name: name.value.trim() }); toast('Saved'); } catch (err) { toast(errorText(err)); }
          });
        } }, field('Display name (shown to people you share with)', name), saveName),
        h('button', { class: 'btn', onclick: () => supabase.auth.signOut() }, 'Sign out')),

      h('section', { class: 'panel' },
        h('h2', null, 'Notifications'), pushText, pushBtn, testBtn),

      h('section', { class: 'panel' },
        h('h2', null, 'Share button (iOS Shortcut)'),
        h('p', { class: 'muted small' }, 'Paste this URL into the “Get Contents of URL” step of your Shortcut. Keep it private – anyone with it can add events to your list.'),
        urlBox,
        h('div', { class: 'form-actions' }, copyBtn, resetBtn))));

  refreshPush();
}
