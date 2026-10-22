// Sign in / create account screen.
import { h } from '../lib/dom.js';
import { busy, errorText } from '../lib/ui.js';
import { supabase } from '../lib/supabase.js';

export function renderAuth(root) {
  let mode = 'signin';
  const email = h('input', { type: 'email', placeholder: 'Email', autocomplete: 'email', required: true });
  const pass = h('input', { type: 'password', placeholder: 'Password (6+ characters)', autocomplete: 'current-password', required: true, minlength: '6' });
  const msg = h('p', { class: 'muted small' });
  const btn = h('button', { class: 'btn primary wide', type: 'submit' }, 'Sign in');
  const toggle = h('button', { class: 'btn link', type: 'button', onclick: () => {
    mode = mode === 'signin' ? 'signup' : 'signin';
    btn.textContent = mode === 'signin' ? 'Sign in' : 'Create account';
    toggle.textContent = mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in';
    msg.textContent = '';
  } }, 'New here? Create an account');

  const form = h('form', { class: 'auth-card', onsubmit: async (e) => {
    e.preventDefault();
    msg.textContent = '';
    await busy(btn, async () => {
      try {
        if (mode === 'signin') {
          const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
          if (error) throw error;
        } else {
          const { data, error } = await supabase.auth.signUp({
            email: email.value.trim(), password: pass.value, options: { emailRedirectTo: location.origin },
          });
          if (error) throw error;
          if (!data.session) msg.textContent = 'Check your email and tap the confirmation link, then sign in here.';
        }
      } catch (err) { msg.textContent = errorText(err); }
    });
  } },
    h('img', { class: 'logo', src: '/icons/icon-192.png', alt: '' }),
    h('h1', null, 'Everything'),
    email, pass, btn, toggle, msg);

  root.replaceChildren(h('main', { class: 'auth' }, form));
}
