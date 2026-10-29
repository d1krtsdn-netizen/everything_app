import * as tfl from './providers/tfl.js';

const providers = [tfl];

function normalizedLineName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function getNearbyDepartures({ lat, lon, stationId, direction, line, limit }) {
  const stationGroups = await Promise.all(providers.map(async (provider) => ({
    provider,
    stations: await provider.findNearby(lat, lon),
  })));
  const allStations = stationGroups.flatMap(({ stations }) => stations);
  const nearbyStations = allStations
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 5);

  let selectedStation = stationId
    ? allStations.find((station) => station.id === stationId)
    : nearbyStations[0];
  let selectedProvider = selectedStation
    ? stationGroups.find(({ stations }) => stations.includes(selectedStation))?.provider
    : null;

  if (stationId && !selectedStation) {
    selectedProvider = providers.find((provider) => typeof provider.getStation === 'function') || null;
    if (selectedProvider) selectedStation = await selectedProvider.getStation(stationId, lat, lon);
  }

  if (!selectedStation || !selectedProvider) {
    return { nearbyStations, selectedStation: null, departures: [], updatedAt: new Date().toISOString() };
  }

  let departures = await selectedProvider.getDepartures(selectedStation);
  if (line) {
    const requestedLine = normalizedLineName(line);
    departures = departures.filter((departure) => normalizedLineName(departure.line) === requestedLine);
  }
  if (direction) {
    const requestedDirection = direction.toLowerCase();
    departures = departures.filter((departure) =>
      departure.direction.toLowerCase() === requestedDirection
      || departure.direction.toLowerCase().includes(requestedDirection));
  }

  return {
    nearbyStations,
    selectedStation,
    departures: departures.slice(0, limit),
    updatedAt: new Date().toISOString(),
  };
}
