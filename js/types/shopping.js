// TO-BUY – shopping list grouped by category; bought items can be re-added with one tap.
import { h } from '../lib/dom.js';
import { linkOut } from '../views/card.js';

const CATEGORIES = ['Groceries', 'Household', 'Electronics', 'Clothing', 'Health & beauty', 'Gifts', 'Other'];
const catOf = (i) => (CATEGORIES.includes(i.data?.category) ? i.data.category : 'Other');

export default {
  id: 'shopping',
  label: 'To-Buy',
  icon: '🛒',
  itemLabel: 'item',
  description: 'Things to buy, with links. Tick when bought, re-add with one tap.',
  statuses: [
    { id: 'needed', label: 'To buy', color: '#5b5bd6' },
    { id: 'bought', label: 'Bought', color: '#10b981' },
  ],
  defaultStatus: 'needed',
  doneStatus: 'bought',
  hideFilters: true,
  suggestFromItems: true, // quick-add autocompletes from previous items
  quickAddPlaceholder: 'Add item… (e.g. milk)',
  emptyText: 'Your list is empty.',
  fields: [
    { key: 'title', label: 'Item', type: 'text', required: true },
    { key: 'qty', label: 'Quantity', type: 'text', placeholder: 'e.g. 2 or 1 kg' },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORIES, default: 'Groceries' },
    { key: 'link', label: 'Where to buy (link)', type: 'url', placeholder: 'https://…' },
    { key: 'price', label: 'Price', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
    { key: 'remind_at', label: 'Remind me (push notification)', type: 'datetime' },
  ],
  sort: (a, b) => a.title.localeCompare(b.title),

  sections(items) {
    const need = items.filter((i) => i.status !== 'bought');
    const bought = items.filter((i) => i.status === 'bought')
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    return [
      ...CATEGORIES.map((c) => ({ title: c, items: need.filter((i) => catOf(i) === c) })),
      { title: 'Bought – tap ↺ to add back', items: bought, collapsible: true, collapsed: true },
    ];
  },

  meta(item) {
    const d = item.data || {};
    return [
      d.qty ? h('span', { class: 'pill' }, d.qty) : null,
      d.price ? h('span', { class: 'pill' }, d.price) : null,
      linkOut(d.link, 'Buy'),
    ];
  },

  actions(item, ctx) {
    if (item.status !== 'bought') return null;
    return h('button', { class: 'btn small', 'aria-label': 'Add back to list',
      onclick: (e) => { e.stopPropagation(); ctx.setStatus('needed'); } }, '↺');
  },

  // Typing an item you bought before puts it back on the list instead of duplicating it
  async onQuickAdd(text, { items, create, update }) {
    const existing = items.find((i) => i.title.trim().toLowerCase() === text.toLowerCase());
    if (existing) return existing.status === 'bought' ? update(existing.id, { status: 'needed' }) : null;
    return create({ title: text });
  },
};
