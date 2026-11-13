import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteTrip, useStore } from '../lib/store.js';
import { computeBalances, formatMoney, toCents } from '../lib/money.js';
import ExpensesTab from './ExpensesTab.jsx';
import PeopleTab from './PeopleTab.jsx';
import SettleTab from './SettleTab.jsx';
import HistoryTab from './HistoryTab.jsx';
import SyncBar from './SyncBar.jsx';
import SettingsSheet from './SettingsSheet.jsx';
import Icon from './Icon.jsx';

const fmtDate = (d) => new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const TABS = [
  { key: 'Expenses', label: 'Expenses', icon: 'receipt' },
  { key: 'Settle', label: 'Settle up', icon: 'wallet' },
  { key: 'History', label: 'History', icon: 'clock' },
  { key: 'People', label: 'People', icon: 'users' },
];

export default function TripPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { trips, loaded } = useStore();
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Expenses');
  const [showSettings, setShowSettings] = useState(false);
  const [historyPerson, setHistoryPerson] = useState(null);

  const data = trips.find((t) => t.id === id);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const balances = useMemo(
    () => (data ? computeBalances(data.members, data.expenses, data.payments) : []),
    [data]
  );

  function changeTab(key) {
    setTab(key);
    window.scrollTo({ top: 0 });
  }

  function removeTrip() {
    if (!window.confirm(`Delete "${data.name}" and all its expenses? This cannot be undone.`)) return;
    deleteTrip(id);
    navigate('/');
  }

  if (!data) {
    return (
      <>
        <header className="appbar">
          <Link to="/" className="back" aria-label="Back"><Icon name="back" size={26} /></Link>
          <div className="appbar-title">Trip</div>
          <span />
        </header>
        <main className="page">
          <p className="muted center">{loaded ? 'This trip was not found.' : 'Loading…'}</p>
        </main>
      </>
    );
  }

  const { members, expenses, payments } = data;
  const trip = data;
  const total = expenses.reduce((s, e) => s + toCents(e.amount), 0);
  const nameOf = (mid) => members.find((m) => m.id === mid)?.name ?? 'Unknown';
  const openHistory = (pid) => { setHistoryPerson(pid); changeTab('History'); };
  const shared = { trip, members, expenses, payments, balances, nameOf, setError, deleteTrip: removeTrip, openHistory };

  return (
    <>
      <header className="appbar">
        <Link to="/" className="back" aria-label="All trips"><Icon name="back" size={26} /></Link>
        <div className="appbar-title">{trip.name}</div>
        <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings"><Icon name="settings" /></button>
      </header>
      <SyncBar />

      {tab === 'Expenses' && (
        <section className="hero">
          <div className="hero-label">Total spent</div>
          <div className="hero-amount">{formatMoney(total, trip.currency)}</div>
          {trip.start_date && (
            <div className="hero-dates">
              <Icon name="calendar" size={15} /> {fmtDate(trip.start_date)}{trip.end_date ? ` – ${fmtDate(trip.end_date)}` : ''}
            </div>
          )}
          <div className="hero-stats">
            <div><strong>{members.length}</strong><span>People</span></div>
            <div><strong>{expenses.length}</strong><span>Expenses</span></div>
            <div><strong>{formatMoney(Math.round(total / Math.max(1, members.length)), trip.currency)}</strong><span>Per person</span></div>
          </div>
        </section>
      )}

      <main className={tab === 'Expenses' ? 'page with-nav with-fab' : 'page with-nav'}>
        {error && <div className="alert error toast" onClick={() => setError('')}>{error}</div>}
        {tab === 'Expenses' && <ExpensesTab {...shared} />}
        {tab === 'Settle' && <SettleTab {...shared} />}
        {tab === 'History' && <HistoryTab {...shared} person={historyPerson} setPerson={setHistoryPerson} />}
        {tab === 'People' && <PeopleTab {...shared} />}
      </main>

      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}

      <nav className="bottom-nav">
        {TABS.map((t) => (
          <button key={t.key} className={t.key === tab ? 'nav-item active' : 'nav-item'} onClick={() => changeTab(t.key)}>
            <span className="nav-icon"><Icon name={t.icon} size={22} /></span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
