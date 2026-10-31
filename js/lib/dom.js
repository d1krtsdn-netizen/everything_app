// Tiny helpers for building the UI without a framework.

const lightMode = window.matchMedia('(prefers-color-scheme: light)');
const iconPath = (path) => lightMode.matches ? path.replace(/\.svg$/, '_light.svg') : path;

lightMode.addEventListener('change', () => {
  for (const image of document.querySelectorAll('img[data-theme-icon]')) {
    image.src = iconPath(image.dataset.themeIcon);
  }
});

// h('button', { class: 'btn', onclick: fn }, 'Label', child, [more children])
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
    else if (tag === 'img' && k === 'src' && typeof v === 'string' && /^icons\/.*\.svg$/.test(v)) {
      el.dataset.themeIcon = v;
      el.src = iconPath(v);
    } else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

// ---------- dates (UK format) ----------
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  if (d.getHours() || d.getMinutes()) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('en-GB', opts);
}
export const isPast = (iso) => !!iso && new Date(iso) < new Date();
export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const dateAsc = (a, b) => (a ? new Date(a).getTime() : Infinity) - (b ? new Date(b).getTime() : Infinity) || 0;

export function monthSections(items) {
  const monthFormatter = new Intl.DateTimeFormat('en-GB', {
    month: 'long', year: 'numeric', timeZone: 'Europe/London',
  });
  const keyFormatter = new Intl.DateTimeFormat('en-GB', {
    month: '2-digit', year: 'numeric', timeZone: 'Europe/London',
  });
  const groups = new Map();
  const undated = [];

  for (const item of items) {
    if (!item.due_at) { undated.push(item); continue; }
    const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(item.due_at)
      ? `${item.due_at}T12:00:00Z`
      : item.due_at;
    const date = new Date(dateValue);
    if (isNaN(date)) { undated.push(item); continue; }

    const parts = Object.fromEntries(keyFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
    const key = `${parts.year}-${parts.month}`;
    if (!groups.has(key)) groups.set(key, { title: monthFormatter.format(date), items: [] });
    groups.get(key).items.push(item);
  }

  const sections = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, section]) => ({ ...section, divider: true }));
  if (undated.length) sections.push({ title: 'No date', items: undated });
  return sections;
}

// <input type="datetime-local"> uses local time strings
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

// ---------- links ----------
export function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0] : null;
}
export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
