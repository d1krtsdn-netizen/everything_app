import { h } from './dom.js';

export const LIST_ICONS = [
  { path: 'icons/list_icons/Ticket_Voucher.svg', label: 'Ticket' },
  { path: 'icons/list_icons/List_Checklist.svg', label: 'Checklist' },
  { path: 'icons/list_icons/Shopping_Bag_02.svg', label: 'Shopping Bag' },
  { path: 'icons/list_icons/Credit_Card_01.svg', label: 'Credit Card' },
  { path: 'icons/list_icons/Note_Edit.svg', label: 'Notepad' },
];

export function iconContent(icon, className) {
  const asset = LIST_ICONS.find((entry) => entry.path === icon);
  return asset
    ? h('img', { class: className, src: asset.path, alt: '', 'aria-hidden': 'true' })
    : icon;
}

export function iconOptions(selected, includePlaceholder = false) {
  const select = h('select', null,
    includePlaceholder ? h('option', { value: '' }, 'Choose an image icon') : null,
    LIST_ICONS.map(({ path, label }) => h('option', { value: path }, label)));
  select.value = selected;
  return select;
}
