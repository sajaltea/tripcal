import { useState } from 'react';
import { addPayment as queuePayment } from '../lib/store.js';
import { centsToAmount, formatMoney, suggestSettlements, toCents, today } from '../lib/money.js';
import Avatar from './Avatar.jsx';
import Sheet from './Sheet.jsx';
import Icon from './Icon.jsx';

// "Settle up": who pays whom (with one-tap "Paid"), then each person's final amount.
export default function SettleTab({ trip, members, expenses, balances, nameOf, openHistory }) {
  const [copied, setCopied] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [form, setForm] = useState({ from: members[0]?.id ?? '', to: members[1]?.id ?? '', amount: '', paid_on: today(), note: '' });
  const [formError, setFormError] = useState('');
  const money = (c) => formatMoney(c, trip.currency);
  const plan = suggestSettlements(balances);
  const total = expenses.reduce((s, e) => s + toCents(e.amount), 0);

  if (members.length === 0 || expenses.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon"><Icon name="wallet" size={28} /></div>
        <p>Add some expenses first. Then you’ll see here who needs to pay whom.</p>
      </div>
    );
  }

  function pay(from, to, cents, paid_on = today(), note = null) {
    queuePayment({ trip_id: trip.id, from_member: from, to_member: to, amount: centsToAmount(cents), paid_on, note });
  }

  function markPaid(s) {
    if (!window.confirm(`Did ${nameOf(s.from)} pay ${money(s.cents)} to ${nameOf(s.to)}?`)) return;
    pay(s.from, s.to, s.cents, today(), 'Settlement');
  }

  function submit(e) {
    e.preventDefault();
    setFormError('');
    const cents = toCents(form.amount || 0);
    if (form.from === form.to) return setFormError('Choose two different people.');
    if (!(cents > 0)) return setFormError('Enter an amount greater than 0.');
    pay(form.from, form.to, cents, form.paid_on, form.note.trim() || null);
    setForm({ ...form, amount: '', note: '' });
    setShowPay(false);
  }

  async function share() {
    const lines = [`*${trip.name}* – who pays whom`, `Total spent: ${money(total)}`, ''];
    if (plan.length === 0) lines.push('Everyone is settled up ✅');
    for (const s of plan) lines.push(`• ${nameOf(s.from)} → ${nameOf(s.to)}: ${money(s.cents)}`);
    lines.push('');
    for (const b of balances) {
      lines.push(`${b.member.name}: paid ${money(b.paid)}, share ${money(b.share)} – ` +
        (b.net < 0 ? `pays ${money(-b.net)}` : b.net > 0 ? `gets ${money(b.net)}` : 'settled'));
    }
    const text = lines.join('\n');
    try {
      if (navigator.share) return await navigator.share({ title: trip.name, text });
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // share sheet closed
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const sorted = [...balances].sort((a, b) => a.net - b.net);

  return (
    <>
      {/* Who pays whom */}
      <div className="row between">
        <h2 className="section-title">Who pays whom</h2>
        <button className="btn small ghost" onClick={share}>
          {copied ? <><Icon name="check" size={16} /> Copied</> : <><Icon name="share" size={16} /> Share</>}
        </button>
      </div>

      {plan.length === 0 ? (
        <div className="settled"><Icon name="check" size={18} /> Everyone is settled up</div>
      ) : (
        <div className="list mb">
          {plan.map((s, i) => (
            <div key={i} className="list-item transfer">
              <div className="transfer-people">
                <Avatar name={nameOf(s.from)} size={34} />
                <Icon name="arrow" size={16} className="transfer-arrow" />
                <Avatar name={nameOf(s.to)} size={34} />
              </div>
              <span className="grow">
                <span className="item-title">{nameOf(s.from)} pays {nameOf(s.to)}</span>
                <span className="amount owe">{money(s.cents)}</span>
              </span>
              <button className="btn small" onClick={() => markPaid(s)}>Paid</button>
            </div>
          ))}
        </div>
      )}

      {members.length >= 2 && (
        <button className="btn ghost block mb" onClick={() => { setFormError(''); setShowPay(true); }}>
          <Icon name="plus" size={18} /> Record another payment
        </button>
      )}

      {/* Each person */}
      <h2 className="section-title">Each person</h2>
      <div className="stack-sm">
        {sorted.map((b) => {
          const kind = b.net < 0 ? 'pay' : b.net > 0 ? 'get' : 'even';
          return (
            <div key={b.member.id} className="card final-card">
              <div className="final-top">
                <Avatar name={b.member.name} />
                <span className="grow">
                  <span className="item-title">{b.member.name}</span>
                  <span className={`status-pill ${kind}`}>
                    {kind === 'pay' ? 'Needs to pay' : kind === 'get' ? 'Will receive' : 'All settled'}
                  </span>
                </span>
                <span className={`final-amount ${kind}`}>
                  {kind === 'even' ? <Icon name="check" size={22} /> : money(Math.abs(b.net))}
                </span>
              </div>

              <div className="calc">
                <div><span>Paid for the group</span><span>{money(b.paid)}</span></div>
                <div><span>Their share of expenses</span><span>− {money(b.share)}</span></div>
                {b.sent > 0 && <div><span>Paid back to others</span><span>+ {money(b.sent)}</span></div>}
                {b.received > 0 && <div><span>Received from others</span><span>− {money(b.received)}</span></div>}
              </div>

              <button className="link small row gap-xs" onClick={() => openHistory(b.member.id)}>
                <Icon name="clock" size={16} /> See {b.member.name}’s history
              </button>
            </div>
          );
        })}
      </div>

      {showPay && (
        <Sheet title="Record a payment" onClose={() => setShowPay(false)}>
          <form className="stack" onSubmit={submit}>
            <label>Amount ({trip.currency})
              <input className="amount-input" type="number" inputMode="decimal" min="0.01" step="0.01" required
                placeholder="0.00" value={form.amount} onChange={set('amount')} />
            </label>
            <div className="grid2">
              <label>Who paid
                <select value={form.from} onChange={set('from')}>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label>To whom
                <select value={form.to} onChange={set('to')}>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid2">
              <label>Date
                <input type="date" value={form.paid_on} onChange={set('paid_on')} />
              </label>
              <label>Note
                <input value={form.note} onChange={set('note')} placeholder="UPI, cash…" />
              </label>
            </div>
            {formError && <div className="alert error">{formError}</div>}
            <button className="btn primary block">Save payment</button>
          </form>
        </Sheet>
      )}
    </>
  );
}
