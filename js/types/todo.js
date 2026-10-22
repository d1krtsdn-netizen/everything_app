// TO-DO – tasks with priority, deadline and status.
import { h, fmtDate, isPast, dateAsc } from '../lib/dom.js';
import { reminderField } from './fields.js';

const PRIORITY = {
  high: { label: 'High', rank: 0, color: '#e5484d' },
  medium: { label: 'Medium', rank: 1, color: '#f59e0b' },
  low: { label: 'Low', rank: 2, color: '#8e8e99' },
};
const rank = (i) => PRIORITY[i.data?.priority || 'medium']?.rank ?? 1;

export default {
  id: 'todo',
  label: 'To-Do',
  icon: '✅',
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

  meta(item) {
    const p = PRIORITY[item.data?.priority || 'medium'] || PRIORITY.medium;
    const overdue = isPast(item.due_at) && item.status !== 'done';
    return [
      h('span', { class: 'pill tinted', style: `--c:${p.color}` }, p.label),
      item.due_at ? h('span', { class: 'pill' + (overdue ? ' overdue' : '') }, '⏰ ' + fmtDate(item.due_at)) : null,
    ];
  },
};
