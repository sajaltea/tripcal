import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import Icon from './Icon.jsx';

// Turn Supabase auth errors into plain messages
function friendly(error) {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('already registered')) return 'This email already has an account. Please sign in.';
  if (m.includes('email not confirmed')) {
    return 'Sign-in is blocked because email confirmation is still on in Supabase. Turn off “Confirm email” in Supabase (Authentication → Sign In / Providers → Email).';
  }
  if (m.includes('rate limit') || error?.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('password should be')) return 'Password must be at least 6 characters.';
  return error.message;
}

export default function Auth() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setBusy(false);
        return setError(friendly(error));
      }
      // Email already has an account
      if (data.user && data.user.identities?.length === 0) {
        setBusy(false);
        setMode('signin');
        return setError('This email already has an account. Please sign in with your password.');
      }
      if (data.session) return; // signed in straight away
    }

    // Sign in (also right after creating an account)
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(friendly(error));
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="auth-logo"><Icon name="wallet" size={24} /></div>
        <h1>Trip Splitter</h1>
        <p>Track trip spending and see who owes whom.</p>
      </div>
      <form onSubmit={submit} className="stack auth-form">
        <label>Email
          <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>Password
          <input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={6}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <p className="small center">
          {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
          <button type="button" className="link" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </form>
    </div>
  );
}
