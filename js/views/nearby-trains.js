import { h } from '../lib/dom.js';
import { state } from '../state.js';
import { getTrainDepartures, getTrainPreferences, setTrainPreferences } from '../store.js';

const LOCATION_MAX_AGE = 2 * 60_000;
const REFRESH_INTERVAL = 60_000;
const STATION_RADIUS_METERS = 1000;

function cachedLocation(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (Number.isFinite(saved?.savedAt) && Date.now() - saved.savedAt < LOCATION_MAX_AGE
      && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) return saved;
  } catch {
    return null;
  }
  return null;
}

function requestLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude, savedAt: Date.now() }),
      (error) => reject(error),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  });
}

function distanceText(meters) {
  if (meters == null) return '';
  const distance = Number(meters);
  if (!Number.isFinite(distance) || distance < 0) return '';
  return distance >= 1000 ? `${(distance / 1000).toFixed(1)} km away` : `${Math.round(distance)} m away`;
}

function stationsWithinRadius(stations) {
  return stations
    .filter((station) => station.distanceMeters != null
      && Number.isFinite(Number(station.distanceMeters))
      && Number(station.distanceMeters) >= 0
      && Number(station.distanceMeters) <= STATION_RADIUS_METERS)
    .sort((a, b) => Number(a.distanceMeters) - Number(b.distanceMeters));
}

function departureRow(departure) {
  const minutes = Number(departure.minutesAway);
  const time = Number.isFinite(minutes)
    ? minutes < 1 ? 'Due' : `${Math.max(0, Math.floor(minutes))} min`
    : '—';
  const line = departure.line || 'TfL';
  return h('div', { class: 'train-row' },
    h('span', { class: 'train-line', style: `--line-colour: ${departure.lineColor || '#5b5bd6'}` }, line),
    h('span', { class: 'train-destination' }, departure.destination || 'Destination unavailable'),
    h('span', { class: 'train-platform' }, departure.platform || 'Platform unavailable'),
    h('span', { class: 'train-time' }, time));
}

export function NearbyTrainsBanner() {
  const expandedKey = `nearby-trains-expanded-${state.user.id}`;
  const root = h('details', {
    class: 'nearby-trains upcoming-panel',
    open: localStorage.getItem(expandedKey) !== 'false',
    ontoggle: (event) => localStorage.setItem(expandedKey, String(event.target.open)),
  });
  let nearbyStations = [];
  let selectedStation = null;
  let availableStations = [];
  let selectedLine = null;
  let timer = null;
  let loading = false;
  const locationKey = `nearby-trains-location-${state.user.id}`;

  function draw(content, title = 'Nearby trains') {
    const station = content.station || selectedStation;
    const lines = [...new Set((station?.lines || []).filter((line) => typeof line === 'string' && line.trim()))]
      .sort((a, b) => a.localeCompare(b));
    const stationSelector = station && availableStations.length > 1
      ? h('select', {
        class: 'train-station-select',
        'aria-label': 'Select nearby station',
        disabled: loading,
        onchange: (event) => selectStation(event.target.value),
      }, availableStations.map((option) => h('option', { value: option.id, selected: option.id === station.id },
        `${option.name} · ${distanceText(option.distanceMeters)}`)))
      : station ? h('span', { class: 'train-station' },
        station.name, content.distance ? ` · ${content.distance}` : '') : null;
    const lineFilters = station ? h('div', { class: 'chips train-line-filters', role: 'group', 'aria-label': 'Filter by train line' },
      h('button', { class: `chip${selectedLine ? '' : ' on'}`, type: 'button', 'aria-pressed': String(!selectedLine),
        disabled: loading, onclick: () => selectLine(null) }, 'All'),
      lines.map((line) => h('button', {
        class: `chip${selectedLine === line ? ' on' : ''}`,
        type: 'button',
        'aria-pressed': String(selectedLine === line),
        disabled: loading,
        onclick: () => selectLine(line),
      }, line))) : null;
    root.replaceChildren(
      h('summary', { class: 'upcoming-heading train-heading' },
        h('div', { class: 'train-heading-info' },
          h('strong', null, title),
          stationSelector),
        h('button', { class: 'icon-btn train-refresh', type: 'button', 'aria-label': 'Refresh nearby trains',
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            refresh();
          } }, '↻')),
      lineFilters,
      content.body,
      h('small', { class: 'train-attribution' }, 'Powered by TfL Open Data'));
  }

  function drawLoading() {
    draw({ station: selectedStation, body: h('div', { class: 'train-skeleton', 'aria-label': 'Loading nearby trains' },
      h('span'), h('span'), h('span')) });
  }

  function drawError(message, denied = false) {
    draw({ body: h('div', { class: 'train-message', role: 'status' },
      h('span', null, message),
      denied ? h('small', null, 'Allow location access in your browser settings to see trains nearby.') : null,
      h('button', { class: 'btn small', type: 'button', onclick: () => refresh() }, 'Retry')) });
  }

  async function refresh() {
    if (loading || document.visibilityState !== 'visible') return;
    loading = true;
    drawLoading();
    try {
      const location = cachedLocation(locationKey);
      const currentLocation = location || await requestLocation();
      if (!location) localStorage.setItem(locationKey, JSON.stringify(currentLocation));
      const preferences = getTrainPreferences();
      const request = {
        lat: currentLocation.lat,
        lon: currentLocation.lon,
        ...(preferences.selectedStationId ? { stationId: preferences.selectedStationId } : {}),
        ...(preferences.direction ? { direction: preferences.direction } : {}),
        limit: 3,
      };
      let response = await getTrainDepartures({
        ...request,
        ...(selectedLine ? { line: selectedLine } : {}),
      });
      if (!root.isConnected) return;
      let station = response.selectedStation;
      availableStations = stationsWithinRadius(response.nearbyStations || []);
      if (station && !availableStations.some((option) => option.id === station.id)) {
        if (preferences.selectedStationId) {
          setTrainPreferences({ selectedStationId: null });
          selectedLine = null;
          response = await getTrainDepartures({
            lat: currentLocation.lat,
            lon: currentLocation.lon,
            limit: 3,
          });
          station = response.selectedStation;
          availableStations = stationsWithinRadius(response.nearbyStations || []);
        } else {
          station = availableStations[0] || null;
        }
      }
      if (station && selectedLine && !station.lines?.includes(selectedLine)) {
        selectedLine = null;
        response = await getTrainDepartures({
          lat: currentLocation.lat,
          lon: currentLocation.lon,
          stationId: station.id,
          ...(preferences.direction ? { direction: preferences.direction } : {}),
          limit: 3,
        });
      }
      nearbyStations = Array.isArray(response.nearbyStations) ? response.nearbyStations : [];
      if (!station) {
        selectedStation = null;
        loading = false;
        draw({ body: h('p', { class: 'train-message', role: 'status' }, 'No TfL stations within 1 km') });
        return;
      }
      selectedStation = station;
      const departures = Array.isArray(response.departures) ? response.departures : [];
      loading = false;
      draw({
        station,
        distance: distanceText(station.distanceMeters),
        body: departures.length
          ? h('div', { class: 'train-departures' }, departures.slice(0, 3).map(departureRow))
          : h('p', { class: 'train-message', role: 'status' },
            selectedLine ? `No trains found for ${selectedLine}.` : 'No live departures available'),
      });
    } catch (error) {
      if (!root.isConnected) return;
      loading = false;
      if (error?.code === 1) drawError('Location permission denied.', true);
      else drawError(error?.message || 'Could not load nearby trains.');
    } finally {
      loading = false;
    }
  }

  function selectLine(line) {
    if (loading) return;
    selectedLine = selectedLine === line ? null : line;
    refresh();
  }

  function selectStation(stationId) {
    if (loading || !availableStations.some((station) => station.id === stationId)) return;
    setTrainPreferences({ selectedStationId: stationId });
    selectedLine = null;
    refresh();
  }

  function startTimer() {
    clearInterval(timer);
    timer = null;
    if (document.visibilityState === 'visible') timer = setInterval(() => refresh(), REFRESH_INTERVAL);
  }
  function onVisibilityChange() {
    startTimer();
    if (document.visibilityState === 'visible') refresh();
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  startTimer();
  drawLoading();
  refresh();

  return {
    element: root,
    get nearbyStations() { return nearbyStations; },
    cleanup() {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
