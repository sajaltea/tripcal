import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured, supabase } from './lib/supabase.js';
import { initStore } from './lib/store.js';
import Auth from './components/Auth.jsx';
import TripsList from './components/TripsList.jsx';
import TripPage from './components/TripPage.jsx';

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!isConfigured) return;
    // getSession reads the saved login from the phone, so it works offline too.
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const userEmail = session?.user?.email;
  useEffect(() => {
    if (userId) initStore(userId, userEmail);
  }, [userId, userEmail]);

  if (!isConfigured) {
    return (
      <div className="app">
        <div className="page">
          <div className="card">
            <h1>Trip Splitter</h1>
            <p>Supabase is not connected yet.</p>
            <ol>
              <li>Copy <code>.env.example</code> to <code>.env</code>.</li>
              <li>Fill in your project URL and key from Supabase → Settings → API Keys.</li>
              <li>Run <code>supabase/schema.sql</code> in the Supabase SQL Editor.</li>
              <li>Restart <code>npm run dev</code>.</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  if (session === undefined) return <div className="app"><div className="page muted">Loading…</div></div>;
  if (!session) return <div className="app"><Auth /></div>;

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<TripsList />} />
        <Route path="/trip/:id" element={<TripPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
