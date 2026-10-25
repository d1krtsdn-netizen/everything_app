// Shared UI pieces: header, bottom sheet, toast, form field, busy buttons.
import { h } from './dom.js';

export function header({ title, left, right }) {
  return h('header', { class: 'topbar' },
    h('div', { class: 'tb-side' }, left),
    h('h1', { class: 'tb-title' }, title),
    h('div', { class: 'tb-side right' }, right));
}

export const backLink = (href = '#/') => h('a', { class: 'icon-btn', href, 'aria-label': 'Back' }, 
  h('img', { class: 'share-icon-image', src: 'icons/Back_Chevron.svg', alt: '' }),
);

// Opens a bottom sheet. Returns a close() function.
export function openSheet(title, body) {
  const root = document.getElementById('modal-root');
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 200); };
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet' },
      h('div', { class: 'sheet-head' },
        h('h2', null, title),
        h('button', { class: 'icon-btn', type: 'button', onclick: close, 'aria-label': 'Close' }, '✕')),
      body));
  root.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  return close;
}

export function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}

export const field = (label, input) => h('label', { class: 'field' }, h('span', { class: 'label' }, label), input);

// Disables a button while an async action runs.
export async function busy(btn, fn) {
  const text = btn.textContent;
  btn.disabled = true;
  btn.textContent = '…';
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = text; }
}

export const errorText = (e) => e?.message || String(e);

// Re-renders the current screen.
export const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
