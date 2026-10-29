// DATA LAYER – the only file that talks to the database / API.
// Views call these functions; they never call supabase directly.
import { supabase } from './lib/supabase.js';
import { state } from './state.js';
import { STARTER_SPACES } from './types/index.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };

// ---------- categories (spaces) ----------
export async function loadSpaces() {
  state.spaces = ok(await supabase.from('spaces').select('*, space_members(user_id, role)').order('sort').order('created_at'));
  return state.spaces;
}
export const createSpace = async ({ name, type, icon }) =>
  ok(await supabase.from('spaces').insert({ name, type, icon, owner_id: state.user.id, sort: state.spaces.length }).select().single());
export const updateSpace = async (id, patch) => ok(await supabase.from('spaces').update(patch).eq('id', id));
export const deleteSpace = async (id) => ok(await supabase.from('spaces').delete().eq('id', id));

export async function ensureStarterSpaces() {
  const key = 'starter-done-' + state.user.id;
  if (state.spaces.length || localStorage.getItem(key)) return;
  for (const s of STARTER_SPACES) await createSpace(s);
  localStorage.setItem(key, '1');
  await loadSpaces();
}

// ---------- items ----------
export const listItems = async (spaceId) =>
  ok(await supabase.from('items').select('*').eq('space_id', spaceId).order('created_at', { ascending: false }));
export const createItem = async (item) => ok(await supabase.from('items').insert(item).select().single());
export const updateItem = async (id, patch) => ok(await supabase.from('items').update(patch).eq('id', id));
export const deleteItem = async (id) => ok(await supabase.from('items').delete().eq('id', id));

// ---------- payment accounts (private to members of a bill space) ----------
export const listPaymentAccounts = async (spaceId) =>
  ok(await supabase.from('space_payment_accounts').select('*').eq('space_id', spaceId).order('account').order('owner'));
export const createPaymentAccount = async (spaceId, { account, owner }) =>
  ok(await supabase.from('space_payment_accounts')
    .insert({ space_id: spaceId, account: account.trim(), owner: owner.trim(), created_by: state.user.id })
    .select().single());
export const deletePaymentAccount = async (spaceId, id) =>
  ok(await supabase.from('space_payment_accounts').delete().eq('space_id', spaceId).eq('id', id));

// Live updates: calls onChange whenever an item in this space changes (by anyone).
export function watchItems(spaceId, onChange) {
  const ch = supabase
    .channel('items-' + spaceId + '-' + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, (p) => {
      const sid = p.new?.space_id || p.old?.space_id;
      if (!sid || sid === spaceId) onChange(p);
    })
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// ---------- sharing ----------
export const listMembers = async (spaceId) =>
  ok(await supabase.from('space_members').select('user_id, role, profiles(email, display_name)').eq('space_id', spaceId));
export const setMemberRole = async (spaceId, userId, role) =>
  ok(await supabase.from('space_members').update({ role }).eq('space_id', spaceId).eq('user_id', userId));
export const removeMember = async (spaceId, userId) =>
  ok(await supabase.from('space_members').delete().eq('space_id', spaceId).eq('user_id', userId));
export const listInvites = async (spaceId) => ok(await supabase.from('invites').select('*').eq('space_id', spaceId));
export const createInvite = async (spaceId, email, role) =>
  ok(await supabase.from('invites').upsert({ space_id: spaceId, email: email.trim().toLowerCase(), role }, { onConflict: 'space_id,email' }));
export const cancelInvite = async (id) => ok(await supabase.from('invites').delete().eq('id', id));
export const acceptInvites = async () => ok(await supabase.rpc('accept_invites'));

// ---------- profile & devices ----------
export async function loadProfile() {
  state.profile = ok(await supabase.from('profiles').select('*').eq('id', state.user.id).single());
  return state.profile;
}
export async function updateProfile(patch) {
  state.profile = ok(await supabase.from('profiles').update(patch).eq('id', state.user.id).select().single());
  return state.profile;
}
export const savePushSubscription = async (s) =>
  ok(await supabase.from('push_subscriptions').upsert({ ...s, user_id: state.user.id }, { onConflict: 'endpoint' }));

// ---------- home display preferences ----------
const homePreferencesKey = () => `home-preferences-${state.user.id}`;
const defaultHomePreferences = () => ({ upcomingEnabled: true, nearbyTrainsEnabled: true });

export function getHomePreferences() {
  try {
    const saved = localStorage.getItem(homePreferencesKey());
    if (!saved) return defaultHomePreferences();
    const preferences = JSON.parse(saved);
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      return defaultHomePreferences();
    }
    return {
      upcomingEnabled: preferences.upcomingEnabled !== false,
      nearbyTrainsEnabled: preferences.nearbyTrainsEnabled !== false,
    };
  } catch {
    return defaultHomePreferences();
  }
}

export function setHomePreferences(patch) {
  const preferences = { ...getHomePreferences(), ...patch };
  const normalized = {
    upcomingEnabled: preferences.upcomingEnabled !== false,
    nearbyTrainsEnabled: preferences.nearbyTrainsEnabled !== false,
  };
  localStorage.setItem(homePreferencesKey(), JSON.stringify(normalized));
  return normalized;
}

// ---------- server API (/api/*) ----------
export async function callApi(path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (path === '/api/parse-media') console.log('REQUEST_SENT', { endpoint: path });
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body || {}),
  });
  if (path === '/api/parse-media') console.log('API_HTTP_STATUS', r.status);
  const responseText = await r.text();
  let j;
  try { j = JSON.parse(responseText); }
  catch {
    if (path === '/api/parse-media') {
      throw new Error(responseText.trim() || `Could not read API response (${r.status})`);
    }
    j = {};
  }
  if (!r.ok) {
    const error = new Error(j && typeof j.error === 'string' ? j.error : `Request failed (${r.status})`);
    if (j && j.stage) error.stage = j.stage;
    throw error;
  }
  return j;
}
export const parseLink = (url) => callApi('/api/parse-link', { url });
export const parseMedia = ({ file, text }) => callApi('/api/parse-media', { file, text });

// ---------- train preferences and departures ----------
const trainPreferencesKey = () => `train-preferences-${state.user.id}`;
const defaultTrainPreferences = () => ({ selectedStationId: null, direction: null, favouriteStations: [] });

export function getTrainPreferences() {
  try {
    const saved = localStorage.getItem(trainPreferencesKey());
    if (!saved) return defaultTrainPreferences();
    const preferences = JSON.parse(saved);
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      return defaultTrainPreferences();
    }
    return {
      ...defaultTrainPreferences(),
      ...preferences,
      selectedStationId: typeof preferences.selectedStationId === 'string' ? preferences.selectedStationId : null,
      direction: typeof preferences.direction === 'string' ? preferences.direction : null,
      favouriteStations: Array.isArray(preferences.favouriteStations) ? preferences.favouriteStations : [],
    };
  } catch {
    return defaultTrainPreferences();
  }
}

export function setTrainPreferences(patch) {
  const saved = { ...getTrainPreferences(), ...patch };
  const preferences = {
    selectedStationId: typeof saved.selectedStationId === 'string' ? saved.selectedStationId : null,
    direction: typeof saved.direction === 'string' ? saved.direction : null,
    favouriteStations: Array.isArray(saved.favouriteStations) ? saved.favouriteStations : [],
  };
  localStorage.setItem(trainPreferencesKey(), JSON.stringify(preferences));
  return preferences;
}

export const getTrainDepartures = (params) => callApi('/api/departures', params);
