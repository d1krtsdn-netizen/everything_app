// Add / edit form – built automatically from the type's "fields" list.
import { h, toLocalInput, fromLocalInput } from '../lib/dom.js';
import { openSheet, field, busy, toast, errorText } from '../lib/ui.js';
import { state, canEdit } from '../state.js';
import { getType } from '../types/index.js';
import { defaults, valueOf, toRow } from '../types/fields.js';
import { createItem, updateItem, deleteItem, parseLink } from '../store.js';
import { pushStatus } from '../push.js';

export function openItemForm(space, item, onSaved) {
  const type = getType(space.type);
  const isNew = !item;
  const editable = canEdit(space);
  const start = isNew ? defaults(type) : {};
  const controls = {};
  const rows = [];
  let statusSel;

  for (const f of type.fields) {
    const c = makeControl(f, isNew ? start[f.key] : valueOf(item, f.key), controls, type);
    controls[f.key] = c;
    rows.push(field(f.label, c.el));
    if (f.key === 'title' && type.statuses?.length) rows.push(statusRow());
  }

  function statusRow() {
    statusSel = h('select', null, type.statuses.map((s) =>
      h('option', { value: s.id, selected: s.id === (item?.status || type.defaultStatus) }, s.label)));
    return field('Status', statusSel);
  }

  const saveBtn = h('button', { class: 'btn primary grow', type: 'submit' }, isNew ? 'Add' : 'Save');
  const delBtn = !isNew && editable ? h('button', { class: 'btn danger', type: 'button', onclick: async () => {
    if (!confirm('Delete this?')) return;
    try { await deleteItem(item.id); close(); onSaved(); } catch (e) { toast(errorText(e)); }
  } }, 'Delete') : null;

  const form = h('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault();
    if (!editable) return;
    const values = {};
    for (const f of type.fields) values[f.key] = controls[f.key].get();
    const missing = type.fields.find((f) => f.required && !values[f.key]);
    if (missing) return toast(`${missing.label} is required`);

    const row = toRow(values, item || {});
    if (statusSel) row.status = statusSel.value;
    const reminderChanged = row.remind_at && (!item?.remind_at || new Date(row.remind_at).getTime() !== new Date(item.remind_at).getTime());
    if (reminderChanged) row.remind_user_id = state.user.id; // reminders go to whoever set them

    await busy(saveBtn, async () => {
      try {
        if (isNew) await createItem({ space_id: space.id, ...row });
        else await updateItem(item.id, row);
        close();
        onSaved();
        if (reminderChanged && (await pushStatus()) !== 'enabled') toast('Reminder saved. Turn on notifications in Settings to receive it.', 4500);
      } catch (err) { toast(errorText(err)); }
    });
  } },
    h('fieldset', { disabled: !editable }, rows),
    h('div', { class: 'form-actions' }, delBtn, editable ? saveBtn : null));

  const title = isNew ? `New ${type.itemLabel}` : editable ? `Edit ${type.itemLabel}` : type.itemLabel;
  const close = openSheet(title.charAt(0).toUpperCase() + title.slice(1), form);
}

function makeControl(f, value, controls, type) {
  let input;
  switch (f.type) {
    case 'textarea':
      input = h('textarea', { rows: '3', placeholder: f.placeholder || '' });
      input.value = value ?? '';
      break;
    case 'select':
      input = h('select', null, f.options.map((o) => {
        const v = o.value ?? o;
        return h('option', { value: v, selected: v === (value ?? f.default) }, o.label ?? o);
      }));
      break;
    case 'datetime':
      input = h('input', { type: 'datetime-local', value: toLocalInput(value) });
      break;
    case 'number':
      input = h('input', { type: 'number', step: f.step || 'any', inputmode: 'decimal', value: value ?? '' });
      break;
    case 'checkbox':
      input = h('input', { type: 'checkbox', checked: !!value });
      break;
    default:
      input = h('input', { type: f.type === 'url' ? 'url' : 'text', placeholder: f.placeholder || '', value: value ?? '',
        autocapitalize: f.type === 'url' ? 'off' : null, inputmode: f.type === 'url' ? 'url' : null });
  }

  const get = () =>
    f.type === 'datetime' ? fromLocalInput(input.value)
    : f.type === 'checkbox' ? input.checked
    : f.type === 'number' ? (input.value === '' ? null : Number(input.value))
    : input.value.trim();
  const set = (v) => {
    if (f.type === 'datetime') input.value = toLocalInput(v);
    else if (f.type === 'checkbox') input.checked = !!v;
    else input.value = v ?? '';
    refreshPreview();
  };

  let el = input;
  let refreshPreview = () => {};

  // "Fetch details" button next to a link field (types with fromLink)
  if (f.importButton && type.fromLink) {
    const btn = h('button', { type: 'button', class: 'btn small' }, 'Fetch details');
    btn.addEventListener('click', () => busy(btn, async () => {
      if (!input.value.trim()) return toast('Paste a link first');
      try {
        const values = type.fromLink(await parseLink(input.value.trim()));
        for (const [k, v] of Object.entries(values)) if (v && controls[k] && !controls[k].get()) controls[k].set(v);
        toast('Details filled in');
      } catch (e) { toast(errorText(e)); }
    }));
    el = h('div', { class: 'input-row' }, input, btn);
  }

  // Quick reminder buttons ("1 day before" the date field)
  if (f.presets) {
    el = h('div', null, el, h('div', { class: 'presets' },
      f.presets.map((p) => h('button', { type: 'button', class: 'chip small', onclick: () => {
        const base = controls[p.from]?.get();
        if (!base) return toast('Set the date first');
        set(new Date(new Date(base).getTime() - p.minutes * 60000).toISOString());
      } }, p.label)),
      h('button', { type: 'button', class: 'chip small', onclick: () => set(null) }, 'Clear')));
  }

  if (f.logoButtons) {
    const preview = h('span', { class: 'logo-preview' });
    const previewImage = h('img', {
      class: 'logo-preview-image', alt: '', hidden: true,
      onerror: () => { previewImage.hidden = true; previewFallback.hidden = false; },
    });
    const previewFallback = h('span', { class: 'logo-preview-fallback' });
    preview.replaceChildren(previewImage, previewFallback);
    refreshPreview = () => {
      const url = input.value.trim();
      const name = controls.title?.get() || '';
      previewFallback.textContent = Array.from(name.trim())[0] || '?';
      if (url !== previewImage.dataset.url) {
        previewImage.dataset.url = url;
        previewImage.hidden = !url;
        previewFallback.hidden = !!url;
        if (url) previewImage.src = url;
      } else if (!url) {
        previewImage.hidden = true;
        previewFallback.hidden = false;
      }
    };

    input.addEventListener('input', refreshPreview);
    controls.title?.el.addEventListener('input', refreshPreview);

    const useWebsiteLogo = h('button', { type: 'button', class: 'btn small', onclick: () => {
      const website = controls.website?.get();
      if (!website) return toast('Add the website first');
      try {
        const domain = new URL(website).hostname;
        if (!domain) throw new Error('Website has no domain');
        set(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`);
      } catch { toast('Enter a valid website URL'); }
    } }, 'Use website logo');
    const searchOnline = h('button', { type: 'button', class: 'btn small', onclick: () => {
      const name = controls.title?.get();
      if (!name) return toast('Add a name first');
      window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${name} logo`)}`, '_blank', 'noopener,noreferrer');
    } }, 'Search online');
    el = h('div', { class: 'logo-field' },
      h('div', { class: 'logo-input-row' }, input, preview),
      h('div', { class: 'logo-tools' }, useWebsiteLogo, searchOnline));
    refreshPreview();
  }

  return { el, get, set };
}
