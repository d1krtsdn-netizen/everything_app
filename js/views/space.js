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
  const viewKey = 'space-view-' + spaceId;
  const supportsLayouts = type.layouts?.length > 1;
  const legacyLayouts = !supportsLayouts && type.compactCard;
  const layouts = supportsLayouts ? type.layouts : legacyLayouts ? ['list', 'compact'] : ['list'];
  const storedView = localStorage.getItem(viewKey);
  let view = layouts.includes(storedView) ? storedView : 'list';
  let items = [];
  const openSections = {};

  const pageSummary = type.summary ? h('div', { class: 'space-summary' }) : null;
  const list = h('div', { class: 'list' });
  const chips = h('div', { class: 'chips' });
  const viewControls = h('div', { class: 'view-controls', 'aria-label': 'Card layout' });
  const suggestions = h('datalist', { id: 'suggest-' + spaceId });

  const reload = async () => {
    try { items = await listItems(spaceId); draw(); } catch (e) { toast(errorText(e)); }
  };

  async function patchItem(item, patch) {
    if (!editable) { toast('View only'); return false; }
    Object.assign(item, patch);
    draw();
    try { await updateItem(item.id, patch); return true; }
    catch (e) { toast(errorText(e)); reload(); return false; }
  }

  // What every card can do (passed to type.card / defaultCard)
  const ctxFor = (item) => ({
    space, type, item, canEdit: editable, toast,
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
    list.className = 'list'
      + (legacyLayouts && view === 'compact' ? ' compact-list' : '')
      + (supportsLayouts && view === 'grid' ? ' grid-list' : '');
    if (supportsLayouts || legacyLayouts) {
      const labels = supportsLayouts
        ? { list: ['List view', '☰'], grid: ['Grid view', '▦'] }
        : { list: ['List view', '☰'], compact: ['Compact grid view', '▦'] };
      viewControls.replaceChildren(...layouts.map((layout) =>
        h('button', { class: 'view-toggle' + (view === layout ? ' on' : ''), type: 'button',
          'aria-label': labels[layout][0], 'aria-pressed': String(view === layout), title: labels[layout][0],
          onclick: () => setView(layout) }, labels[layout][1])));
    } else viewControls.replaceChildren();

    chips.replaceChildren(...(type.hideFilters ? [] : filters.map((f) =>
      h('button', { class: 'chip' + (f.id === filter ? ' on' : ''), onclick: () => {
        filter = f.id; sessionStorage.setItem('filter-' + spaceId, filter); draw();
      } }, f.label, ' ', h('span', { class: 'count' }, items.filter(f.test).length)))));

    const active = filters.find((x) => x.id === filter) || filters[0];
    const shown = type.hideFilters ? [...items] : items.filter(active.test);
    if (type.sort) shown.sort(type.sort);

    const sections = view === 'grid' && type.gridSections
      ? type.gridSections(shown, items)
      : type.sections ? type.sections(shown, items) : [{ items: shown }];
    if (pageSummary) pageSummary.replaceChildren(type.summary(items));
    const out = [];
    for (const sec of sections) {
      if (sec.children) {
        const childSections = sec.children.filter((child) => child.items.length);
        if (!childSections.length) continue;
        out.push(h('section', { class: 'section' },
          h('h3', { class: 'section-title' }, sec.title),
          childSections.map((child) => h('section', { class: 'subsection' },
            h('h4', { class: 'subsection-title' }, child.title),
            child.items.map((item) => (type.card || defaultCard)(item, ctxFor(item)))))));
        continue;
      }
      const card = view === 'grid' && type.gridCard
        ? type.gridCard
        : view === 'compact' && type.compactCard ? type.compactCard : type.card || defaultCard;
      const cards = sec.items.map((it) => card(it, ctxFor(it)));
      if (!sec.title) { out.push(...cards); continue; }
      if (!sec.items.length) continue;
      if (sec.collapsible) {
        out.push(h('details', { class: 'section', open: openSections[sec.title] ?? !sec.collapsed,
          ontoggle: (e) => { openSections[sec.title] = e.target.open; } },
          h('summary', null, sec.title, ' ', h('span', { class: 'count' }, sec.items.length)), cards));
      } else {
        out.push(h('section', { class: 'section' + (sec.divider ? ' month-section' : '') },
          h('h3', { class: 'section-title' + (sec.divider ? ' month-divider' : '') },
            sec.title, sec.total != null ? h('span', { class: 'section-total' }, sec.total) : null), cards));
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

  function setView(nextView) {
    view = nextView;
    localStorage.setItem(viewKey, view);
    draw();
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
  const filterAndView = supportsLayouts
    ? h('div', { class: 'filter-bar' }, chips, viewControls)
    : [legacyLayouts ? viewControls : null, chips];
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
      pageSummary,
      editable ? quick : h('p', { class: 'muted small' }, 'View only – shared with you.'),
      filterAndView, list));

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
