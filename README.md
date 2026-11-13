# Trip Splitter

A React + Supabase website to record trip expenses and work out who owes whom.

## Features
- Sign up / sign in (Supabase Auth). Each account sees only its own trips.
- Trips with dates, currency and the people on the trip.
- Expenses: what, how much, who paid, date, category, split equally or by custom amounts.
- Balances: what each person paid vs. their share, and the fewest payments needed to settle up ("A gives B ₹500").
- Record payments between people (or click **Mark paid**), with history.
- Summary: totals by category, by person and by day.

## Setup
1. Create a free project at https://supabase.com.
2. In Supabase open **SQL Editor → New query**, paste everything from `supabase/schema.sql`, and click **Run**.
3. Copy `.env.example` to `.env` and fill in the values from **Project Settings → API**:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. Install and run:
   ```
   npm install
   npm run dev
   ```
   Open http://localhost:5173.

Tip: for quick testing, you can turn off email confirmation in Supabase under
**Authentication → Sign In / Providers → Email → Confirm email**.

## Build for hosting
`npm run build` creates the `dist/` folder, which you can deploy to Netlify, Vercel or any static host
(set the same two `VITE_` environment variables there, and add a rewrite of all paths to `/index.html`).
