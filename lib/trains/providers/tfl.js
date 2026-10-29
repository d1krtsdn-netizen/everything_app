const API_BASE = 'https://api.tfl.gov.uk';
const MODES = new Set(['tube', 'dlr', 'overground', 'elizabeth-line', 'tram']);
const LINE_COLOURS = {
  bakerloo: '#B36305',
  central: '#E32017',
  circle: '#FFD300',
  district: '#00782A',
  'hammersmith & city': '#F3A9BB',
  'hammersmith-city': '#F3A9BB',
  jubilee: '#A0A5A9',
  metropolitan: '#9B0056',
  northern: '#000000',
  piccadilly: '#003688',
  'victoria': '#0098D4',
  'waterloo & city': '#95CDBA',
  'waterloo-city': '#95CDBA',
  dlr: '#00A4A7',
  overground: '#EE7C0E',
  'london overground': '#EE7C0E',
  'elizabeth line': '#6950A1',
  elizabeth: '#6950A1',
  'elizabeth-line': '#6950A1',
  tram: '#84B817',
};
const CACHE_MS = 30_000;
const arrivalsCache = new Map();

async function tflRequest(path, params = {}) {
  if (!process.env.TFL_APP_KEY) {
    const error = new Error('TfL departures are not configured (TFL_APP_KEY is missing)');
    error.status = 503;
    throw error;
  }
  const url = new URL(path, API_BASE);
  url.searchParams.set('app_key', process.env.TFL_APP_KEY);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    const error = new Error(`TfL request failed (${response.status})`);
    error.status = response.status === 404 ? 404 : 502;
    throw error;
  }
  return response.json();
}

function stationShape(stop, origin) {
  const modes = [...new Set((Array.isArray(stop.modes) ? stop.modes : []).filter((mode) => MODES.has(mode)))];
  if (!stop.id || !modes.length) return null;
  const distance = stop.distance == null ? NaN : Number(stop.distance);
  const latitude = Number(stop.lat);
  const longitude = Number(stop.lon);
  const distanceMeters = Number.isFinite(distance) ? distance
    : origin && Number.isFinite(latitude) && Number.isFinite(longitude)
      ? haversineDistance(origin.lat, origin.lon, latitude, longitude) : null;
  return {
    id: String(stop.id),
    name: String(stop.commonName || stop.name || 'Station'),
    distanceMeters,
    modes,
    lines: [...new Set((Array.isArray(stop.lines) ? stop.lines : [])
      .map((line) => line.name || line.id)
      .filter((name) => typeof name === 'string' && name.trim()))],
    provider: 'tfl',
  };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.min(1, Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2);
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function directionFrom(platformName) {
  const match = String(platformName || '').match(/^(.+?)\s*-\s*Platform\b/i);
  return match ? match[1].trim() : '';
}

function normalizeArrival(arrival) {
  const seconds = Number(arrival.timeToStation);
  const expectedDate = new Date(arrival.expectedArrival);
  const validExpectedDate = Number.isFinite(expectedDate.getTime());
  const timeToStation = Number.isFinite(seconds) && seconds >= 0
    ? seconds
    : validExpectedDate ? Math.max(0, (expectedDate.getTime() - Date.now()) / 1000) : 0;
  const platformName = String(arrival.platformName || '').trim();
  const line = String(arrival.lineName || arrival.lineId || 'TfL').trim();
  const mode = String(arrival.modeName || 'rail').trim();
  const direction = String(arrival.direction || directionFrom(platformName) || 'Direction unavailable').trim();
  const colourKey = line.toLowerCase();

  return {
    line,
    lineColor: LINE_COLOURS[colourKey] || '#5b5bd6',
    mode,
    destination: String(arrival.destinationName || 'Destination unavailable').trim(),
    platform: platformName || 'Platform unavailable',
    expectedTime: validExpectedDate ? expectedDate.toISOString() : new Date(Date.now() + timeToStation * 1000).toISOString(),
    minutesAway: Math.floor(timeToStation / 60),
    direction,
    timeToStation,
  };
}

function sortDepartures(arrivals) {
  return arrivals
    .map(normalizeArrival)
    .sort((a, b) => a.timeToStation - b.timeToStation)
    .map(({ timeToStation, ...departure }) => departure);
}

export async function findNearby(lat, lon) {
  const result = await tflRequest('/StopPoint', {
    lat: String(lat),
    lon: String(lon),
    radius: '1500',
    stopTypes: 'NaptanMetroStation,NaptanRailStation',
  });
  return (Array.isArray(result.stopPoints) ? result.stopPoints : [])
    .map((stop) => stationShape(stop, { lat, lon }))
    .filter(Boolean);
}

export async function getStation(id, lat, lon) {
  return stationShape(await tflRequest(`/StopPoint/${encodeURIComponent(id)}`), { lat, lon });
}

export async function getDepartures(station) {
  const cached = arrivalsCache.get(station.id);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.departures;

  let arrivals = await tflRequest(`/StopPoint/${encodeURIComponent(station.id)}/Arrivals`);
  if (!Array.isArray(arrivals) || arrivals.length === 0) {
    const children = await tflRequest(`/StopPoint/${encodeURIComponent(station.id)}/children`);
    const childStops = Array.isArray(children) ? children : [];
    const childArrivals = await Promise.all(childStops
      .filter((child) => child.id)
      .map((child) => tflRequest(`/StopPoint/${encodeURIComponent(child.id)}/Arrivals`)));
    arrivals = childArrivals.flatMap((result) => Array.isArray(result) ? result : []);
  }

  const departures = sortDepartures(arrivals);
  arrivalsCache.set(station.id, { at: Date.now(), departures });
  return departures;
}

export const lineColours = LINE_COLOURS;
