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
     - Authorized redirect URI: `https://uxhyrjextnxqbnfrngzk.supabase.co/auth/v1/callback`
3. **Supabase dashboard** (project `pursuit`)
   - Authentication → Sign In / Providers → Google: enable, paste the client ID and secret
   - Authentication → URL Configuration: Site URL = your Vercel URL; add it (and `http://localhost:5173`) to Redirect URLs

## Data and sync
- Signed in: one row per user in `public.user_state` (whole workspace as JSON), protected by row-level security. Saved ~1s after each change; other devices update live and when the tab regains focus. If two devices edit at the same moment, the last save wins.
- Not signed in (or opened as a local file): saved in the browser only (`localStorage`, key `pursuit:v2`).
- First sign-in uploads whatever is on the device if the account is empty.
- Sync code: `src/store.tsx`. Keys: `src/config.ts`. Schema: `supabase/schema.sql`.

## How the pieces connect
- **Home**: one list of every open task across all goals, minus anything marked "not today". Automatic order: crucial → important → nearest due date → the goal's own queue order. Drag to set your own order (kept across days; new tasks join at the bottom) or switch back to automatic. Rules live in `todayList()` in `src/logic.ts`.
- **In progress** marks the task and moves you to the next · **Skip** hides it until tomorrow · **Done** completes it
- **Notes** → saved as a log on today's box of the goal grid (more logs = brighter purple)
- **POA** → each line becomes a new task right after the current one in its goal's queue
- **Timer** is manual (start / pause / stop). Session time is added to the task and shown when it's done.
- Tasks can link to a milestone; the milestone shows tasks done / total
- **Streak**: a day counts if you finish a task, write a log, or run a timer session. Stats page: streaks, focus time, 14-day chart, per-goal progress.
- **Tutorial**: shown on first run; reopen from Settings → Show tutorial.
- **Spaces**: shared workspaces. Settings → Spaces to create one (you get an 8-character code) or join with a code; switch between Personal and spaces from the top bar. Members share goals, milestones, tasks, logs and focus time; each person keeps their own list order, focus and timer. Simultaneous edits are merged item by item (`src/spaces.ts`).
