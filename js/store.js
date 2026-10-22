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

// ---------- server API (/api/*) ----------
export async function callApi(path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}
export const parseLink = (url) => callApi('/api/parse-link', { url });
