// Home screen: grid of categories + "New category".
import { h, fmtDate } from '../lib/dom.js';
import { header, openSheet, field, busy, toast, errorText } from '../lib/ui.js';
import { state, myRole } from '../state.js';
import { getType, typeList } from '../types/index.js';
import { createSpace, loadSpaces, listItems } from '../store.js';

export function renderHome(root) {
  const tiles = state.spaces.map((s) => {
    const t = getType(s.type);
    const tags = [t.label];
    if ((s.space_members?.length || 1) > 1) tags.push('Shared');
    if (myRole(s) === 'viewer') tags.push('View only');
    return h('a', { class: 'tile', href: `#/space/${s.id}` },
      h('div', { class: 'tile-icon' }, s.icon || t.icon),
      h('div', { class: 'tile-name' }, s.name),
      h('div', { class: 'tile-sub' }, tags.join(' · ')));
  });
  tiles.push(h('button', { class: 'tile add', onclick: openNewSpace },
    h('div', { class: 'tile-icon' }, '＋'), h('div', { class: 'tile-name' }, 'New category')));

  const upcoming = h('div', { class: 'upcoming' });
  root.replaceChildren(
    header({ title: 'Everything', right: h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings' }, '⚙︎') }),
    h('main', { class: 'page' }, upcoming, h('div', { class: 'tiles' }, tiles)));

  loadUpcoming(upcoming).catch((error) => {
    if (upcoming.isConnected) toast(errorText(error));
  });
}

async function loadUpcoming(upcoming) {
  const dismissedKey = 'dismissed-upcoming-' + state.user.id;
  const expandedKey = 'upcoming-expanded-' + state.user.id;
  const dismissed = new Set(JSON.parse(localStorage.getItem(dismissedKey) || '[]'));
  const perSpace = await Promise.all(state.spaces.map(async (space) => ({
    space,
    items: await listItems(space.id),
  })));
  if (!upcoming.isConnected) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidates = perSpace.flatMap(({ space, items }) => {
    const type = getType(space.type);
    return items
      .filter((item) => {
        if (item.status === type.doneStatus || ['cancelled', 'not_going', 'paid'].includes(item.status)) return false;
        return [item.due_at, item.remind_at].some((value) => {
          const date = value && new Date(value);
          return date && !isNaN(date) && date >= today;
        });
      })
      .map((item) => {
        const dueDate = item.due_at && new Date(item.due_at);
        const reminderDate = item.remind_at && new Date(item.remind_at);
        const date = dueDate && !isNaN(dueDate) && dueDate >= today
          ? dueDate
          : reminderDate && !isNaN(reminderDate) && reminderDate >= today ? reminderDate : dueDate;
        return { space, type, item, date };
      });
  }).sort((a, b) => a.date - b.date);

  function drawUpcoming() {
    const visible = candidates.filter(({ item }) => !dismissed.has(item.id)).slice(0, 3);
    if (!visible.length) { upcoming.replaceChildren(); return; }

    const details = h('details', {
      class: 'upcoming-panel',
      open: localStorage.getItem(expandedKey) !== 'false',
      ontoggle: (event) => localStorage.setItem(expandedKey, String(event.target.open)),
    },
    h('summary', { class: 'upcoming-heading' },
      h('span', null, 'Upcoming'),
      h('span', { class: 'upcoming-count' }, visible.length)),
    h('div', { class: 'upcoming-items' }, visible.map(({ space, type, item, date }) =>
      h('div', { class: 'upcoming-row' },
        h('a', { class: 'upcoming-link', href: `#/space/${space.id}?item=${encodeURIComponent(item.id)}` },
          h('span', { class: 'upcoming-icon' }, space.icon || type.icon),
          h('span', { class: 'upcoming-info' },
            h('span', { class: 'upcoming-title' }, item.title || `Untitled ${type.itemLabel}`),
            h('span', { class: 'upcoming-category' }, space.name)),
          h('span', { class: 'upcoming-date' }, fmtDate(date))),
        h('button', { class: 'upcoming-dismiss', type: 'button',
          'aria-label': `Dismiss ${item.title || type.itemLabel}`,
          onclick: (event) => {
            event.stopPropagation();
            dismissed.add(item.id);
            localStorage.setItem(dismissedKey, JSON.stringify([...dismissed]));
            drawUpcoming();
          } }, '×')))));
    upcoming.replaceChildren(details);
  }

  drawUpcoming();
}

function openNewSpace() {
  let chosen = 'list';
  const name = h('input', { placeholder: 'e.g. Gift ideas', required: true });
  const icon = h('input', { placeholder: '🎁', maxlength: '4', class: 'emoji-input' });
  const options = h('div', { class: 'type-options' }, typeList().map((t) =>
    h('label', { class: 'type-opt' },
      h('input', { type: 'radio', name: 'type', value: t.id, checked: t.id === chosen, onchange: () => { chosen = t.id; } }),
      h('span', { class: 'type-ico' }, t.icon),
      h('span', null, h('b', null, t.label), h('small', null, t.description)))));
  const save = h('button', { class: 'btn primary wide', type: 'submit' }, 'Create');

  const form = h('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault();
    await busy(save, async () => {
      try {
        const s = await createSpace({ name: name.value.trim(), type: chosen, icon: icon.value.trim() || getType(chosen).icon });
        await loadSpaces();
        close();
        location.hash = `#/space/${s.id}`;
      } catch (err) { toast(errorText(err)); }
    });
  } }, field('Name', name), field('Icon (emoji)', icon), h('span', { class: 'label' }, 'Type'), options, save);
  const close = openSheet('New category', form);
}
