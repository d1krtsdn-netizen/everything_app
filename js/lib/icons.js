import { h } from './dom.js';

export const LIST_ICONS = [
  { path: 'icons/list_icons/Ticket_Voucher.svg', label: 'Ticket Voucher' },
  { path: 'icons/list_icons/List_Checklist.svg', label: 'List Checklist' },
  { path: 'icons/list_icons/Shopping_Bag_02.svg', label: 'Shopping Bag 02' },
  { path: 'icons/list_icons/Credit_Card_01.svg', label: 'Credit Card 01' },
  { path: 'icons/list_icons/Note_Edit.svg', label: 'Note Edit' },
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
