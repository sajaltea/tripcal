// All calculations are done in whole cents (paise) to avoid rounding errors.

export const toCents = (value) => Math.round(Number(value) * 100);
export const centsToAmount = (cents) => Math.round(cents) / 100;

export function formatMoney(cents, currency = 'INR') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

// Split a total into equal shares; leftover cents go to the first people.
export function splitEqually(totalCents, memberIds) {
  const n = memberIds.length;
  if (!n) return [];
  const base = Math.floor(totalCents / n);
  let rest = totalCents - base * n;
  return memberIds.map((id) => ({ member_id: id, cents: base + (rest-- > 0 ? 1 : 0) }));
}

// net > 0: this person should get money back. net < 0: this person owes money.
export function computeBalances(members, expenses, payments) {
  const rows = new Map(
    members.map((m) => [m.id, { member: m, paid: 0, share: 0, sent: 0, received: 0, net: 0 }])
  );
  for (const e of expenses) {
    const payer = rows.get(e.paid_by);
    if (payer) payer.paid += toCents(e.amount);
    for (const s of e.expense_splits || []) {
      const row = rows.get(s.member_id);
      if (row) row.share += toCents(s.share);
    }
  }
  for (const p of payments) {
    const from = rows.get(p.from_member);
    if (from) from.sent += toCents(p.amount);
    const to = rows.get(p.to_member);
    if (to) to.received += toCents(p.amount);
  }
  for (const r of rows.values()) r.net = r.paid - r.share + r.sent - r.received;
  return [...rows.values()];
}

// Fewest-transfers style plan: who should pay whom, and how much.
export function suggestSettlements(balances) {
  const creditors = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ id: b.member.id, amt: b.net }))
    .sort((a, b) => b.amt - a.amt);
  const debtors = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ id: b.member.id, amt: -b.net }))
    .sort((a, b) => b.amt - a.amt);

  const plan = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].amt, creditors[j].amt);
    plan.push({ from: debtors[i].id, to: creditors[j].id, cents: amt });
    debtors[i].amt -= amt;
    creditors[j].amt -= amt;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return plan;
}

export const CATEGORIES = ['Food', 'Travel', 'Stay', 'Fuel', 'Tickets', 'Shopping', 'Other'];

export const CATEGORY_ICONS = {
  Food: '🍽️', Travel: '🚕', Stay: '🏨', Fuel: '⛽', Tickets: '🎟️', Shopping: '🛍️', Other: '📦',
};
