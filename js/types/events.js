// EVENTS – cards created from shared links (see /api/share and /api/parse-link).
import { h, fmtDate, startOfToday, dateAsc, extractUrl, monthSections } from '../lib/dom.js';
import { linkOut, reminderBadge, statusSegment } from '../views/card.js';
import { reminderField } from './fields.js';

const upcoming = (i) => !i.due_at || new Date(i.due_at) >= startOfToday();

const sourceLabel = (source) => ({ image: 'Screenshot', pdf: 'PDF', text: 'Message' }[source] || '');
const logAttachmentStage = (stage, details = {}) => console.log(stage, details);
const eventValues = (event = {}, source = '', uploadedUrl = '', mimeType = '') => ({
  url: event.url || '',
  title: event.title || event.site || event.url || 'Untitled event',
  due_at: event.start || null,
  location: event.location || '',
  price: event.price || '',
  site: event.site || sourceLabel(source),
  image: mimeType?.startsWith('image/') ? uploadedUrl : event.image || '',
  attachment: mimeType === 'application/pdf' ? uploadedUrl : '',
  notes: event.notes || '',
  source,
});
const fromLink = (parsed) => eventValues(parsed.events?.[0] || parsed, parsed.source || 'link');
const createEvents = async (events, source, create, uploadedUrl = '', mimeType = '', logStages = false) => {
  for (const event of events) {
    const values = eventValues(event, source, uploadedUrl, mimeType);
    if (logStages) logAttachmentStage('EVENT_CREATE_STARTED', { title: values.title });
    await create(values);
    if (logStages) logAttachmentStage('EVENT_CREATE_COMPLETED', { title: values.title });
  }
};

function readAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error(reader.error?.message || 'Could not read the selected file'));
    reader.readAsDataURL(blob);
  });
}

async function imageAsJpeg(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1200 / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the image');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob) throw new Error('Could not convert the image');
    return await readAsBase64(blob);
  } finally {
    bitmap.close();
  }
}

export default {
  id: 'events',
  label: 'Events',
  icon: 'icons/list_icons/Ticket_Voucher.svg',
  itemLabel: 'event',
  description: 'Create events from links, messages, images and PDFs.',
  attachButton: true,
  statuses: [
    { id: 'pending', label: 'Pending', color: '#f59e0b' },
    { id: 'bought', label: 'Bought', color: '#10b981' },
    { id: 'not_going', label: 'Not going', color: '#8e8e99' },
  ],
  defaultStatus: 'pending',
  quickAddPlaceholder: 'Paste an event link or describe it…',
  emptyText: 'No events yet. Share a link, message, image or PDF.',
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
  sections: monthSections,

  async onQuickAdd(text, { create, parseLink, parseMedia, toast }) {
    const url = extractUrl(text);
    if (!url) {
      toast('Reading…');
      let parsed;
      try {
        parsed = await parseMedia({ text });
      } catch (error) {
        toast(`Could not read message – saved as text: ${error.message}`);
        return create({ title: text, source: 'text', site: sourceLabel('text') });
      }
      if (parsed.events.length) return createEvents(parsed.events, parsed.source, create);
      return create({ title: text, source: parsed.source || 'text', site: sourceLabel(parsed.source || 'text') });
    }

    toast('Reading event page…');
    let parsed;
    try {
      parsed = await parseLink(url);
    } catch (error) {
      toast(`Could not read the page – saved the link only: ${error.message}`);
      return create({ title: url, url, source: 'link' });
    }
    if (parsed.events?.length) return createEvents(parsed.events, parsed.source || 'link', create);
    return create({ title: url, url, source: 'link' });
  },

  async onAttach(file, { create, parseMedia, toast }) {
    const originalMimeType = file.type;
    let mimeType = file.type;
    let base64;
    if (mimeType === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      mimeType = 'application/pdf';
      if (file.size > 3 * 1024 * 1024) throw new Error('PDF too large (max 3 MB)');
      toast('Reading…');
      base64 = await readAsBase64(file);
    } else if (mimeType.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/i.test(file.name)) {
      toast('Reading…');
      base64 = await imageAsJpeg(file);
      mimeType = 'image/jpeg';
    } else {
      throw new Error('Choose an image or PDF');
    }

    logAttachmentStage('FILE_CONVERTED', {
      filename: file.name,
      originalMimeType,
      mimeType,
      originalSize: file.size,
      convertedSize: base64.length * 3 / 4 - (base64.match(/=*$/)?.[0].length || 0),
    });
    const parsed = await parseMedia({ file: base64 });
    if (!parsed.events.length) throw new Error('No event was found in the selected file');
    await createEvents(parsed.events, parsed.source, create, parsed.uploadedUrl, parsed.mimeType || mimeType, true);
    toast(`Created ${parsed.events.length} event${parsed.events.length === 1 ? '' : 's'}`);
  },

  card(item, ctx) {
    const d = item.data || {};
    const dim = item.status === 'not_going' || !upcoming(item);
    const attachment = d.attachment
      ? h('a', { class: 'pill link event-attachment', href: d.attachment, target: '_blank', rel: 'noopener',
        onclick: (event) => event.stopPropagation() },
      h('img', { src: 'icons/file_attachment.svg', alt: '' }), 'Original ↗')
      : null;
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
        h('div', { class: 'meta' }, linkOut(d.url), attachment, reminderBadge(item)),
        statusSegment(item, ctx)));
  },

  compactCard(item, ctx) {
    const d = item.data || {};
    const status = ctx.type.statuses.find((s) => s.id === item.status) || ctx.type.statuses[0];
    const dim = item.status === 'not_going' || !upcoming(item);
    return h('article', { class: 'card compact-card compact-event' + (dim ? ' dim' : ''), onclick: ctx.edit },
      d.image
        ? h('img', { class: 'compact-event-img', src: d.image, alt: '', loading: 'lazy',
          referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() })
        : null,
      h('div', { class: 'compact-card-body' },
        h('h3', { class: 'compact-title' }, item.title || 'Untitled event'),
        h('div', { class: 'compact-date' }, item.due_at ? fmtDate(item.due_at) : 'Date not set'),
        d.location ? h('div', { class: 'compact-location' }, d.location) : null,
        d.price ? h('div', { class: 'compact-price' }, d.price) : null,
        h('span', { class: 'compact-status', style: `--c:${status.color}` }, status.label)));
  },
};
