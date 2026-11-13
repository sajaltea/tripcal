import { useState } from 'react';
import { deleteExpense, useStore } from '../lib/store.js';
import { formatMoney, toCents } from '../lib/money.js';
import ExpenseForm from './ExpenseForm.jsx';
import Sheet from './Sheet.jsx';
import Avatar from './Avatar.jsx';
import BillImage from './BillImage.jsx';
import Icon from './Icon.jsx';

function ExpenseView({ trip, expense, nameOf, canEdit, onEdit, onDelete }) {
  const money = (c) => formatMoney(c, trip.currency);
  return (
    <div className="stack">
      <div className="view-amount">
        <div className="view-big">{money(toCents(expense.amount))}</div>
        <div className="muted">
          {new Date(expense.spent_on + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-row">
          <span>Paid by</span>
          <span className="row gap-sm"><Avatar name={nameOf(expense.paid_by)} size={28} /><strong>{nameOf(expense.paid_by)}</strong></span>
        </div>
        {expense.expense_splits.map((s) => (
          <div key={s.member_id} className="settings-row">
            <span className="muted">{nameOf(s.member_id)}’s share</span>
            <span>{money(toCents(s.share))}</span>
          </div>
        ))}
      </div>

      {expense.bill_path ? (
        <div>
          <div className="field-label">Bill photo</div>
          <BillImage path={expense.bill_path} className="bill-large" />
        </div>
      ) : (
        <p className="muted small center">No bill photo</p>
      )}

      {canEdit ? (
        <div className="grid2">
          <button className="btn" onClick={onEdit}><Icon name="edit" size={18} /> Edit</button>
          <button className="btn danger" onClick={onDelete}><Icon name="trash" size={18} /> Delete</button>
        </div>
      ) : (
        <p className="lock-note"><Icon name="lock" size={16} /> Editing is off. Turn it on in Settings.</p>
      )}
    </div>
  );
}

export default function ExpensesTab({ trip, members, expenses, nameOf }) {
  const { settings } = useStore();
  const [sheet, setSheet] = useState(null); // null | { mode: 'new' } | { mode: 'view' | 'edit', expense }

  function remove(e) {
    if (!window.confirm(`Delete "${e.description}"?`)) return;
    deleteExpense(trip.id, e);
    setSheet(null);
  }

  if (members.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon"><Icon name="users" size={28} /></div>
        <p>Add people in the People tab before adding expenses.</p>
      </div>
    );
  }

  const groups = [];
  for (const e of expenses) {
    const g = groups[groups.length - 1];
    if (g && g.date === e.spent_on) g.items.push(e);
    else groups.push({ date: e.spent_on, items: [e] });
  }

  // Keep the open sheet in sync with the latest copy of the expense
  const current = sheet?.expense ? expenses.find((x) => x.id === sheet.expense.id) ?? sheet.expense : null;

  return (
    <>
      {expenses.length === 0 && (
        <div className="empty">
          <div className="empty-icon"><Icon name="receipt" size={28} /></div>
          <p>No expenses yet.</p>
          <button className="btn primary" onClick={() => setSheet({ mode: 'new' })}>Add the first expense</button>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.date} className="mb">
          <div className="group-head">
            <span>{new Date(g.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <span>{formatMoney(g.items.reduce((s, e) => s + toCents(e.amount), 0), trip.currency)}</span>
          </div>
          <div className="list">
            {g.items.map((e) => (
              <button key={e.id} className="list-item tappable" onClick={() => setSheet({ mode: 'view', expense: e })}>
                <Avatar name={nameOf(e.paid_by)} />
                <span className="grow">
                  <span className="item-title">
                    {e.description}
                    {e.bill_path && <span className="bill-badge" title="Has bill photo"><Icon name="clip" size={14} /></span>}
                  </span>
                  <span className="muted small item-sub">
                    {nameOf(e.paid_by)} paid · {e.expense_splits.length === members.length ? 'everyone' : e.expense_splits.map((s) => nameOf(s.member_id)).join(', ')}
                  </span>
                </span>
                <span className="amount">{formatMoney(toCents(e.amount), trip.currency)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <button className="fab" onClick={() => setSheet({ mode: 'new' })} aria-label="Add expense"><Icon name="plus" size={26} stroke={2.2} /></button>

      {sheet?.mode === 'new' && (
        <Sheet title="Add expense" onClose={() => setSheet(null)}>
          <ExpenseForm key="new" trip={trip} members={members} expense={null} onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet?.mode === 'view' && current && (
        <Sheet title={current.description} onClose={() => setSheet(null)}>
          <ExpenseView
            trip={trip}
            expense={current}
            nameOf={nameOf}
            canEdit={settings.allowEdit}
            onEdit={() => setSheet({ mode: 'edit', expense: current })}
            onDelete={() => remove(current)}
          />
        </Sheet>
      )}
      {sheet?.mode === 'edit' && current && settings.allowEdit && (
        <Sheet title="Edit expense" onClose={() => setSheet({ mode: 'view', expense: current })}>
          <ExpenseForm key={current.id} trip={trip} members={members} expense={current} onDone={() => setSheet({ mode: 'view', expense: current })} />
        </Sheet>
      )}
    </>
  );
}
