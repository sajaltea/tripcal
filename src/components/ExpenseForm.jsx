import { useEffect, useState } from 'react';
import { attachBill, removeBill, saveExpense } from '../lib/store.js';
import { compressImage } from '../lib/bills.js';
import BillImage from './BillImage.jsx';
import { centsToAmount, formatMoney, splitEqually, toCents, today } from '../lib/money.js';
import Icon from './Icon.jsx';

function initialState(expense, members) {
  if (!expense) {
    return {
      description: '',
      amount: '',
      paidBy: members[0]?.id ?? '',
      spentOn: today(),
      mode: 'equal',
      selected: members.map((m) => m.id),
      custom: {},
    };
  }
  const splits = expense.expense_splits || [];
  const ids = splits.map((s) => s.member_id);
  const equal = splitEqually(toCents(expense.amount), ids);
  const isEqual = equal.every((e) => splits.find((s) => s.member_id === e.member_id && toCents(s.share) === e.cents));
  return {
    description: expense.description,
    amount: String(expense.amount),
    paidBy: expense.paid_by,
    spentOn: expense.spent_on,
    mode: isEqual ? 'equal' : 'custom',
    selected: ids,
    custom: Object.fromEntries(splits.map((s) => [s.member_id, String(s.share)])),
  };
}

export default function ExpenseForm({ trip, members, expense, onDone }) {
  const [f, setF] = useState(() => initialState(expense, members));
  const [error, setError] = useState('');
  const [bill, setBill] = useState(null); // new photo: { blob, url }
  const [dropOld, setDropOld] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);

  useEffect(() => () => bill && URL.revokeObjectURL(bill.url), [bill]);

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusyPhoto(true);
    setError('');
    try {
      const blob = await compressImage(file);
      setBill({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyPhoto(false);
    }
  }

  const oldPath = expense?.bill_path && !dropOld ? expense.bill_path : null;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const amountCents = toCents(f.amount || 0);
  const customTotal = Object.entries(f.custom)
    .filter(([id]) => members.some((m) => m.id === id))
    .reduce((s, [, v]) => s + (toCents(v || 0) || 0), 0);

  function toggle(id) {
    setF({ ...f, selected: f.selected.includes(id) ? f.selected.filter((x) => x !== id) : [...f.selected, id] });
  }

  function save(e) {
    e.preventDefault();
    setError('');
    if (!(amountCents > 0)) return setError('Enter an amount greater than 0.');
    if (!f.paidBy) return setError('Choose who paid.');
    if (!f.description.trim()) return setError('Write what it was for.');

    let splits;
    if (f.mode === 'equal') {
      const ids = members.map((m) => m.id).filter((id) => f.selected.includes(id));
      if (ids.length === 0) return setError('Choose at least one person to split with.');
      splits = splitEqually(amountCents, ids);
    } else {
      splits = members
        .map((m) => ({ member_id: m.id, cents: toCents(f.custom[m.id] || 0) || 0 }))
        .filter((s) => s.cents > 0);
      if (splits.length === 0) return setError('Enter at least one share.');
      if (customTotal !== amountCents) {
        return setError(
          `Shares add up to ${formatMoney(customTotal, trip.currency)} but the amount is ${formatMoney(amountCents, trip.currency)}.`
        );
      }
    }

    const expenseId = saveExpense({
      bill_path: oldPath,
      id: expense?.id,
      created_at: expense?.created_at,
      trip_id: trip.id,
      description: f.description.trim(),
      amount: centsToAmount(amountCents),
      paid_by: f.paidBy,
      category: expense?.category ?? 'Other',
      spent_on: f.spentOn || today(),
      splits: splits.map((s) => ({ member_id: s.member_id, share: centsToAmount(s.cents) })),
    });
    // Old photo removed or replaced
    if (expense?.bill_path && (dropOld || bill)) removeBill(trip.id, expenseId, expense.bill_path);
    if (bill) attachBill(trip.id, expenseId, bill.blob);
    onDone();
  }

  const perHead = f.selected.length ? Math.floor(amountCents / f.selected.length) : 0;

  return (
    <form className="stack" onSubmit={save}>
      <label>Amount ({trip.currency})
        <input className="amount-input" required type="number" inputMode="decimal" min="0.01" step="0.01"
          placeholder="0.00" value={f.amount} onChange={set('amount')} />
      </label>
      <label>What was it for?
        <input required value={f.description} onChange={set('description')} placeholder="Dinner, taxi, hotel…" />
      </label>

      <div className="grid2">
        <label>Paid by
          <select value={f.paidBy} onChange={set('paidBy')}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label>Date
          <input type="date" value={f.spentOn} onChange={set('spentOn')} />
        </label>
      </div>

      <div>
        <div className="row between">
          <span className="field-label">Split</span>
          <div className="seg">
            <button type="button" className={f.mode === 'equal' ? 'on' : ''} onClick={() => setF({ ...f, mode: 'equal' })}>Equally</button>
            <button type="button" className={f.mode === 'custom' ? 'on' : ''} onClick={() => setF({ ...f, mode: 'custom' })}>Custom amounts</button>
          </div>
        </div>

        {f.mode === 'equal' ? (
          <div className="chips mt-sm">
            {members.map((m) => (
              <label key={m.id} className={f.selected.includes(m.id) ? 'chip on' : 'chip'}>
                <input type="checkbox" checked={f.selected.includes(m.id)} onChange={() => toggle(m.id)} />
                {m.name}
              </label>
            ))}
            {f.selected.length > 0 && amountCents > 0 && (
              <span className="muted small">≈ {formatMoney(perHead, trip.currency)} each</span>
            )}
          </div>
        ) : (
          <div className="stack-sm mt-sm">
            {members.map((m) => (
              <div key={m.id} className="row between custom-row">
                <span>{m.name}</span>
                <input
                  className="w-amt" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0"
                  value={f.custom[m.id] ?? ''}
                  onChange={(e) => setF({ ...f, custom: { ...f.custom, [m.id]: e.target.value } })}
                />
              </div>
            ))}
            <div className={customTotal === amountCents ? 'small ok' : 'small warn'}>
              Shares: {formatMoney(customTotal, trip.currency)} of {formatMoney(amountCents, trip.currency)}
              {customTotal !== amountCents && ` (${formatMoney(amountCents - customTotal, trip.currency)} left)`}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="field-label">Bill photo <span className="hint">(optional)</span></div>
        {bill ? (
          <div className="bill-edit">
            <img src={bill.url} alt="New bill" className="bill-thumb" />
            <button type="button" className="btn small ghost" onClick={() => setBill(null)}>Remove</button>
          </div>
        ) : oldPath ? (
          <div className="bill-edit">
            <BillImage path={oldPath} />
            <button type="button" className="btn small ghost" onClick={() => setDropOld(true)}>Remove</button>
          </div>
        ) : (
          <label className="photo-pick">
            <input type="file" accept="image/*" onChange={pickPhoto} />
            <Icon name="camera" size={24} />
            <span>{busyPhoto ? 'Preparing photo…' : 'Add bill photo'}</span>
            <span className="hint">Take a photo or choose from gallery</span>
          </label>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}
      <button className="btn primary block" disabled={busyPhoto}>{expense ? 'Save changes' : 'Add expense'}</button>
    </form>
  );
}
