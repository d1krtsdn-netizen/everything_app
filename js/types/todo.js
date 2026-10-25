// Tasks – tasks with priority, deadline and status.
import { h, fmtDate, isPast, dateAsc, monthSections } from '../lib/dom.js';
import { reminderField } from './fields.js';

const PRIORITY = {
  high: { label: 'High', rank: 0, color: '#e5484d' },
  medium: { label: 'Medium', rank: 1, color: '#f59e0b' },
  low: { label: 'Low', rank: 2, color: '#8e8e99' },
};
const rank = (i) => PRIORITY[i.data?.priority || 'medium']?.rank ?? 1;

export default {
  id: 'todo',
  label: 'Tasks',
  icon: 'icons/list_icons/List_Checklist.svg',
  itemLabel: 'task',
  description: 'Tasks with priority, deadline and status.',
  statuses: [
    { id: 'todo', label: 'To do', color: '#6b6b76' },
    { id: 'in_progress', label: 'In progress', color: '#3b82f6' },
    { id: 'waiting', label: 'Waiting', color: '#a855f7' },
    { id: 'done', label: 'Done', color: '#10b981' },
  ],
  defaultStatus: 'todo',
  doneStatus: 'done',
  showStatusChip: true,
  quickAddPlaceholder: 'Add a task…',
  emptyText: 'Nothing to do. Nice!',
  fields: [
    { key: 'title', label: 'Task', type: 'text', required: true },
    { key: 'priority', label: 'Priority', type: 'select', default: 'medium',
      options: Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label })) },
    { key: 'due_at', label: 'Deadline', type: 'datetime' },
    reminderField('due_at'),
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  filters: [
    { id: 'open', label: 'Open', test: (i) => i.status !== 'done' },
    { id: 'done', label: 'Done', test: (i) => i.status === 'done' },
    { id: 'all', label: 'All', test: () => true },
  ],
  defaultFilter: 'open',
  sort: (a, b) => (a.status === 'done') - (b.status === 'done') || rank(a) - rank(b) || dateAsc(a.due_at, b.due_at),
  sections: monthSections,

  meta(item) {
    const p = PRIORITY[item.data?.priority || 'medium'] || PRIORITY.medium;
    const overdue = isPast(item.due_at) && item.status !== 'done';
    return [
      h('span', { class: 'pill tinted', style: `--c:${p.color}` }, p.label),
      item.due_at ? h('span', { class: 'pill' + (overdue ? ' overdue' : '') }, '⏰ ' + fmtDate(item.due_at)) : null,
    ];
  },

  compactCard(item, ctx) {
    const status = ctx.type.statuses.find((s) => s.id === item.status) || ctx.type.statuses[0];
    const done = item.status === ctx.type.doneStatus;
    const overdue = isPast(item.due_at) && !done;
    return h('article', { class: 'card compact-card compact-todo' + (done ? ' done' : ''), onclick: ctx.edit },
      h('div', { class: 'compact-card-body' },
        h('h3', { class: 'compact-title' }, item.title || 'Untitled'),
        h('div', { class: 'compact-date' + (overdue ? ' overdue' : '') },
          item.due_at ? 'Due: ' + fmtDate(item.due_at) : 'No deadline'),
        item.remind_at ? h('div', { class: 'compact-date' }, '🔔 ' + fmtDate(item.remind_at)) : null,
        h('span', { class: 'compact-status', style: `--c:${status.color}` }, status.label)));
  },
};
