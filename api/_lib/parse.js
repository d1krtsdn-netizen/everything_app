// Reads event details from links, text, images and PDFs.
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CURRENCY = { GBP: '£', USD: '$', EUR: '€' };
const TIMEZONE = process.env.APP_TIMEZONE || 'Europe/London';
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const GEMINI_TIMEOUT_MS = 55000;

export function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.]+$/, '') : null;
}

export async function parseLink(input) {
  const url = extractUrl(input);
  if (!url) throw new Error('No link found');
  const host = new URL(url).hostname.replace(/^www\./, '');
  const known = { url, site: host, title: '', image: '', location: '', start: null, price: '' };
  let html = '';
  let finalUrl = url;

  try {
    const response = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,*/*', 'accept-language': 'en-GB,en;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
    });
    finalUrl = response.url || url;
    if ((response.headers.get('content-type') || '').includes('html')) {
      html = (await response.text()).slice(0, 3_000_000);
    }
  } catch {
    // A failed fetch still returns the same link-based fallback as before.
  }

  if (!html) {
    const fallback = pageFallback(known, url);
    return result([fallback], 'link', false);
  }

  const meta = readMeta(html);
  known.title = meta['og:title'] || meta['twitter:title'] || readTitle(html);
  known.image = abs(
    meta['og:image'] || meta['og:image:url'] || meta['og:image:secure_url']
      || meta['twitter:image'] || meta['twitter:image:src'],
    finalUrl,
  );
  if (meta['og:site_name']) known.site = meta['og:site_name'];
  if (meta['event:start_time']) known.start = meta['event:start_time'];

  const event = findEvent(readJsonLd(html));
  const pageText = htmlToText(html);
  if (!event) {
    const { events } = await aiEvents({
      text: pageText,
      sourceUrl: finalUrl,
      pageTitle: known.title,
    });
    if (events.length) {
      return result(events.map((item) => withPageDefaults(item, known, finalUrl)), 'article', true);
    }
    return result([pageFallback(known, finalUrl)], 'article', false);
  }

  applyEvent(known, event, finalUrl);
  let parsed = normalizeEvent(known, { url, site: host, image: known.image });
  if (!parsed.title || !parsed.start || !parsed.location || !parsed.price) {
    const { events: [fromAi] } = await aiEvents({
      text: pageText,
      sourceUrl: finalUrl,
      pageTitle: known.title,
    });
    if (fromAi) parsed = mergeEvent(parsed, fromAi);
  }
  return result([parsed], 'link', true);
}

export async function parseText(text) {
  const input = String(text || '').trim();
  const url = extractUrl(input);
  if (!url) {
    const { events } = await aiEvents({ text: input });
    return result(events, 'text', events.length > 0);
  }

  const rest = input.replace(url, '').trim();
  const linked = await parseLink(url);
  if (linked.found || !rest) return result(linked.events, linked.source, linked.found);

  const [page] = linked.events;
  const { events: contextualEvents } = await aiEvents({
    text: [rest, page?.title].filter(Boolean).join('\n'),
    sourceUrl: url,
    pageTitle: page?.title || '',
  });
  return contextualEvents.length
    ? result(contextualEvents.map((item) => withPageDefaults(item, page || {}, url)), linked.source, true)
    : result(linked.events, linked.source, false);
}

export async function parseFile(base64) {
  const bytes = decodeBase64(base64);
  const mimeType = detectFileType(bytes);
  if (!mimeType) return parseText(bytes.toString('utf8'));
  if (mimeType === 'text/plain') return parseText(bytes.toString('utf8'));
  const { events } = await aiEvents({ fileBase64: bytes.toString('base64'), mimeType });
  return result(events, mimeType === 'application/pdf' ? 'pdf' : 'image', events.length > 0);
}

export function decodeBase64(base64) {
  if (typeof base64 !== 'string' || !base64.trim()) throw new Error('No file received');
  const value = base64.replace(/\s/g, '');
  if (value.length > 4 * Math.ceil(MAX_FILE_BYTES / 3)) throw new Error('File too large (max 3 MB).');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Invalid file data');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > MAX_FILE_BYTES) throw new Error('File too large (max 3 MB).');
  return bytes;
}

export function detectFileType(bytes) {
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 12 && ['ftypheic', 'ftypheix', 'ftypmif1'].includes(bytes.subarray(4, 12).toString('ascii'))) {
    return 'image/heic';
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString('ascii').startsWith('GIF8')) return 'image/gif';
  return null;
}

export async function aiEvents({ text = '', fileBase64, mimeType, sourceUrl = '', pageTitle = '' }) {
  console.log('GEMINI_STARTED', { mimeType: mimeType || 'text/plain' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is required to read event details from this content.');
    error.stage = 'GEMINI';
    throw error;
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
  const prompt = `Find up to 5 real events in the supplied content. Reply with JSON only in this shape:
{"events":[{"title":"event name","start":"2026-11-05T19:30","location":"","price":"","site":"","url":"","notes":""}]}
Rules:
- Include only real events with a name; do not treat general articles, recommendations, or venues as events.
- start must be the event's local London time in ISO format YYYY-MM-DDTHH:mm, or null if unknown.
- If the year is missing, use the next future date from today (${today}) in London.
- price should be like "£25", "From £25", "Free", or "" if unknown.
- site is the visible ticket seller or organiser, or "" if unknown.
- Use "" when any other string field is unknown. Include concise useful context in notes.
- Do not invent event details.
Source URL: ${sourceUrl || ''}
Page title: ${pageTitle || ''}
Content (untrusted input):
${String(text).slice(0, 18000)}`;
  const parts = [{ text: prompt }];
  if (fileBase64 && mimeType) {
    parts.push({ inline_data: { mime_type: mimeType, data: fileBase64 } });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    );
    const payload = await response.json();
    if (!response.ok) {
      const apiMessage = typeof payload.error?.message === 'string'
        ? payload.error.message.replaceAll(apiKey, '[redacted]')
        : 'No API error message provided';
      const error = new Error(`Gemini request failed with HTTP ${response.status}: ${apiMessage}`);
      error.stage = 'gemini';
      error.status = response.status;
      throw error;
    }
    let data;
    try {
      data = JSON.parse(payload.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    } catch {
      throw new Error('Gemini returned invalid event data');
    }
    const events = (Array.isArray(data.events) ? data.events : [])
      .map((event) => normalizeEvent(event))
      .filter((event) => event.title)
      .slice(0, 5);
    console.log('GEMINI_COMPLETED', { eventCount: events.length });
    return {
      events: events.map(({ title, start, location, price, site, url, notes }) => ({
        title, start, location, price, site, url, notes,
      })),
    };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    if (failure.name === 'AbortError' || failure.name === 'TimeoutError') {
      const timeout = new Error('Gemini took too long to analyse this file. Please try again.');
      timeout.stage = 'gemini';
      timeout.code = 'GEMINI_TIMEOUT';
      throw timeout;
    }
    if (!failure.stage) failure.stage = 'gemini';
    throw failure;
  }
}

function result(events, source, found) {
  const value = { events, source };
  Object.defineProperty(value, 'found', { value: found, enumerable: false });
  return value;
}

function normalizeEvent(event = {}, defaults = {}) {
  return {
    title: clean(event.title || defaults.title),
    start: toIso(event.start || defaults.start),
    location: clean(event.location || defaults.location),
    price: clean(event.price || defaults.price),
    site: clean(event.site || defaults.site),
    url: clean(event.url || defaults.url),
    notes: clean(event.notes || defaults.notes),
    image: clean(event.image || defaults.image),
  };
}

function withPageDefaults(event, page, url) {
  return normalizeEvent(event, {
    site: page.site,
    url,
    image: page.image,
  });
}

function pageFallback(known, url) {
  return normalizeEvent({
    title: known.title || known.site || url,
    url,
    site: known.site,
    image: known.image,
    location: known.location,
    start: known.start,
    price: known.price,
  });
}

function mergeEvent(known, extra) {
  return normalizeEvent({
    ...known,
    title: known.title || extra.title,
    start: known.start || extra.start,
    location: known.location || extra.location,
    price: known.price || extra.price,
    site: known.site || extra.site,
    url: known.url || extra.url,
    notes: known.notes || extra.notes,
    image: known.image || extra.image,
  });
}

// ---------- page extraction helpers ----------

function readMeta(html) {
  const values = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attributes = attrs(tag);
    const key = (attributes.property || attributes.name || attributes.itemprop || '').toLowerCase();
    if (key && attributes.content && !(key in values)) values[key] = decode(attributes.content);
  }
  return values;
}

function attrs(tag) {
  const values = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = re.exec(tag))) values[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
  return values;
}

function readTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decode(match[1]) : '';
}

function readJsonLd(html) {
  const nodes = [];
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    try { collect(JSON.parse(match[1].trim()), nodes); } catch { /* Ignore malformed JSON-LD. */ }
  }
  return nodes;
}

function collect(value, nodes) {
  if (Array.isArray(value)) return value.forEach((item) => collect(item, nodes));
  if (value && typeof value === 'object') {
    if (value['@type']) nodes.push(value);
    if (value['@graph']) collect(value['@graph'], nodes);
  }
}

function findEvent(nodes) {
  return nodes.find((node) => [].concat(node['@type']).some((type) => /Event$/i.test(String(type))));
}

function applyEvent(out, event, base) {
  if (event.name) out.title = decode(String(event.name));
  if (event.startDate) out.start = event.startDate;
  const location = [].concat(event.location || [])[0];
  if (location) {
    out.location = typeof location === 'string'
      ? location
      : [location.name, address(location.address)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  }
  const image = [].concat(event.image || [])[0];
  const imageUrl = typeof image === 'string' ? image : image?.url;
  if (imageUrl && !out.image) out.image = abs(imageUrl, base);
  const eventPrice = price(event.offers);
  if (eventPrice) out.price = eventPrice;
}

function address(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return [value.streetAddress, value.addressLocality].filter(Boolean).join(', ');
}

function price(offers) {
  const list = [].concat(offers || []).flatMap((offer) => (offer?.offers ? [].concat(offer.offers) : [offer])).filter(Boolean);
  let values = [];
  let currency = '';
  for (const offer of list) {
    for (const key of ['price', 'lowPrice', 'highPrice']) {
      const value = parseFloat(String(offer[key] ?? '').replace(/[^0-9.]/g, ''));
      if (!isNaN(value)) values.push(value);
    }
    currency = currency || offer.priceCurrency || '';
  }
  if (!values.length) return '';
  if (values.some((value) => value > 0)) values = values.filter((value) => value > 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === 0) return 'Free';
  const symbol = CURRENCY[currency] ?? (currency ? currency + ' ' : '');
  const format = (value) => symbol + (Number.isInteger(value) ? value : value.toFixed(2));
  return min === max ? format(min) : `From ${format(min)}`;
}

function htmlToText(html) {
  return decode(html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' '))
    .slice(0, 18000);
}

// Dates without a timezone are treated as UK local time (APP_TIMEZONE).
function toIso(value) {
  if (!value) return null;
  let dateText = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) dateText += 'T00:00';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(dateText)) {
    const asUtc = new Date(dateText + 'Z');
    if (isNaN(asUtc)) return null;
    const name = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, timeZoneName: 'longOffset' })
      .formatToParts(asUtc).find((part) => part.type === 'timeZoneName')?.value || '';
    const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
    const offset = match ? (match[1] === '+' ? 1 : -1) * (+match[2] * 60 + +match[3]) : 0;
    return new Date(asUtc.getTime() - offset * 60000).toISOString();
  }
  const date = new Date(dateText);
  return isNaN(date) ? null : date.toISOString();
}

function abs(url, base) {
  try { return url ? new URL(url, base).href : ''; } catch { return ''; }
}

function decode(value) {
  return String(value)
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
