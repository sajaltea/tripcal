import { deletePayment, useStore } from '../lib/store.js';
import { formatMoney, toCents } from '../lib/money.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

// Every expense and payment in time order. Pick a person to see how each one changed their balance.
export default function HistoryTab({ trip, members, expenses, payments, nameOf, person, setPerson, readOnly, meId }) {
  const { settings } = useStore();
  const money = (c) => formatMoney(c, trip.currency);
  const signed = (c) => (c > 0 ? `+${money(c)}` : c < 0 ? `−${money(-c)}` : money(0));
  const balanceText = (c) => (c > 0 ? `gets ${money(c)}` : c < 0 ? `owes ${money(-c)}` : 'settled');

  // All transactions, oldest first
  const items = [
    ...expenses.map((e) => ({ kind: 'expense', id: e.id, date: e.spent_on, at: e.created_at, e })),
    ...payments.map((p) => ({ kind: 'payment', id: p.id, date: p.paid_on, at: p.created_at, p })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));

  // How a transaction changes a person's balance (+ means others owe them more)
  function effect(item, pid) {
    if (item.kind === 'expense') {
      const share = toCents(item.e.expense_splits.find((s) => s.member_id === pid)?.share ?? 0);
      const paid = item.e.paid_by === pid ? toCents(item.e.amount) : 0;
      return paid - share;
    }
    if (item.p.from_member === pid) return toCents(item.p.amount);
    if (item.p.to_member === pid) return -toCents(item.p.amount);
    return 0;
  }
  function involved(item, pid) {
    if (item.kind === 'expense') return item.e.paid_by === pid || item.e.expense_splits.some((s) => s.member_id === pid);
    return item.p.from_member === pid || item.p.to_member === pid;
  }

  let rows = items;
  if (person) {
    let running = 0;
    rows = items
      .filter((it) => involved(it, person))
      .map((it) => {
        const change = effect(it, person);
        running += change;
        return { ...it, change, balance: running };
      });
  }
  rows = [...rows].reverse(); // newest first

  const groups = [];
  for (const r of rows) {
    const g = groups[groups.length - 1];
    if (g && g.date === r.date) g.items.push(r);
    else groups.push({ date: r.date, items: [r] });
  }

  const current = person ? rows[0]?.balance ?? 0 : null;
  const fmtDay = (d) => new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  function removePayment(p) {
    if (!window.confirm('Delete this payment?')) return;
    deletePayment(trip.id, p.id);
  }

  return (
    <>
      {/* Person filter */}
      <div className="filter-row">
        <button className={!person ? 'filter on' : 'filter'} onClick={() => setPerson(null)}>Everyone</button>
        {members.map((m) => (
          <button key={m.id} className={person === m.id ? 'filter on' : 'filter'} onClick={() => setPerson(m.id)}>
            {m.id === meId ? `${m.name} (you)` : m.name}
          </button>
        ))}
      </div>

      {person && (
        <div className="card person-summary">
          <Avatar name={nameOf(person)} size={44} />
          <span className="grow">
            <span className="item-title">{nameOf(person)}</span>
            <span className="muted small item-sub">Balance now</span>
          </span>
          <span className={current > 0 ? 'final-amount get' : current < 0 ? 'final-amount pay' : 'final-amount even'}>
            {balanceText(current)}
          </span>
        </div>
      )}

      {person && rows.length > 0 && (
        <p className="help">
          <strong className="get">+</strong> means others owe {nameOf(person)} more.{' '}
          <strong className="owe">−</strong> means {nameOf(person)} owes more.
        </p>
      )}

      {rows.length === 0 && (
        <div className="empty">
          <div className="empty-icon"><Icon name="clock" size={28} /></div>
          <p>{person ? `${nameOf(person)} has no transactions yet.` : 'No transactions yet.'}</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.date} className="mb">
          <div className="group-head"><span>{fmtDay(g.date)}</span></div>
          <div className="list">
            {g.items.map((r) => {
              const isExp = r.kind === 'expense';
              const amount = toCents(isExp ? r.e.amount : r.p.amount);
              let title;
              let sub;
              if (isExp) {
                title = r.e.description;
                const myShare = person ? r.e.expense_splits.find((s) => s.member_id === person) : null;
                sub = `${nameOf(r.e.paid_by)} paid ${money(amount)}` +
                  (person ? (myShare ? ` · share ${money(toCents(myShare.share))}` : ' · not in split') : ` · ${r.e.expense_splits.length} people`);
              } else {
                title = `${nameOf(r.p.from_member)} paid ${nameOf(r.p.to_member)}`;
                sub = `Payment${r.p.note ? ` · ${r.p.note}` : ''}`;
              }
              return (
                <div key={r.kind + r.id} className="list-item">
                  <span className={isExp ? 'kind-icon' : 'kind-icon pay'}>
                    <Icon name={isExp ? 'receipt' : 'arrow'} size={18} />
                  </span>
                  <span className="grow">
                    <span className="item-title">{title}</span>
                    <span className="muted small item-sub">{sub}</span>
                  </span>
                  {person ? (
                    <span className="right">
                      <span className={r.change > 0 ? 'amount get' : r.change < 0 ? 'amount owe' : 'amount muted'}>{signed(r.change)}</span>
                      <span className="muted small item-sub">{balanceText(r.balance)}</span>
                    </span>
                  ) : (
                    <span className="amount">{money(amount)}</span>
                  )}
                  {!isExp && settings.allowEdit && !readOnly && (
                    <button className="icon-btn danger-text" onClick={() => removePayment(r.p)} aria-label="Delete payment">
                      <Icon name="trash" size={18} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
