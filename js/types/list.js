// SIMPLE LIST – a flexible type for any new category (gift ideas, films, places…).
import { h, fmtDate } from '../lib/dom.js';
import { linkOut } from '../views/card.js';
import { reminderField } from './fields.js';

export default {
  id: 'list',
  label: 'Simple list',
  icon: 'icons/list_icons/Note_Edit.svg',
  itemLabel: 'item',
  description: 'A flexible list for anything else – ideas, gifts, films, places…',
  statuses: [
    { id: 'open', label: 'Open', color: '#5b5bd6' },
    { id: 'done', label: 'Done', color: '#10b981' },
  ],
  defaultStatus: 'open',
  doneStatus: 'done',
  filters: [
    { id: 'open', label: 'Open', test: (i) => i.status !== 'done' },
    { id: 'done', label: 'Done', test: (i) => i.status === 'done' },
    { id: 'all', label: 'All', test: () => true },
  ],
  defaultFilter: 'open',
  fields: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'notes', label: 'Notes', type: 'textarea' },
    { key: 'link', label: 'Link', type: 'url' },
    { key: 'due_at', label: 'Date', type: 'datetime' },
    reminderField('due_at'),
  ],
  meta(item) {
    const d = item.data || {};
    return [
      item.due_at ? h('span', { class: 'pill' }, '📅 ' + fmtDate(item.due_at)) : null,
      d.notes ? h('span', { class: 'pill' }, d.notes.length > 40 ? d.notes.slice(0, 40) + '…' : d.notes) : null,
      linkOut(d.link),
    ];
  },
};
