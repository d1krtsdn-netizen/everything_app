import { userFromRequest } from './_lib/supabase-admin.js';
import { getNearbyDepartures } from '../lib/trains/index.js';

function requestValue(req, key) {
  const bodyValue = req.body && typeof req.body === 'object' ? req.body[key] : undefined;
  return bodyValue ?? req.query?.[key];
}

function numberValue(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value.trim()) return NaN;
  return Number(value);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!await userFromRequest(req)) return res.status(401).json({ error: 'Please sign in again' });

  const lat = numberValue(requestValue(req, 'lat'));
  const lon = numberValue(requestValue(req, 'lon'));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: 'lat must be a number between -90 and 90' });
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'lon must be a number between -180 and 180' });
  }

  const stationValue = requestValue(req, 'stationId');
  const directionValue = requestValue(req, 'direction');
  const lineValue = requestValue(req, 'line');
  const limitValue = requestValue(req, 'limit');
  const stationId = typeof stationValue === 'string' && stationValue.trim() ? stationValue.trim() : null;
  const direction = typeof directionValue === 'string' && directionValue.trim() ? directionValue.trim() : null;
  const line = typeof lineValue === 'string' && lineValue.trim() ? lineValue.trim() : null;
  const limit = limitValue == null ? 3 : numberValue(limitValue);
  if (limitValue != null && (!Number.isInteger(limit) || limit < 1 || limit > 10)) {
    return res.status(400).json({ error: 'limit must be an integer between 1 and 10' });
  }
  if (directionValue != null && (typeof directionValue !== 'string' || directionValue.length > 100)) {
    return res.status(400).json({ error: 'direction must be a string of 100 characters or fewer' });
  }
  if (lineValue != null && (typeof lineValue !== 'string' || lineValue.length > 100)) {
    return res.status(400).json({ error: 'line must be a string of 100 characters or fewer' });
  }
  if (stationValue != null && typeof stationValue !== 'string') {
    return res.status(400).json({ error: 'stationId must be a string' });
  }
  if (stationId && stationId.length > 100) {
    return res.status(400).json({ error: 'stationId must be 100 characters or fewer' });
  }

  try {
    return res.json(await getNearbyDepartures({ lat, lon, stationId, direction, line, limit }));
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 502;
    return res.status(status).json({ error: error?.message || 'Could not load TfL departures' });
  }
}
