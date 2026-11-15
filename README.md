# IGC Tournament Hub (India Golf Carnival 2026–27)

A single-page site: sign-in → dashboard (tour calendar, Almaty qualifiers per city, registrations), participants by city (mobile, email, home club, handicap index), and per-city scores showing the handicap method used. Clicking a player who has played opens their 18-hole scorecard (Out / In, par, stroke index, birdie/bogey markers, and the handicap calculation).

- **Database:** Supabase project **IGC** (`xivczksxmxarkqbwolth`, Mumbai). Tables: `cities`, `participants`, `scores`, `holes` (par + stroke index per hole per city), `hole_scores` (strokes per hole per player), `staff`.
- **Data:** fake sample data. Registration opens city by city just before each event (`cities.registration_status`: `not_open` / `open` / `closed`). Delhi is closed with 104 players and scores, Bhopal is open with 45 so far, and the rest are not open (no players). Every player belongs to exactly one city.
- **Sign-in (same as the ARHM checklist):** email + password through Supabase Auth, remembered on each device. Sign-in only: an admin creates each account. Never store passwords in a table.
- **Security:** Row Level Security means only signed-in users whose email is in `staff` can read anything. Anonymous visitors and self-signups see nothing. The repo contains only code, not player data.

## 1. Give yourself (and the team) access
1. Supabase dashboard → **Authentication → Users → Add user → Create new user**. Enter email + password and tick *Auto Confirm User*.
2. **SQL Editor**, run:
   ```sql
   insert into public.staff (email, full_name) values ('you@islworld.in', 'Your Name');
   ```
3. Open the site and sign in with that email and password.

Also turn off public sign-ups: **Authentication → Sign In / Providers → Allow new users to sign up → off**.

## 2. Run it locally
```bash
cd igc-site
python3 -m http.server 8080
```
Then open http://localhost:8080. The front page is the scroll-animated intro; **Staff sign in** goes to `app.html`, the hub. Stop the server with Ctrl+C. To change the site, edit `src.html` and run `python3 build.py`.

## Player scoring & event setup
- **Sign in** (`login.html`): choose **Player** or **Admin**. Players land on `play.html`, admins on `app.html`.
- **Players** see two tabs: **Leaderboard** (live, refreshes every 30 s, no contact details) and **My scorecard**. The scorecard shows hole, black and blue yards, par, index, the handicap set by the admin (locked), and a −/+ box per hole that saves instantly. There are round tabs for multi-round events. Score entry works only while the admin has scoring open.
- **Admins** get an **Event setup** tab: holes per round (9, 18 or any 1–18), rounds (1–4), handicap format, a scoring open/closed switch, the full course card (par, stroke index and yards per tee; add, rename, recolour or remove tees such as Black, Blue, White, Red; a "standard layout" filler and validation), and each player's playing handicap.
- **Player logins:** create the account in Supabase **Authentication → Add user** using the **same email as the player's registration**. That's how a login is linked to a player.
- **Security:** players can read only their own row, their event's course and the leaderboard; they can write only their own card, for rounds and holes that exist, while scoring is open. Totals in `scores` update automatically when a card is complete.

## Competition formats (scoring.js, shared by admin and players)
Set per event in **Event setup → Competition format**:
- **Scoring:** Stroke play, Stableford, Modified Stableford (editable points tables), Par/Bogey. Each can be **gross or net**.
- **Handicap source:** playing handicap set by admin; **Super 36 / System 36** (points for albatross/eagle/birdie/par/bogey/double+ and the start value are editable per event; standard is par or better 2, bogey 1, double+ 0, handicap = 36 − points, scaled for 9 holes); **Peoria** (admin picks hidden holes); or scratch.
- **Allowance %** (WHS recommends 95% for individual stroke play and Stableford), **max handicap**, **max score per hole** (none, net double bogey, par + N).
- **Tie-break** (countback last 9/6/3/1, lower handicap, or shared), **qualifiers** (top N), and **leaderboard visibility for players** (live, after the event, or hidden).
- Players see a plain-English "How this event is scored" card, their handicap (locked or auto-calculated), and for each hole the result (Birdie, Par, Bogey) plus points or Super 36 points.
- **CSV export** (Scores tab): one event or all events. Includes position, contact details, handicap, format, totals and every hole of every round. Opens in Excel or Google Sheets.

## 3. Updating data
Use **Table Editor** in Supabase:
- **Opening a city:** set its `registration_status` to `open`, then add players to `participants` with that `city_id`. Set it to `closed` when entries close.
- **Before an event:** add the host course's 18 rows to `holes` (par, stroke index).
- **After an event:** set `cities.status = 'completed'`, add 18 `hole_scores` rows per player, and one `scores` row per player (`gross`, `handicap_applied`, `net`, plus `pars`/`birdies`/`eagles` for Super 36). The totals should match the hole-by-hole card.
- **Change a city's format:** edit `cities.handicap_method` (`super36` or `registered`).
- The site ranks players by net, then lower gross. Top 10 per city are marked as Almaty qualifiers.

## Assumptions to confirm with the tournament office
- **Registered handicap** = index × 125 ÷ 113 (assumed slope 125).
- Formats for the upcoming cities are placeholders.
- The Qutab hole pars and stroke indexes are a made-up par-72 layout.
- Venues come from the Kazakhstan Embassy proposal. That document lists Sapta Shakti under Jamshedpur and Beldih under Jaipur. The site assumes those are swapped: Sapta Shakti is in Jaipur, Beldih in Jamshedpur.
- Dates follow the internal ops schedule, which differs from the proposal's table.

## Files
- `index.html` + `frames/`: scroll intro (240 WebP frames from the Gemini video, drawn on a canvas as you scroll)
- `app.html`: the hub (built, with images inlined)
- `src.html` + `build.py` + `banner.jpg`: source; run `python3 build.py` after editing
- `supabase/schema.sql`, `supabase/seed.sql`: tables, security rules and the fake data generator
