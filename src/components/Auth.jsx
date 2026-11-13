import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import Icon from './Icon.jsx';

export default function Auth() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    if (mode === 'signup' && !data.session) {
      setInfo('Account created. Check your email to confirm it, then sign in.');
      setMode('signin');
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="auth-logo"><Icon name="wallet" size={30} /></div>
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
        {info && <div className="alert info">{info}</div>}
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
