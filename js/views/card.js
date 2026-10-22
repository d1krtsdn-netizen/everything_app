// Reusable card pieces + the default card used by any type without its own card().
import { h, fmtDate, hostOf } from '../lib/dom.js';

export function statusChip(item, ctx) {
  const s = ctx.type.statuses.find((x) => x.id === item.status) || ctx.type.statuses[0];
  return h('button', { class: 'status', style: `--c:${s.color}`,
    onclick: (e) => { e.stopPropagation(); ctx.cycleStatus(); } }, s.label);
}

export function statusSegment(item, ctx) {
  return h('div', { class: 'segment', onclick: (e) => e.stopPropagation() },
    ctx.type.statuses.map((s) => h('button', {
      class: item.status === s.id ? 'on' : '', style: `--c:${s.color}`, onclick: () => ctx.setStatus(s.id),
    }, s.label)));
}

export function checkCircle(item, ctx) {
  const done = item.status === ctx.type.doneStatus;
  return h('button', { class: 'check' + (done ? ' on' : ''), 'aria-label': done ? 'Mark not done' : 'Mark done',
    onclick: (e) => { e.stopPropagation(); ctx.toggleDone(); } }, done ? '✓' : '');
}

export const reminderBadge = (item) =>
  item.remind_at && !item.reminded ? h('span', { class: 'pill' }, '🔔 ' + fmtDate(item.remind_at)) : null;

export const linkOut = (url, label) =>
  url ? h('a', { class: 'pill link', href: url, target: '_blank', rel: 'noopener', onclick: (e) => e.stopPropagation() },
    (label || hostOf(url)) + ' ↗') : null;

export function defaultCard(item, ctx) {
  const t = ctx.type;
  const done = t.doneStatus && item.status === t.doneStatus;
  return h('article', { class: 'card row' + (done ? ' done' : ''), onclick: ctx.edit },
    t.doneStatus ? checkCircle(item, ctx) : null,
    h('div', { class: 'grow' },
      h('div', { class: 'title' }, item.title || 'Untitled'),
      h('div', { class: 'meta' }, t.meta ? t.meta(item) : [], reminderBadge(item))),
    t.actions ? t.actions(item, ctx) : null,
    t.showStatusChip ? statusChip(item, ctx) : null);
}
