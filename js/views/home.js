// Home screen: grid of categories + "New category".
import { h } from '../lib/dom.js';
import { header, openSheet, field, busy, toast, errorText } from '../lib/ui.js';
import { state, myRole } from '../state.js';
import { getType, typeList } from '../types/index.js';
import { createSpace, loadSpaces } from '../store.js';

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

  root.replaceChildren(
    header({ title: 'Everything', right: h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings' }, '⚙︎') }),
    h('main', { class: 'page' }, h('div', { class: 'tiles' }, tiles)));
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
