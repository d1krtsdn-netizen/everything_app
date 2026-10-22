// EVENTS – cards created from shared links (see /api/share and /api/parse-link).
import { h, fmtDate, startOfToday, dateAsc, extractUrl } from '../lib/dom.js';
import { linkOut, reminderBadge, statusSegment } from '../views/card.js';
import { reminderField } from './fields.js';

const upcoming = (i) => !i.due_at || new Date(i.due_at) >= startOfToday();

// Converts /api/parse-link output into form values
const fromLink = (info) => ({
  url: info.url, title: info.title || info.site || info.url, due_at: info.start,
  location: info.location, price: info.price, site: info.site, image: info.image,
});

export default {
  id: 'events',
  label: 'Events',
  icon: '🎟️',
  itemLabel: 'event',
  description: 'Events from links you share. Shows site, image, price and location.',
  statuses: [
    { id: 'pending', label: 'Pending', color: '#f59e0b' },
    { id: 'bought', label: 'Bought', color: '#10b981' },
    { id: 'not_going', label: 'Not going', color: '#8e8e99' },
  ],
  defaultStatus: 'pending',
  quickAddPlaceholder: 'Paste an event link…',
  emptyText: 'No events yet. Share a link from Safari or paste one above.',
  fields: [
    { key: 'url', label: 'Link', type: 'url', importButton: true, placeholder: 'https://…' },
    { key: 'title', label: 'Event name', type: 'text', required: true },
    { key: 'due_at', label: 'Date & time', type: 'datetime' },
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'price', label: 'Price', type: 'text', placeholder: '£25' },
    { key: 'site', label: 'Website', type: 'text' },
    { key: 'image', label: 'Image link', type: 'url' },
    reminderField('due_at'),
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  fromLink,
  filters: [
    { id: 'upcoming', label: 'Upcoming', test: (i) => upcoming(i) && i.status !== 'not_going' },
    { id: 'pending', label: 'Pending', test: (i) => upcoming(i) && i.status === 'pending' },
    { id: 'bought', label: 'Bought', test: (i) => upcoming(i) && i.status === 'bought' },
    { id: 'not_going', label: 'Not going', test: (i) => i.status === 'not_going' },
    { id: 'past', label: 'Past', test: (i) => !upcoming(i) },
    { id: 'all', label: 'All', test: () => true },
  ],
  defaultFilter: 'upcoming',
  sort: (a, b) => dateAsc(a.due_at, b.due_at),

  async onQuickAdd(text, { create, parseLink, toast }) {
    const url = extractUrl(text);
    if (!url) return create({ title: text });
    toast('Reading event page…');
    let info = { url };
    try { info = await parseLink(url); } catch { toast('Could not read the page – saved the link only'); }
    return create(fromLink(info));
  },

  card(item, ctx) {
    const d = item.data || {};
    const dim = item.status === 'not_going' || !upcoming(item);
    return h('article', { class: 'card event' + (dim ? ' dim' : ''), onclick: ctx.edit },
      d.image
        ? h('img', { class: 'event-img', src: d.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() })
        : null,
      h('div', { class: 'event-body' },
        h('div', { class: 'event-top' },
          h('span', { class: 'site' }, d.site || ''),
          d.price ? h('span', { class: 'price' }, d.price) : null),
        h('h3', { class: 'title' }, item.title || 'Untitled event'),
        item.due_at ? h('div', { class: 'line' }, '📅 ', fmtDate(item.due_at)) : null,
        d.location ? h('div', { class: 'line' }, '📍 ', d.location) : null,
        h('div', { class: 'meta' }, linkOut(d.url), reminderBadge(item)),
        statusSegment(item, ctx)));
  },
};
