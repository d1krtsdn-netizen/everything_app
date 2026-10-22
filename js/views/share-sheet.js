// "Share category" sheet: members, roles, invites.
import { h } from '../lib/dom.js';
import { openSheet, busy, toast, errorText } from '../lib/ui.js';
import { state, myRole } from '../state.js';
import { listMembers, listInvites, createInvite, cancelInvite, setMemberRole, removeMember, loadSpaces } from '../store.js';

const ROLE_LABEL = { owner: 'Owner', editor: 'Can edit', viewer: 'View only' };

const roleSelect = (value, onChange) =>
  h('select', { onchange: (e) => onChange(e.target.value) },
    ['editor', 'viewer'].map((r) => h('option', { value: r, selected: r === value }, ROLE_LABEL[r])));

export function openSharing(space) {
  const owner = myRole(space) === 'owner';
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'Loading…'));
  openSheet(`Share “${space.name}”`, body);

  async function draw() {
    const [members, invites] = await Promise.all([listMembers(space.id), owner ? listInvites(space.id) : []]);

    const people = members.map((m) => {
      const label = m.profiles?.display_name || m.profiles?.email || 'Someone';
      return h('div', { class: 'person' },
        h('div', { class: 'avatar' }, label[0].toUpperCase()),
        h('div', { class: 'grow' },
          h('div', null, label, m.user_id === state.user.id ? ' (you)' : ''),
          h('small', { class: 'muted' }, m.profiles?.email || '')),
        owner && m.role !== 'owner'
          ? [roleSelect(m.role, async (r) => { try { await setMemberRole(space.id, m.user_id, r); toast('Updated'); } catch (e) { toast(errorText(e)); } }),
             h('button', { class: 'icon-btn', 'aria-label': 'Remove', onclick: async () => {
               if (!confirm(`Remove ${label}?`)) return;
               try { await removeMember(space.id, m.user_id); await loadSpaces(); draw(); } catch (e) { toast(errorText(e)); }
             } }, '✕')]
          : h('span', { class: 'role' }, ROLE_LABEL[m.role]));
    });

    const pending = invites.map((i) => h('div', { class: 'person' },
      h('div', { class: 'avatar' }, '✉︎'),
      h('div', { class: 'grow' }, h('div', null, i.email), h('small', { class: 'muted' }, 'Invited · ' + ROLE_LABEL[i.role])),
      h('button', { class: 'icon-btn', 'aria-label': 'Cancel invite', onclick: async () => {
        try { await cancelInvite(i.id); draw(); } catch (e) { toast(errorText(e)); }
      } }, '✕')));

    let role = 'editor';
    const email = h('input', { type: 'email', placeholder: 'Their email address', required: true, autocapitalize: 'off' });
    const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Invite');
    const form = owner
      ? h('form', { class: 'form', onsubmit: async (e) => {
        e.preventDefault();
        await busy(btn, async () => {
          try { await createInvite(space.id, email.value, role); toast('Invited'); draw(); } catch (err) { toast(errorText(err)); }
        });
      } },
        h('span', { class: 'label' }, 'Invite someone'), email, roleSelect(role, (r) => { role = r; }), btn,
        h('p', { class: 'muted small' }, 'They get access as soon as they sign in to the app with this email. Send them the app link:'),
        h('button', { type: 'button', class: 'btn', onclick: async () => {
          try { await navigator.clipboard.writeText(location.origin); toast('App link copied'); } catch { toast(location.origin, 5000); }
        } }, 'Copy app link'))
      : h('p', { class: 'muted small' }, 'Only the owner can invite people.');

    body.replaceChildren(h('span', { class: 'label' }, 'People with access'), ...people, ...pending, form);
  }
  draw().catch((e) => toast(errorText(e)));
}
