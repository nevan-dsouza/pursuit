# Pursuit

Goals → milestones → tasks. Home shows the top task of the selected goal; Goals holds the timeline grid, milestones, logs and the task queue; Meetings shows this week's Google Calendar.

## Run locally
```
npm install
npm run dev        # http://localhost:5173
```

## Go live (3 steps)
1. **Vercel**: in this folder run `npx vercel --prod` (framework Vite, build `vite build`, output `dist`). Note the URL.
2. **Google Cloud Console**
   - Enable the **Google Calendar API**
   - OAuth consent screen: External; add yourself (and testers) as test users; add scope `calendar.events.readonly`
   - Credentials → OAuth client ID → Web application
     - Authorized JavaScript origins: your Vercel URL
     - Authorized redirect URI: `https://fyvdamlthjzsrisbjyam.supabase.co/auth/v1/callback`
3. **Supabase dashboard** (project `pursuit`)
   - Authentication → Sign In / Providers → Google: enable, paste the client ID and secret
   - Authentication → URL Configuration: Site URL = your Vercel URL; add it (and `http://localhost:5173`) to Redirect URLs

## Data and sync
- Signed in: one row per user in `public.user_state` (whole workspace as JSON), protected by row-level security. Saved ~1s after each change; other devices update live and when the tab regains focus. If two devices edit at the same moment, the last save wins.
- Not signed in (or opened as a local file): saved in the browser only (`localStorage`, key `pursuit:v2`).
- First sign-in uploads whatever is on the device if the account is empty.
- Sync code: `src/store.tsx`. Keys: `src/config.ts`. Schema: `supabase/schema.sql`.

## How the pieces connect
- **Home = Today**, one list across all goals: the next task in each goal's queue + tasks in progress + tasks you add by hand, minus anything marked "not today". Order: crucial → important → nearest due date; drag to override for the day. Rules live in `todayList()` in `src/logic.ts`.
- **In progress** keeps the task in Today · **Skip** removes it for today · **Done** completes it (the goal's next task then appears)
- **Notes** → saved as a log on today's box of the goal grid (more logs = brighter purple)
- **POA** → each line becomes a new task right after the current one in its goal's queue
- **Timer** is manual (start / pause / stop). Session time is added to the task and shown when it's done.
- Tasks can link to a milestone; the milestone shows tasks done / total
- **Streak**: a day counts if you finish a task, write a log, or run a timer session. Stats page: streaks, focus time, 14-day chart, per-goal progress.
- **Tutorial**: shown on first run; reopen from Settings → Show tutorial.
