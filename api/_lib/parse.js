// Reads a web page and extracts event details.
// Layer 1: link-preview tags (og:title, og:image, og:site_name)
// Layer 2: structured event data on the page (schema.org JSON-LD "Event")
// Layer 3 (optional): Gemini AI fills whatever is still missing (needs GEMINI_API_KEY)

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CURRENCY = { GBP: '£', USD: '$', EUR: '€' };
const TIMEZONE = process.env.APP_TIMEZONE || 'Europe/London';

export function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.]+$/, '') : null;
}

export async function parseLink(input) {
  const url = extractUrl(input);
  if (!url) throw new Error('No link found');
  const host = new URL(url).hostname.replace(/^www\./, '');
  const out = { url, site: host, title: '', image: '', location: '', start: null, price: '' };

  let html = '';
  let finalUrl = url;
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,*/*', 'accept-language': 'en-GB,en;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
    });
    finalUrl = r.url || url;
    if ((r.headers.get('content-type') || '').includes('html')) html = (await r.text()).slice(0, 3_000_000);
  } catch {
    out.error = 'Could not open the page';
  }

  if (html) {
    const meta = readMeta(html);
    out.title = meta['og:title'] || meta['twitter:title'] || readTitle(html);
    out.image = abs(meta['og:image'] || meta['og:image:url'] || meta['og:image:secure_url'] || meta['twitter:image'] || meta['twitter:image:src'], finalUrl);
    if (meta['og:site_name']) out.site = meta['og:site_name'];
    const ev = findEvent(readJsonLd(html));
    if (ev) applyEvent(out, ev, finalUrl);
    if (!out.start && meta['event:start_time']) out.start = meta['event:start_time'];
  }

  if (html && process.env.GEMINI_API_KEY && (!out.title || !out.location || !out.start || !out.price)) {
    try {
      const ai = await aiExtract(finalUrl, html, out);
      for (const k of ['title', 'location', 'start', 'price']) if (!out[k] && ai?.[k]) out[k] = ai[k];
    } catch (e) {
      out.aiError = String(e.message || e);
    }
  }

  out.title = clean(out.title) || out.site;
  out.location = clean(out.location);
  out.price = clean(out.price);
  out.start = toIso(out.start);
  return out;
}

// ---------- helpers ----------

function readMeta(html) {
  const m = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const a = attrs(tag);
    const key = (a.property || a.name || a.itemprop || '').toLowerCase();
    if (key && a.content && !(key in m)) m[key] = decode(a.content);
  }
  return m;
}

function attrs(tag) {
  const a = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let x;
  while ((x = re.exec(tag))) a[x[1].toLowerCase()] = x[2] ?? x[3] ?? x[4];
  return a;
}

function readTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1]) : '';
}

function readJsonLd(html) {
  const nodes = [];
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try { collect(JSON.parse(m[1].trim()), nodes); } catch { /* ignore broken JSON */ }
  }
  return nodes;
}

function collect(x, out) {
  if (Array.isArray(x)) return x.forEach((y) => collect(y, out));
  if (x && typeof x === 'object') {
    if (x['@type']) out.push(x);
    if (x['@graph']) collect(x['@graph'], out);
  }
}

function findEvent(nodes) {
  return nodes.find((n) => [].concat(n['@type']).some((t) => /Event$/i.test(String(t))));
}

function applyEvent(out, ev, base) {
  if (ev.name) out.title = decode(String(ev.name));
  if (ev.startDate) out.start = ev.startDate;
  const loc = [].concat(ev.location || [])[0];
  if (loc) {
    out.location = typeof loc === 'string'
      ? loc
      : [loc.name, address(loc.address)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  }
  const img = [].concat(ev.image || [])[0];
  const imgUrl = typeof img === 'string' ? img : img?.url;
  if (imgUrl && !out.image) out.image = abs(imgUrl, base);
  const p = price(ev.offers);
  if (p) out.price = p;
}

function address(a) {
  if (!a) return '';
  if (typeof a === 'string') return a;
  return [a.streetAddress, a.addressLocality].filter(Boolean).join(', ');
}

function price(offers) {
  const list = [].concat(offers || []).flatMap((o) => (o?.offers ? [].concat(o.offers) : [o])).filter(Boolean);
  let vals = [];
  let cur = '';
  for (const o of list) {
    for (const k of ['price', 'lowPrice', 'highPrice']) {
      const v = parseFloat(String(o[k] ?? '').replace(/[^0-9.]/g, ''));
      if (!isNaN(v)) vals.push(v);
    }
    cur = cur || o.priceCurrency || '';
  }
  if (!vals.length) return '';
  if (vals.some((v) => v > 0)) vals = vals.filter((v) => v > 0);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max === 0) return 'Free';
  const sym = CURRENCY[cur] ?? (cur ? cur + ' ' : '');
  const f = (n) => sym + (Number.isInteger(n) ? n : n.toFixed(2));
  return min === max ? f(min) : `From ${f(min)}`;
}

async function aiExtract(url, html, known) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 12000);
  const prompt = `Extract event details from this web page. Reply with JSON only:
{"title": string, "location": string, "start": string or null, "price": string}
- title: the event name (not the website name)
- location: venue and city, e.g. "O2 Academy Brixton, London"
- start: local date-time of the (first) event in ISO format, e.g. "2026-11-05T19:30", or null
- price: cheapest ticket with currency symbol, e.g. "£25", "From £25" or "Free"; "" if not shown
Use "" when unknown. Today is ${new Date().toISOString().slice(0, 10)}.
URL: ${url}
Page title: ${known.title}
Page text: ${text}`;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `Gemini error ${r.status}`);
  return JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
}

// Dates without a timezone are treated as UK local time (APP_TIMEZONE)
function toIso(s) {
  if (!s) return null;
  s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const asUtc = new Date(s + 'Z');
    const name = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, timeZoneName: 'longOffset' })
      .formatToParts(asUtc).find((p) => p.type === 'timeZoneName')?.value || '';
    const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
    const offset = m ? (m[1] === '+' ? 1 : -1) * (+m[2] * 60 + +m[3]) : 0;
    return new Date(asUtc.getTime() - offset * 60000).toISOString();
  }
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}

function abs(u, base) {
  try { return u ? new URL(u, base).href : ''; } catch { return ''; }
}

function decode(s) {
  return String(s)
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}
