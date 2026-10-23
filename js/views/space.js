// One category screen – works for every type (layout comes from js/types/<type>.js).
import { h } from '../lib/dom.js';
import { header, backLink, openSheet, field, busy, toast, errorText } from '../lib/ui.js';
import { state, myRole, canEdit } from '../state.js';
import { getType } from '../types/index.js';
import { newItem } from '../types/fields.js';
import { defaultCard } from './card.js';
import { openItemForm } from './item-form.js';
import { openSharing } from './share-sheet.js';
import {
  loadSpaces, listItems, createItem, updateItem, watchItems, parseLink,
  updateSpace, deleteSpace, removeMember,
} from '../store.js';

export async function renderSpace(root, spaceId, params) {
  let space = state.spaces.find((s) => s.id === spaceId);
  if (!space) { await loadSpaces(); space = state.spaces.find((s) => s.id === spaceId); }
  if (!space) { location.hash = '#/'; return; }

  const type = getType(space.type);
  const editable = canEdit(space);
  const filters = type.filters || [
    { id: 'all', label: 'All', test: () => true },
    ...type.statuses.map((s) => ({ id: s.id, label: s.label, test: (i) => i.status === s.id })),
  ];
  let filter = sessionStorage.getItem('filter-' + spaceId) || type.defaultFilter || filters[0].id;
  let items = [];
  const openSections = {};

  const list = h('div', { class: 'list' });
  const chips = h('div', { class: 'chips' });
  const suggestions = h('datalist', { id: 'suggest-' + spaceId });

  const reload = async () => {
    try { items = await listItems(spaceId); draw(); } catch (e) { toast(errorText(e)); }
  };

  async function patchItem(item, patch) {
    if (!editable) return toast('View only');
    Object.assign(item, patch);
    draw();
    try { await updateItem(item.id, patch); } catch (e) { toast(errorText(e)); reload(); }
  }

  // What every card can do (passed to type.card / defaultCard)
  const ctxFor = (item) => ({
    space, type, item, canEdit: editable,
    edit: () => openItemForm(space, item, reload),
    update: (patch) => patchItem(item, patch),
    setStatus: (status) => patchItem(item, { status }),
    cycleStatus: () => {
      const ids = type.statuses.map((s) => s.id);
      patchItem(item, { status: ids[(ids.indexOf(item.status) + 1) % ids.length] });
    },
    toggleDone: () => patchItem(item, { status: item.status === type.doneStatus ? type.defaultStatus : type.doneStatus }),
  });

  // What quick-add handlers can do (passed to type.onQuickAdd)
  const helpers = {
    space, type, toast, parseLink,
    get items() { return items; },
    create: (values) => createItem(newItem(space, type, values)),
    update: (id, patch) => updateItem(id, patch),
  };

  function draw() {
    chips.replaceChildren(...(type.hideFilters ? [] : filters.map((f) =>
      h('button', { class: 'chip' + (f.id === filter ? ' on' : ''), onclick: () => {
        filter = f.id; sessionStorage.setItem('filter-' + spaceId, filter); draw();
      } }, f.label, ' ', h('span', { class: 'count' }, items.filter(f.test).length)))));

    const active = filters.find((x) => x.id === filter) || filters[0];
    const shown = type.hideFilters ? [...items] : items.filter(active.test);
    if (type.sort) shown.sort(type.sort);

    const sections = type.sections ? type.sections(shown) : [{ items: shown }];
    const out = [];
    for (const sec of sections) {
      const cards = sec.items.map((it) => (type.card || defaultCard)(it, ctxFor(it)));
      if (!sec.title) { out.push(...cards); continue; }
      if (!sec.items.length) continue;
      if (sec.collapsible) {
        out.push(h('details', { class: 'section', open: openSections[sec.title] ?? !sec.collapsed,
          ontoggle: (e) => { openSections[sec.title] = e.target.open; } },
          h('summary', null, sec.title, ' ', h('span', { class: 'count' }, sec.items.length)), cards));
      } else {
        out.push(h('section', { class: 'section' + (sec.divider ? ' month-section' : '') },
          h('h3', { class: 'section-title' + (sec.divider ? ' month-divider' : '') }, sec.title), cards));
      }
    }
    if (!shown.filter((i) => type.hideFilters ? i.status !== type.doneStatus : true).length) {
      out.unshift(h('div', { class: 'empty' }, type.emptyText || 'Nothing here yet.'));
    }
    list.replaceChildren(...out);

    if (type.suggestFromItems) {
      const titles = [...new Set(items.map((i) => i.title))].sort();
      suggestions.replaceChildren(...titles.map((t) => h('option', { value: t })));
    }
  }

  // Quick add bar
  const qa = h('input', { class: 'quick-input', placeholder: type.quickAddPlaceholder || `Add ${type.itemLabel}…`,
    enterkeyhint: 'done', list: type.suggestFromItems ? suggestions.id : null });
  const quick = h('form', { class: 'quick-add', onsubmit: async (e) => {
    e.preventDefault();
    const text = qa.value.trim();
    if (!text) return;
    qa.value = '';
    try {
      await (type.onQuickAdd ? type.onQuickAdd(text, helpers) : helpers.create({ title: text }));
      await reload();
    } catch (err) { toast(errorText(err)); }
  } }, qa, suggestions,
    h('button', { type: 'button', class: 'icon-btn add-btn', 'aria-label': 'Add with details',
      onclick: () => openItemForm(space, null, reload) }, '＋'));

  const members = space.space_members?.length || 1;
  root.replaceChildren(
    header({
      left: backLink(),
      title: `${space.icon || type.icon} ${space.name}`,
      right: [
        h('button', { class: 'icon-btn', 'aria-label': 'Share', onclick: () => openSharing(space) },
          '👥', members > 1 ? h('span', { class: 'badge' }, members) : null),
        h('button', { class: 'icon-btn', 'aria-label': 'Category options', onclick: () => openSpaceMenu(space) }, '⋯'),
      ],
    }),
    h('main', { class: 'page' },
      editable ? quick : h('p', { class: 'muted small' }, 'View only – shared with you.'),
      chips, list));

  // Live updates from other people / devices
  let timer;
  const stop = watchItems(spaceId, () => { clearTimeout(timer); timer = setTimeout(reload, 300); });

  await reload();

  // Opened from a notification → show that item
  const target = params?.get('item') && items.find((i) => i.id === params.get('item'));
  if (target) openItemForm(space, target, reload);

  return stop; // router calls this when leaving the screen
}

function openSpaceMenu(space) {
  const owner = myRole(space) === 'owner';
  const name = h('input', { value: space.name });
  const icon = h('input', { value: space.icon || '', class: 'emoji-input', maxlength: '4' });
  const save = h('button', { class: 'btn primary wide', type: 'submit' }, 'Save');

  const body = h('div', { class: 'stack' },
    owner ? h('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      await busy(save, async () => {
        try {
          await updateSpace(space.id, { name: name.value.trim() || space.name, icon: icon.value.trim() || null });
          await loadSpaces();
          close();
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } catch (err) { toast(errorText(err)); }
      });
    } }, field('Name', name), field('Icon (emoji)', icon), save) : null,
    h('div', { class: 'danger-zone' }, owner
      ? h('button', { class: 'btn danger wide', onclick: async () => {
        if (!confirm(`Delete "${space.name}" and everything in it? It will also disappear for anyone you shared it with.`)) return;
        try { await deleteSpace(space.id); await loadSpaces(); close(); location.hash = '#/'; } catch (err) { toast(errorText(err)); }
      } }, 'Delete category')
      : h('button', { class: 'btn danger wide', onclick: async () => {
        if (!confirm('Leave this shared category?')) return;
        try { await removeMember(space.id, state.user.id); await loadSpaces(); close(); location.hash = '#/'; } catch (err) { toast(errorText(err)); }
      } }, 'Leave category')));

  const close = openSheet(owner ? 'Category options' : space.name, body);
}
