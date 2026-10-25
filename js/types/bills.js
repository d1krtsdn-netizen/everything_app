// BILLS – bills and subscriptions with recurring due dates.
import { h, isPast, dateAsc } from '../lib/dom.js';
import { reminderField } from './fields.js';

const CATEGORIES = [
  'Streaming', 'Software', 'Utilities', 'Rent', 'Phone & internet',
  'Insurance', 'Fitness', 'Council tax', 'Other',
];
const FREQUENCIES = ['One-off', 'Weekly', 'Monthly', 'Yearly'];

const formatPrice = (value) => value == null || value === ''
  ? ''
  : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value));

const formatTotal = (value) => {
  const amount = Math.round(value * 100) / 100;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

function billSections(items, allItems = items) {
  const totals = new Map();
  for (const item of allItems) {
    const category = CATEGORIES.includes(item.data?.category) ? item.data.category : 'Other';
    totals.set(category, (totals.get(category) || 0) + (Number(item.data?.price) || 0));
  }
  return CATEGORIES
    .map((category) => ({
      title: category,
      total: formatTotal(totals.get(category) || 0),
      divider: true,
      items: items.filter((item) =>
        (CATEGORIES.includes(item.data?.category) ? item.data.category : 'Other') === category),
    }))
    .filter((section) => section.items.length)
    .sort((a, b) => totals.get(b.title) - totals.get(a.title) || CATEGORIES.indexOf(a.title) - CATEGORIES.indexOf(b.title));
}

const shortDate = (value) => value
  ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }).format(new Date(value))
  : 'No due date';

function advanceDate(value, frequency) {
  const date = new Date(value);
  if (isNaN(date)) return null;

  if (frequency === 'Weekly') date.setDate(date.getDate() + 7);
  else if (frequency === 'Monthly') {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  } else if (frequency === 'Yearly') {
    const day = date.getDate();
    const month = date.getMonth();
    date.setDate(1);
    date.setFullYear(date.getFullYear() + 1);
    date.setMonth(month);
    date.setDate(Math.min(day, new Date(date.getFullYear(), month + 1, 0).getDate()));
  } else return null;

  return date.toISOString();
}

function billIcon(item, sizeClass) {
  const name = item.title?.trim() || 'Bill';
  const letter = Array.from(name)[0] || 'B';
  const image = h('img', {
    class: 'bill-icon-image',
    src: item.data?.icon || null,
    alt: '',
    loading: 'lazy',
    hidden: !item.data?.icon,
    onerror: (event) => { event.target.hidden = true; event.target.nextElementSibling.hidden = false; },
  });
  return h('span', { class: `bill-icon ${sizeClass}`, 'aria-label': name },
    image, h('span', { class: 'bill-icon-fallback', hidden: !!item.data?.icon }, letter));
}

function overdue(item) {
  return item.status === 'due' && isPast(item.due_at);
}

function markPaid(item, ctx) {
  return async (event) => {
    event.stopPropagation();
    if (!ctx.canEdit || item.status === 'cancelled') return;

    const frequency = item.data?.frequency;
    const recurring = ['Weekly', 'Monthly', 'Yearly'].includes(frequency);
    const nextDue = recurring && item.due_at ? advanceDate(item.due_at, frequency) : null;
    const recurringPayment = !!nextDue;
    const patch = recurringPayment
      ? {
        status: 'due',
        due_at: nextDue,
        ...(item.remind_at ? { remind_at: advanceDate(item.remind_at, frequency) } : {}),
      }
      : { status: 'paid' };

    if (await ctx.update(patch) && recurringPayment) ctx.toast(`Paid – next due ${shortDate(nextDue)}`);
  };
}

function statusButton(item, ctx) {
  const paid = item.status === 'paid';
  return h('button', {
    type: 'button',
    class: 'bill-paid-button' + (paid ? ' on' : ''),
    'aria-label': paid ? 'Paid' : 'Mark as paid',
    title: paid ? 'Paid' : 'Mark as paid',
    disabled: !ctx.canEdit || item.status === 'cancelled',
    onclick: markPaid(item, ctx),
  }, paid ? '✓' : '');
}

export default {
  id: 'bills',
  label: 'Bills & Subscriptions',
  icon: 'icons/list_icons/Credit_Card_01.svg',
  itemLabel: 'bill',
  description: 'Track bills and subscriptions, prices and recurring due dates.',
  layouts: ['list', 'grid'],
  statuses: [
    { id: 'due', label: 'Due', color: '#f59e0b' },
    { id: 'paid', label: 'Paid', color: '#10b981' },
    { id: 'cancelled', label: 'Cancelled', color: '#8e8e99' },
  ],
  defaultStatus: 'due',
  doneStatus: 'paid',
  quickAddPlaceholder: 'Add a bill… (e.g. Netflix 12.99)',
  emptyText: 'No bills or subscriptions yet.',
  summary(items) {
    const total = items.reduce((sum, item) => sum + (Number(item.data?.price) || 0), 0);
    return h('section', { class: 'bill-summary' },
      h('span', null, 'Total across all categories'),
      h('strong', null, formatTotal(total)));
  },
  fields: [
    { key: 'title', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Netflix' },
    { key: 'category', label: 'Type', type: 'select', options: CATEGORIES, default: 'Other' },
    { key: 'price', label: 'Price (£)', type: 'number', step: '0.01', placeholder: 'e.g. 12.99' },
    { key: 'due_at', label: 'Due date', type: 'datetime' },
    { key: 'frequency', label: 'Repeats', type: 'select', options: FREQUENCIES, default: 'Monthly' },
    {
      key: 'account', label: 'Payment account', type: 'select', default: '',
      paymentAccounts: true,
    },
    { key: 'website', label: 'Website', type: 'url', placeholder: 'https://netflix.com' },
    { key: 'icon', label: 'Icon image link', type: 'url', logoButtons: true },
    reminderField('due_at'),
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  filters: [
    { id: 'upcoming', label: 'Upcoming', test: (item) => item.status === 'due' && !overdue(item) },
    { id: 'overdue', label: 'Overdue', test: (item) => overdue(item) },
    { id: 'paid', label: 'Paid', test: (item) => item.status === 'paid' },
    { id: 'cancelled', label: 'Cancelled', test: (item) => item.status === 'cancelled' },
    { id: 'all', label: 'All', test: () => true },
  ],
  defaultFilter: 'upcoming',
  sort: (a, b) => dateAsc(a.due_at, b.due_at),
  sections: billSections,
  gridSections: billSections,

  async onQuickAdd(text, { create }) {
    const match = text.match(/^(.*?)\s+£?(\d+(?:\.\d{1,2})?)$/);
    if (!match || !match[1].trim()) return create({ title: text });
    return create({ title: match[1].trim(), price: Number(match[2]) });
  },

  card(item, ctx) {
    const late = overdue(item);
    return h('article', { class: 'card bill-list-card' + (late ? ' overdue' : ''), onclick: ctx.edit },
      billIcon(item, 'bill-icon-list'),
      h('div', { class: 'bill-list-main' },
        h('div', { class: 'bill-name' }, item.title || 'Untitled bill'),
        h('div', { class: 'bill-kind' }, `${item.data?.category || 'Other'} · ${item.data?.frequency || 'Monthly'}`),
        h('div', { class: 'bill-account' }, item.data?.account || 'No account selected')),
      h('div', { class: 'bill-list-details' },
        h('div', { class: 'bill-price' }, formatPrice(item.data?.price) || '—'),
        h('div', { class: 'bill-due' + (late ? ' overdue' : '') },
          item.due_at ? `Due ${shortDate(item.due_at)}` : 'No due date')),
      statusButton(item, ctx));
  },

  gridCard(item, ctx) {
    const late = overdue(item);
    return h('article', { class: 'card bill-grid-card' + (late ? ' overdue' : ''), onclick: ctx.edit },
      billIcon(item, 'bill-icon-grid'),
      h('div', { class: 'bill-grid-name' }, item.title || 'Untitled bill'),
      h('div', { class: 'bill-price' }, formatPrice(item.data?.price) || '—'),
      h('div', { class: 'bill-due' + (late ? ' overdue' : '') },
        item.due_at ? shortDate(item.due_at) : 'No due date'),
      h('div', { class: 'bill-account' }, item.data?.account || 'No account'));
  },
};
