import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import Icon from './Icon.jsx';

const redirect = () => ({ emailRedirectTo: window.location.origin });

// Turn Supabase auth errors into plain messages
function friendly(error) {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('rate limit') || error?.status === 429) {
    return 'Too many emails were sent. Please wait a while (up to 1 hour) and try again.';
  }
  if (m.includes('for security purposes')) return error.message; // "...after N seconds"
  if (m.includes('email not confirmed')) return 'Your email is not confirmed yet. Open the link in the confirmation email, or send it again below.';
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('already registered')) return 'This email already has an account. Please sign in.';
  return error.message;
}

export default function Auth() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [canResend, setCanResend] = useState(false);
  const [wait, setWait] = useState(0); // seconds before "Resend" can be used again

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        setError(friendly(error));
        setCanResend((error.message || '').toLowerCase().includes('email not confirmed'));
      }
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password, options: redirect() });
    setBusy(false);
    if (error) return setError(friendly(error));
    if (data.session) return; // confirmation is off: signed in straight away

    // Supabase returns a user with no identities when the email is already registered and confirmed
    if (data.user && data.user.identities?.length === 0) {
      setMode('signin');
      setCanResend(false);
      return setError('This email already has an account. Please sign in with your password.');
    }
    setInfo(`We sent a confirmation link to ${email}. Open it, then sign in here.`);
    setCanResend(true);
    setWait(60);
    setMode('signin');
  }

  async function resend() {
    if (!email) return setError('Type your email first.');
    setBusy(true);
    setError('');
    setInfo('');
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: redirect() });
    setBusy(false);
    if (error) return setError(friendly(error));
    setInfo(`Sent again to ${email}. Check your inbox and spam folder.`);
    setWait(60);
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
        {info && <div className="alert info">{info}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        {canResend && (
          <button type="button" className="btn block" onClick={resend} disabled={busy || wait > 0}>
            <Icon name="refresh" size={16} />
            {wait > 0 ? `Resend confirmation email (${wait}s)` : 'Resend confirmation email'}
          </button>
        )}

        <p className="small center">
          {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
          <button type="button" className="link" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setInfo(''); }}>
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
        {mode === 'signin' && !canResend && (
          <p className="small center">
            <button type="button" className="link" onClick={() => { setCanResend(true); setError(''); setInfo('Type your email above, then tap “Resend confirmation email”.'); }}>
              Didn’t get the confirmation email?
            </button>
          </p>
        )}
      </form>
    </div>
  );
}
