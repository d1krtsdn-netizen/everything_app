// One category screen – works for every type (layout comes from js/types/<type>.js).
import { h } from '../lib/dom.js';
import { header, backLink, openSheet, field, busy, toast, errorText } from '../lib/ui.js';
import { state, myRole, canEdit } from '../state.js';
import { getType } from '../types/index.js';
import { iconContent, iconOptions } from '../lib/icons.js';
import { newItem } from '../types/fields.js';
import { defaultCard } from './card.js';
import { openItemForm } from './item-form.js';
import { openSharing } from './share-sheet.js';
import {
  loadSpaces, listItems, listMembers, createItem, updateItem, watchItems, parseLink, parseMedia,
  updateSpace, deleteSpace, removeMember,
} from '../store.js';

export async function renderSpace(root, spaceId, params) {
  let space = state.spaces.find((s) => s.id === spaceId);
  if (!space) { await loadSpaces(); space = state.spaces.find((s) => s.id === spaceId); }
  if (!space) { location.hash = '#/'; return; }

  const type = getType(space.type);
  const editable = canEdit(space);
  let memberLabels = new Map();
  try {
    const members = await listMembers(spaceId);
    memberLabels = new Map(members.map((member) => [
      member.user_id,
      member.profiles?.display_name || member.profiles?.email || 'Member',
    ]));
  } catch (error) {
    toast(`Could not load assignee names: ${errorText(error)}`);
  }
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

  const renderCard = (item, card) => {
    const cardElement = card(item, ctxFor(item));
    const assigneeId = item.data?.assignee_id;
    if (!assigneeId) return cardElement;

    const assigneeName = memberLabels.get(assigneeId) || 'Former member';
    cardElement.classList.add('has-assignee');
    if (view === 'list') cardElement.classList.add(`list-assignee-${type.id}`);
    cardElement.append(h('span', {
      class: 'card-assignee',
      title: `Assigned to ${assigneeName}`,
    }, assigneeName));
    return cardElement;
  };

  // What quick-add handlers can do (passed to type.onQuickAdd)
  const lastAssigneeKey = `last-assignee-${state.user.id}-${space.id}`;
  const helpers = {
    space, type, toast, parseLink, parseMedia,
    get items() { return items; },
    create: (values) => {
      const item = newItem(space, type, values);
      const assigneeId = localStorage.getItem(lastAssigneeKey);
      if (assigneeId && space.space_members?.some((member) => member.user_id === assigneeId)) {
        item.data.assignee_id = assigneeId;
      }
      return createItem(item);
    },
    update: (id, patch) => updateItem(id, patch),
  };

  function draw() {
    list.className = 'list'
      + (legacyLayouts && view === 'compact' ? ' compact-list' : '')
      + (supportsLayouts && view === 'grid' ? ' grid-list' : '')
      + (supportsLayouts && view === 'grid' && type.id === 'shopping' ? ' shopping-grid-list' : '');
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
    const sectionItemCount = (section) => section.items?.length
      || section.children?.reduce((count, child) => count + sectionItemCount(child), 0)
      || 0;
    for (const sec of sections) {
      if (sec.children) {
        const childSections = sec.children.filter((child) => sectionItemCount(child));
        if (!childSections.length) continue;
        const childCard = view === 'grid' && type.gridCard
          ? type.gridCard
          : type.card || defaultCard;
        const renderChild = (child) => h('section', {
          class: 'subsection' + (view === 'grid' && type.id === 'shopping' && !child.children
            ? ' shopping-grid-cards' : ''),
        },
          h('h4', { class: 'subsection-title' }, child.title),
          child.children
            ? child.children.filter((nested) => sectionItemCount(nested)).map(renderChild)
            : child.items.map((item) => renderCard(item, childCard)));
        const content = childSections.map(renderChild);
        if (sec.collapsible) {
          out.push(h('details', { class: 'section', open: openSections[sec.title] ?? !sec.collapsed,
            ontoggle: (e) => { openSections[sec.title] = e.target.open; } },
            h('summary', null, sec.title, ' ', h('span', { class: 'count' }, sectionItemCount(sec))), content));
        } else {
          out.push(h('section', { class: 'section' },
            h('h3', { class: 'section-title' }, sec.title),
            content));
        }
        continue;
      }
      const card = view === 'grid' && type.gridCard
        ? type.gridCard
        : view === 'compact' && type.compactCard ? type.compactCard : type.card || defaultCard;
      const cards = sec.items.map((it) => renderCard(it, card));
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
  const fileInput = type.attachButton
    ? h('input', { type: 'file', accept: 'image/*,application/pdf', hidden: true })
    : null;
  if (fileInput) fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    console.log('FILE_SELECTED', {
      filename: file.name,
      mimeType: file.type,
      originalSize: file.size,
    });
    try {
      await type.onAttach(file, helpers);
      await reload();
    } catch (error) {
      console.error(error);
      toast(`Could not create event: ${errorText(error)}`);
    } finally {
      fileInput.value = '';
    }
  });
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
    fileInput,
    type.attachButton ? h('button', { type: 'button', class: 'icon-btn attach-btn',
      'aria-label': 'Attach an image or PDF', title: 'Attach an image or PDF',
      onclick: () => fileInput.click() }, '📎') : null,
    h('button', { type: 'button', class: 'icon-btn add-btn', 'aria-label': 'Add with details',
      onclick: () => openItemForm(space, null, reload) }, '＋'));

  const members = space.space_members?.length || 1;
  const filterAndView = supportsLayouts
    ? h('div', { class: 'filter-bar' }, chips, viewControls)
    : [legacyLayouts ? viewControls : null, chips];
  root.replaceChildren(
    header({
      left: backLink(),
      title: h('span', { class: 'space-header-title' },
        iconContent(space.icon || type.icon, 'category-icon-image'), space.name),
      right: [
        h('button', { class: 'icon-btn', 'aria-label': 'Share', onclick: () => openSharing(space) },
          h('img', { class: 'share-icon-image', src: 'icons/User_Sharing.svg', alt: '' }),
          members > 1 ? h('span', { class: 'badge' }, members) : null),
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
  const isLibraryIcon = (icon) => icon?.startsWith('icons/list_icons/');
  const icon = iconOptions(isLibraryIcon(space.icon) ? space.icon : '', !isLibraryIcon(space.icon));
  const emoji = h('input', {
    value: isLibraryIcon(space.icon) ? '' : space.icon || '',
    placeholder: '📝',
    maxlength: '4',
    class: 'emoji-input',
  });
  icon.addEventListener('change', () => { emoji.value = ''; });
  const save = h('button', { class: 'btn primary wide', type: 'submit' }, 'Save');

  const body = h('div', { class: 'stack' },
    owner ? h('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      await busy(save, async () => {
        try {
          await updateSpace(space.id, {
            name: name.value.trim() || space.name,
            icon: emoji.value.trim() || icon.value || getType(space.type).icon,
          });
          await loadSpaces();
          close();
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } catch (err) { toast(errorText(err)); }
      });
    } }, field('Name', name), field('Icon', icon), field('Or use your own emoji', emoji), save) : null,
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
