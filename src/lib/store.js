// Offline-first data store.
//
// - `server` is the last copy of the user's trips downloaded from Supabase (saved on the phone).
// - `outbox` is the list of changes made on the phone that are not uploaded yet (also saved).
// - What the app shows = server copy + outbox changes applied on top.
// - When the phone is online, the outbox is uploaded in order, then a fresh copy is downloaded.

import { useSyncExternalStore } from 'react';
import { supabase } from './supabase.js';
import { deleteBlob, getBlob, putBlob } from './bills.js';

let userId = null;
let userEmail = '';
let server = { trips: [], loaded: false, fetchedAt: null };
let outbox = [];
let failed = [];
let settings = { allowEdit: false };
let online = typeof navigator === 'undefined' ? true : navigator.onLine;
let syncing = false;
let loadError = '';
let snapshot = null;
const listeners = new Set();

const key = (name) => `trip-splitter:${userId}:${name}`;
function read(name, fallback) {
  try {
    const v = localStorage.getItem(key(name));
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function write(name, value) {
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
  } catch {
    // storage full or blocked: data still lives in memory for this session
  }
}
const persist = () => {
  write('server', server);
  write('outbox', outbox);
  write('failed', failed);
  write('settings', settings);
};

const newId = () =>
  crypto.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
const now = () => new Date().toISOString();

// ---------- Applying changes to a local copy ----------

function applyOp(trips, op) {
  const a = op.args;
  const tripOf = (id) => trips.find((t) => t.id === id);
  switch (op.type) {
    case 'createTrip':
      if (!tripOf(a.trip.id)) trips.push({ ...a.trip, members: a.members, expenses: [], payments: [] });
      break;
    case 'deleteTrip':
      return trips.filter((t) => t.id !== a.id);
    case 'addMember': {
      const t = tripOf(a.member.trip_id);
      if (t && !t.members.some((m) => m.id === a.member.id)) t.members.push(a.member);
      break;
    }
    case 'renameMember': {
      const m = tripOf(a.trip_id)?.members.find((x) => x.id === a.id);
      if (m) m.name = a.name;
      break;
    }
    case 'updateMember': {
      const m = tripOf(a.trip_id)?.members.find((x) => x.id === a.id);
      if (m) Object.assign(m, a.patch);
      break;
    }
    case 'deleteMember': {
      const t = tripOf(a.trip_id);
      if (t) t.members = t.members.filter((m) => m.id !== a.id);
      break;
    }
    case 'saveExpense': {
      const t = tripOf(a.expense.trip_id);
      if (t) t.expenses = [...t.expenses.filter((e) => e.id !== a.expense.id), a.expense];
      break;
    }
    case 'deleteExpense': {
      const t = tripOf(a.trip_id);
      if (t) t.expenses = t.expenses.filter((e) => e.id !== a.id);
      break;
    }
    case 'addPayment': {
      const t = tripOf(a.payment.trip_id);
      if (t && !t.payments.some((p) => p.id === a.payment.id)) t.payments.push(a.payment);
      break;
    }
    case 'deletePayment': {
      const t = tripOf(a.trip_id);
      if (t) t.payments = t.payments.filter((p) => p.id !== a.id);
      break;
    }
    case 'uploadBill': {
      const e = tripOf(a.trip_id)?.expenses.find((x) => x.id === a.expense_id);
      if (e) e.bill_path = a.path;
      break;
    }
    case 'removeBill': {
      const e = tripOf(a.trip_id)?.expenses.find((x) => x.id === a.expense_id);
      if (e && e.bill_path === a.path) e.bill_path = null;
      break;
    }
  }
  return trips;
}

function sortTrip(t) {
  t.members.sort((a, b) => a.created_at.localeCompare(b.created_at));
  t.expenses.sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at));
  t.payments.sort((a, b) => b.paid_on.localeCompare(a.paid_on) || b.created_at.localeCompare(a.created_at));
  return t;
}

function buildSnapshot() {
  let trips = structuredClone(server.trips);
  const pendingTrips = new Set();
  for (const op of outbox) {
    trips = applyOp(trips, op);
    pendingTrips.add(op.tripId);
  }
  trips.forEach(sortTrip);
  trips.sort((a, b) => b.created_at.localeCompare(a.created_at));
  snapshot = {
    trips,
    loaded: server.loaded,
    settings,
    userId,
    userEmail,
    status: {
      online,
      syncing,
      pending: outbox.length,
      pendingTrips,
      failed,
      loadError,
      lastSynced: server.fetchedAt,
    },
  };
}

function emit() {
  buildSnapshot();
  listeners.forEach((l) => l());
}

// ---------- Uploading and downloading ----------

function isNetworkError(error) {
  if (!navigator.onLine) return true;
  if (!error) return false;
  if (error.code === 'PGRST301') return true; // expired login, refreshed on next try
  if (error.code) return false;
  return /fetch|network|load failed|timeout|aborted/i.test(error.message || '');
}

function friendly(error) {
  if (/column .*email/i.test(error.message || '') || /members_trip_email_uq/.test(error.message || '')) {
    return /members_trip_email_uq/.test(error.message || '')
      ? 'That email is already used by another person on this trip.'
      : 'Sharing by email is not set up yet (run supabase/sharing.sql in Supabase), then tap Retry.';
  }
  if (/bucket not found/i.test(error.message || '')) return 'Bill photos are not set up yet (run supabase/bills.sql in Supabase), then tap Retry.';
  if (/bill_path/.test(error.message || '')) return 'Bill photos are not set up yet (run supabase/bills.sql in Supabase), then tap Retry.';
  if (error.code === '23505') return 'That name is already used on this trip.';
  if (error.code === '23503') return 'It is still used by expenses or payments.';
  return error.message;
}

async function execute(op) {
  const a = op.args;
  const ignore = { onConflict: 'id', ignoreDuplicates: true };
  switch (op.type) {
    case 'createTrip': {
      const r = await supabase.from('trips').upsert(a.trip, ignore);
      if (r.error) return r.error;
      if (!a.members.length) return null;
      return (await supabase.from('members').upsert(a.members, ignore)).error;
    }
    case 'deleteTrip': {
      // Remove this trip's bill photos (errors here should not block deleting the trip)
      const folder = `${userId}/${a.id}`;
      const list = await supabase.storage.from('bills').list(folder, { limit: 1000 });
      if (list.error && isNetworkError(list.error)) return list.error;
      if (list.data?.length) await supabase.storage.from('bills').remove(list.data.map((f) => `${folder}/${f.name}`));
      return (await supabase.from('trips').delete().eq('id', a.id)).error;
    }
    case 'addMember':
      return (await supabase.from('members').upsert(a.member, ignore)).error;
    case 'renameMember':
      return (await supabase.from('members').update({ name: a.name }).eq('id', a.id)).error;
    case 'updateMember':
      return (await supabase.from('members').update(a.patch).eq('id', a.id)).error;
    case 'deleteMember':
      return (await supabase.from('members').delete().eq('id', a.id)).error;
    case 'saveExpense': {
      const e = a.expense;
      return (
        await supabase.rpc('save_expense', {
          p_id: e.id,
          p_trip_id: e.trip_id,
          p_description: e.description,
          p_amount: e.amount,
          p_paid_by: e.paid_by,
          p_category: e.category,
          p_spent_on: e.spent_on,
          p_splits: e.expense_splits.map((s) => ({ member_id: s.member_id, share: s.share })),
        })
      ).error;
    }
    case 'deleteExpense': {
      const r = await supabase.from('expenses').delete().eq('id', a.id);
      if (r.error) return r.error;
      if (a.bill_path) {
        await supabase.storage.from('bills').remove([a.bill_path]);
        deleteBlob(a.bill_path);
      }
      return null;
    }
    case 'uploadBill': {
      const blob = await getBlob(a.path);
      if (!blob) return { message: 'The photo is no longer on this phone.', code: 'LOCAL' };
      const up = await supabase.storage.from('bills').upload(a.path, blob, { contentType: 'image/jpeg', upsert: true });
      if (up.error) return up.error;
      return (await supabase.from('expenses').update({ bill_path: a.path }).eq('id', a.expense_id)).error;
    }
    case 'removeBill': {
      const r = await supabase.storage.from('bills').remove([a.path]);
      if (r.error && isNetworkError(r.error)) return r.error;
      deleteBlob(a.path);
      return (await supabase.from('expenses').update({ bill_path: null }).eq('id', a.expense_id).eq('bill_path', a.path)).error;
    }
    case 'addPayment':
      return (await supabase.from('payments').upsert(a.payment, ignore)).error;
    case 'deletePayment':
      return (await supabase.from('payments').delete().eq('id', a.id)).error;
    default:
      return null;
  }
}

async function push() {
  while (outbox.length) {
    const op = outbox[0];
    let error;
    try {
      error = await execute(op);
    } catch (e) {
      error = { message: String(e?.message || e) };
    }
    if (error && isNetworkError(error)) {
      online = navigator.onLine ? online : false;
      return false;
    }
    outbox.shift();
    if (error) failed = [...failed, { id: op.id, label: op.label, message: friendly(error), op }];
    persist();
    emit();
  }
  return true;
}

async function pull() {
  const { data, error } = await supabase
    .from('trips')
    .select('*, members(*), expenses(*, expense_splits(*)), payments(*)');
  if (error) {
    if (error.code === 'PGRST205') {
      loadError = 'The database is not set up yet. In Supabase open SQL Editor → New query, paste supabase/schema.sql, click Run, then reload this page.';
    } else if (!isNetworkError(error)) {
      loadError = error.message;
    }
    return;
  }
  loadError = '';
  server = { trips: data, loaded: true, fetchedAt: now() };
  persist();
}

let running = null;
let again = false;

export function syncNow() {
  if (!userId) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    // Let `running` be assigned before anything below can finish and clear it.
    await Promise.resolve();
    syncing = true;
    emit();
    try {
      do {
        again = false;
        if (!navigator.onLine) break;
        const pushed = await push();
        if (pushed) await pull();
      } while (again);
    } finally {
      syncing = false;
      running = null;
      emit();
    }
  })();
  return running;
}

// ---------- Setup ----------

let started = false;
function startListeners() {
  if (started) return;
  started = true;
  window.addEventListener('online', () => { online = true; emit(); syncNow(); });
  window.addEventListener('offline', () => { online = false; emit(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  // Retry now and then in case the "online" event is missed (weak mountain signal).
  const timer = setInterval(() => {
    if (outbox.length && navigator.onLine) syncNow();
  }, 30000);
  timer.unref?.();
}

export function initStore(uid, email = '') {
  userEmail = (email || '').toLowerCase();
  if (userId === uid) return;
  userId = uid;
  server = read('server', { trips: [], loaded: false, fetchedAt: null });
  outbox = read('outbox', []);
  failed = read('failed', []);
  settings = read('settings', { allowEdit: false });
  loadError = '';
  startListeners();
  emit();
  syncNow();
}

export function clearStore() {
  if (userId) ['server', 'outbox', 'failed', 'settings'].forEach((n) => localStorage.removeItem(key(n)));
  userId = null;
  server = { trips: [], loaded: false, fetchedAt: null };
  outbox = [];
  failed = [];
  emit();
}

export const hasPendingChanges = () => outbox.length > 0;

// Put failed changes back in the upload queue (e.g. after fixing the database).
export function retryFailed() {
  const ops = failed.filter((f) => f.op).map((f) => f.op);
  failed = [];
  outbox = [...outbox, ...ops];
  persist();
  emit();
  syncNow();
}

export function dismissFailed() {
  failed = [];
  persist();
  emit();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getSnapshot() {
  if (!snapshot) buildSnapshot();
  return snapshot;
}
export const useStore = () => useSyncExternalStore(subscribe, getSnapshot);

// ---------- Actions (work offline; throw an Error with a message if not allowed) ----------

function enqueue(type, tripId, label, args) {
  outbox = [...outbox, { id: newId(), type, tripId, label, args, at: now() }];
  persist();
  emit();
  syncNow();
}

const findTrip = (id) => getSnapshot().trips.find((t) => t.id === id);

const cleanEmail = (e) => (e || '').trim().toLowerCase() || null;

export function createTrip({ name, currency, start_date, end_date, people }) {
  const trip = { id: newId(), owner_id: userId, name, currency, start_date, end_date, created_at: now() };
  // people: ["Name", ...] or [{ name, email }, ...]
  const members = people.map((p, i) => {
    const m = {
      id: newId(),
      trip_id: trip.id,
      name: typeof p === 'string' ? p : p.name,
      created_at: new Date(Date.now() + i).toISOString(),
    };
    const mail = typeof p === 'string' ? null : cleanEmail(p.email);
    if (mail) m.email = mail; // only send the column when used
    return m;
  });
  enqueue('createTrip', trip.id, `Create trip "${name}"`, { trip, members });
  return trip.id;
}

export function deleteTrip(id) {
  const t = findTrip(id);
  enqueue('deleteTrip', id, `Delete trip "${t?.name ?? ''}"`, { id });
}

function checkMember(t, id, name, email) {
  if (name && t?.members.some((m) => m.name === name && m.id !== id)) throw new Error(`${name} is already on this trip.`);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That email does not look right.');
  if (email && t?.members.some((m) => m.email && m.email.toLowerCase() === email && m.id !== id)) {
    throw new Error('That email is already used by another person on this trip.');
  }
}

export function addMember(tripId, name, email) {
  const t = findTrip(tripId);
  const mail = cleanEmail(email);
  checkMember(t, null, name, mail);
  const member = { id: newId(), trip_id: tripId, name, created_at: now() };
  if (mail) member.email = mail; // only send the column when used
  enqueue('addMember', tripId, `Add ${name}`, { member });
}

// patch: { name?, email? }
export function updateMember(tripId, id, patch) {
  const t = findTrip(tripId);
  const clean = {};
  if (patch.name !== undefined) clean.name = patch.name;
  if (patch.email !== undefined) clean.email = cleanEmail(patch.email);
  checkMember(t, id, clean.name, clean.email);
  enqueue('updateMember', tripId, `Update ${clean.name ?? 'person'}`, { trip_id: tripId, id, patch: clean });
}

export function renameMember(tripId, id, name) {
  updateMember(tripId, id, { name });
}

// Is this trip owned by the signed-in user? (trips made on this phone before upload have no owner yet)
export const isMine = (trip) => !trip.owner_id || trip.owner_id === userId;

export function deleteMember(tripId, id) {
  const t = findTrip(tripId);
  const m = t?.members.find((x) => x.id === id);
  const used =
    t?.expenses.some((e) => e.paid_by === id || e.expense_splits.some((s) => s.member_id === id)) ||
    t?.payments.some((p) => p.from_member === id || p.to_member === id);
  if (used) throw new Error(`${m?.name ?? 'This person'} is part of expenses or payments. Edit or delete those first.`);
  enqueue('deleteMember', tripId, `Remove ${m?.name ?? 'person'}`, { trip_id: tripId, id });
}

// splits: [{ member_id, share }] with share as a number (e.g. 33.33)
export function saveExpense({ id, trip_id, description, amount, paid_by, category, spent_on, splits, created_at, bill_path }) {
  const expenseId = id ?? newId();
  const expense = {
    id: expenseId,
    trip_id,
    description,
    amount,
    paid_by,
    category,
    spent_on,
    created_at: created_at ?? now(),
    bill_path: bill_path ?? null,
    expense_splits: splits.map((s) => ({ expense_id: expenseId, member_id: s.member_id, share: s.share })),
  };
  enqueue('saveExpense', trip_id, `${id ? 'Edit' : 'Add'} expense "${description}"`, { expense });
  return expenseId;
}

export function deleteExpense(tripId, expense) {
  enqueue('deleteExpense', tripId, `Delete expense "${expense.description}"`, {
    trip_id: tripId,
    id: expense.id,
    bill_path: expense.bill_path ?? null,
  });
}

export function addPayment({ trip_id, from_member, to_member, amount, paid_on, note }) {
  const payment = { id: newId(), trip_id, from_member, to_member, amount, paid_on, note, created_at: now() };
  enqueue('addPayment', trip_id, 'Record payment', { payment });
}

export function deletePayment(tripId, id) {
  enqueue('deletePayment', tripId, 'Delete payment', { trip_id: tripId, id });
}

export function setSetting(name, value) {
  settings = { ...settings, [name]: value };
  persist();
  emit();
}

// Save a (compressed) bill photo on the phone and queue it for upload.
export async function attachBill(tripId, expenseId, blob) {
  const path = `${userId}/${tripId}/${expenseId}-${Date.now()}.jpg`;
  await putBlob(path, blob);
  enqueue('uploadBill', tripId, 'Upload bill photo', { trip_id: tripId, expense_id: expenseId, path });
}

export function removeBill(tripId, expenseId, path) {
  enqueue('removeBill', tripId, 'Remove bill photo', { trip_id: tripId, expense_id: expenseId, path });
}
