// App start-up and router.  Routes:  #/  ·  #/space/<id>  ·  #/settings
import { h } from './lib/dom.js';
import { errorText } from './lib/ui.js';
import { initSupabase, supabase } from './lib/supabase.js';
import { state } from './state.js';
import { loadSpaces, loadProfile, acceptInvites, ensureStarterSpaces } from './store.js';
import { syncPush } from './push.js';
import { renderAuth } from './views/auth.js';
import { renderHome } from './views/home.js';
import { renderSpace } from './views/space.js';
import { renderSettings } from './views/settings.js';

const root = document.getElementById('app');
let cleanup = null;

async function render() {
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  if (!state.user) return renderAuth(root);

  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  try {
    if (parts[0] === 'space' && parts[1]) cleanup = (await renderSpace(root, parts[1], new URLSearchParams(query || ''))) || null;
    else if (parts[0] === 'settings') await renderSettings(root);
    else cleanup = renderHome(root) || null;
  } catch (e) {
    root.replaceChildren(h('main', { class: 'page' },
      h('p', null, 'Something went wrong: ' + errorText(e)),
      h('a', { class: 'btn', href: '#/' }, 'Go home')));
  }
}

async function onSignedIn(user) {
  state.user = user;
  try { await acceptInvites(); } catch { /* ignore */ }
  await Promise.all([loadSpaces(), loadProfile()]);
  await ensureStarterSpaces();
  syncPush().catch(() => {});
}

async function start() {
  try {
    await initSupabase();
  } catch (e) {
    root.replaceChildren(h('main', { class: 'page' }, h('p', null, 'Setup incomplete: ' + errorText(e))));
    return;
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  const { data: { session } } = await supabase.auth.getSession();
  if (session) await onSignedIn(session.user);

  supabase.auth.onAuthStateChange((event, session) => {
    setTimeout(async () => {
      if (event === 'SIGNED_IN' && session && session.user.id !== state.user?.id) { await onSignedIn(session.user); render(); }
      if (event === 'SIGNED_OUT') { Object.assign(state, { user: null, profile: null, spaces: [] }); location.hash = '#/'; render(); }
    });
  });

  // Coming back to the app → pick up new invites and changes
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !state.user) return;
    try { await acceptInvites(); await loadSpaces(); } catch { /* ignore */ }
    render();
  });

  window.addEventListener('hashchange', render);
  render();
}

start();
