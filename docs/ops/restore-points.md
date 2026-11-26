# Restore points

Saved versions of the website and app you can go back to. Each one is a commit that
stays in the history for good.

## Before the four animations (2026-11-07)
The website and app as they were before the animated "Call to Paid" flow, the crew
checklist ring, the sliding tab highlight and the dashboard count-up/gauge.
Includes the new hero buttons, the new login screen and the dashboard fixes.

- live site (main): `9ddc604f46962398b26fdd009fa68cba7ddef738`
- work branch: `5401cb28126a435f2707794f755aa01b2504d950`

To go back: ask Claude "restore the before-animations version", or run
`git checkout 9ddc604f46962398b26fdd009fa68cba7ddef738 -- <files>` for just the files you want and ship them.
To compare: `git diff 9ddc604f46962398b26fdd009fa68cba7ddef738 main`.

## With the three app animations (2026-11-07)
Crew checklist ring + Finish job, sliding tab pill, dashboard Week pace ring and
count-up numbers. Website unchanged from the version above.

- live site (main): `e6da842`

## Before the motion polish (2026-11-08)
The three app animations, without the motion polish (cards rising in, springy
presses, tab bounce, ring glow, Finish job burst).

- live site (main): `47c3657`

## Before matching the reel videos (2026-11-08)
Motion polish and the 6-month dashboard fix, before the stretchy tab pill, glass
capsule tab bars, circle theme switch and dark hero card.

- live site (main): `1f49347`

## Before the closer copy of the reels (2026-11-08)
Stretchy tab pill, capsule tabs, circle theme switch and the dark first money
card; before the all-white sales-style cards, the tick gauge, the sidebar pill,
glass-while-moving and the icon-only phone bar.

- live site (main): `e8595ab`

## Before the card polish (2026-11-08)
Sales-style cards with the number beside the chart, purple Ask AI; before the
roomier cards, cursor spotlight, chart hover readout and blue AI.

- live site (main): `b196961`

## Before the app-wide cards and connected chips (2026-11-08)
Dashboard-only card style; other pages kept their old panels, no hover lift,
team chat grew the page, and connected calendars/inbox/social still showed
their full setup boxes.

- live site (main): `a47c9ac`

## Before the one-card calendar (2026-11-08)
Calendar with Google/inspection boxes, To-dos and Upcoming as separate cards
above the grid and the colour key under it; connected boxes showed as chips.

- live site (main): `26ff21c`

## Before the AI pop-up, phone home and tutorial redesign (2026-11-09)
Plain AI chat box (no phone header button), navy phone home, 15-step tour.

- live site (main): `620ec75`

## Before the glass look and removing the AI CEO bar (2026-11-09)
Solid white cards, slate sidebar, AI CEO briefing bar at the top of the dashboard.

- live site (main): `3104e25`

## Before see-through glass cards (2026-11-09)
Frosted but mostly white cards over a light blue background.

- live site (main): `a093bf3`

## Before the white background with blue-shine glass (2026-11-09)
See-through glass cards over a strong blue-tinted background.

- live site (main): `2238ce8`

## Before the glass look on every page (2026-11-09)
Blue-shine glass on the main cards only; other pages kept flat white boxes
and underlined tabs.

- live site (main): `33ee363`

## Before numbers count up on every page (2026-11-09)
Only the dashboard's numbers counted up.

- live site (main): `daa91e5`

## Before the AI Team redesign (2026-11-09)
Plain white team map with grey lines, purple AI avatars, flat chat.

- live site (main): `2e01f76`

## Before the smoother AI Team animation (2026-11-09)
Glass AI Team map with SVG-animated dots, flowing dashed lines and pulsing glows (laggy).

- live site (main): `826e942`

## Before stats on every page count up (Website tiles, times) (2026-11-09)
Website stats and other dashboard-style tiles outside the dashboard did not count up.

- live site (main): `36ee7fe`

## Before "type your website" connection (2026-11-09)
Website connection was 3 manual steps: copy code, pick a platform from a list, press Check now.

- live site (main): `d8cc571`

## Before the cleaner Needs you / This week cards (2026-11-09)
Plain Needs you rows, number-badge week strip, Week pace showing zeros on a quiet week.

- live site (main): `3eac1db`

## Before the mini week board on the dashboard (2026-11-10)
"This week" was day pills with dots and the chosen day's list underneath.

- live site (main): `0d4bb48`

## Before the today-banner week card (2026-11-10)
"This week" was a 7-column board with job bars.

- live site (main): `57f7329`

## Before the Jobs pages polish (2026-11-10)
- Live site (main): `69d7a71`
- Changes: job steps fold into a slim banner, status tag + "Next" line on project cards, open project shows 6 main tabs + More, details as tiles with call/text/map, light glass project header on phone.

## Before the open-project redesign v2 (2026-11-10)
- Live site (main): `f3848b5`
- Changes: capsule tabs + cleaner More menu, Overview as a Customer card + Job info list, automatic texts as a slim switch inside the customer card.

## Before default trade photos on project cards (2026-11-10)
- Live site (main): `64d308c`
- Changes: projects with no photos show one of the 4 website trade photos (roofing, HVAC, painting, pool), matched to the job, with an "Add photo" button; list rows use the same photo as a thumbnail.

## Before default photos take turns 1-4 (2026-11-10)
- Live site (main): `5ac0d53`
- Changes: default card photos cycle roofers, HVAC, painter, pool in order instead of matching the job type.

## Before the completed-job record (2026-11-10)
- Live site (main): `113b17e`
- Changes: Overview customer card same height as Job info and opens the Leads profile; completed jobs open a read-only record (money, won/finished, stages, who worked + hours + clock-ins, expenses, materials, payments, photos, documents, notes). New file portal/jobrecord.js.

## Before the glass website with light ribbons and mint buttons (2026-11-11)
- Live site (main): `f1c5d04`
- Changes: homepage background of drifting blue and mint light ribbons, frosted-glass cards with a blue shine, mint (#16C79A) for the Start free trial buttons. Cube animation unchanged.

## Before white plan cards and new app screenshots (2026-11-11)
- Live site (main): `622e24c`
- Changes: all three plan cards white glass (popular one with a blue-to-mint edge), buttons on blue cards stay white, the website app screenshots retaken from the current app (WebP).

## Before the glass look on every website page (2026-11-11)
- Live site (main): `d70f077`
- Changes: all marketing, calculator and compare pages, sign-up, help and legal pages get the light ribbons, frosted-glass sections, General Sans headlines and mint main buttons. New shared file site/ribbons.js.

## Before the popular plan card fix (2026-11-11)
- Live site (main): `d97c4a4`
- Changes: the $199 card gets an even blue edge, a solid blue price and no lift.

## Before the pilot program (2026-11-11)
- Live site (main): `d191350`
- Changes: 20-seat pilot. The first 20 sign-ups get a 30-day trial (account-signup v26, billing-webhook v22, accounts.pilot, pilot_seats()); the site shows a live seats-left badge and "first month free", going back to 14 days when the seats are gone. To end the pilot early: set ai_config pilot_seats to 0.

## Before removing the pilot from the website (2026-11-11)
- Live site (main): `d212eb1`
- Changes: pilot badge and "first month free" wording taken off the site until the launch video is ready; ai_config pilot_seats set to 0 so sign-ups get the normal 14 days. The pilot code stays (site/pilot.js, pilot_seats(), account-signup): to turn it back on, set pilot_seats to 20 and put the page wording back from main `d212eb1`.

## Before the glitch-free cube loop (2026-11-12)
- Live site (main): `563345f`
- Changes: the hero loop clip (icons swapping at 4.4s, cube snapping at 7.0s) replaced by assets/site/hero-loop.mp4, the clean first 4.4s played forward then back; the intro holds its last frame until the loop is playing.

## Before mint in the app (2026-11-12)
- Live site (main): `96e4688`
- Changes: mint (#16C79A) on the one main action per screen (New estimate, + Add job, Mark done, a dialog's confirm button) and on done/paid/ready states; blue stays for everything else. All in portal/glass.css ("Mint, the 10%").

## Before the mint-glow cube (2026-11-12)
- Live site (main): `00a8276`
- Changes: homepage loop is a new Higgsfield clip (Kling 3.0 Turbo, 16 credits) where the document tile fills with a mint glow, played forward then back (assets/site/hero-loop-mint.mp4); the intro now always plays before the loop (before, a faster-loading loop could freeze on its first frame for 8s).

## Before zooming the cube out (2026-11-12)
- Live site (main): `c19b03f`
- Changes: hero cube video scale 1.32 -> 1.1; the cube card background matched to the clip edges so no line shows where the video ends.

## Before the twisting mint cube (2026-11-13)
- Live site (main): `9d0104c`
- Changes: homepage loop is a new Higgsfield clip (MiniMax H3 2K, 16 credits) where the cube twists like a Rubik's cube with the mint tile glowing (assets/site/hero-loop-rubik.mp4); the intro is now hosted here with the first 4.5s of the mint clip crossfaded on as a bridge (assets/site/hero-intro.mp4).

## Before the service worker skips videos (2026-11-13)
- Live site (main): `da5ef02`
- Changes: sw.js (bp-sw-2) no longer handles video/audio or range requests, so Safari plays the homepage cube clips (now hosted on our site with ?v=) for anyone who has opened the app.

## Before the website lag fix (2026-11-13)
- Live site (main): `28fb87c`
- Changes: no live backdrop blur on the website panes (site.css, mkt-nav.css, legal.css, signup.html), the hidden scroll-story layers use a solid wash, and the light ribbons hold still while the homepage hero covers them. Hero went from about 20 to 56 frames a second.

## Before the cube clip swap back to the original motion (2026-11-13)
- Live site (main): `ae789c5`
- Changes: the homepage cube uses the user's original-motion clip again, with the icon-swap flicker at 4.4s crossfaded, the snap-turn at 6.9s slowed into a smooth turn, and a soft mint glow inside the cube (the intro fades the glow in over its last 2.5s). The MiniMax rubik loop is removed. Card background re-matched to the clip's edge colour.

## Before the cube zoom-out for wide screens (2026-11-13)
- Live site (main): `b4581c7`
- Changes: the homepage cube clip now fits the tighter side of its card (it used to size by width only, so on wide, short screens the cube filled the card), is about 10% smaller overall, and fades on all four edges.

## Before the cube turn smoothing (2026-11-13)
- Live site (main): `60940ff`
- Changes: the cube's left turn near the end of the loop plays at its natural speed with light motion blur instead of the slowed version (which held then jumped), and the last half-second eases into the first frame so the loop repeats without a hitch.

## Before removing the homepage scroll story (2026-11-13)
- Live site (main): `5e55adb`
- Changes: removed the full-screen scroll story under the hero (the zoomed cube clip with the "Never miss a job / Run it from one screen / Grow on real numbers" cards), along with its script and styles. The hero now leads straight into "Why BuilderPro".

## Before the Needs you redesign, the page rise-in and the app ribbons (2026-11-13)
- Live site (main): `2b2e28e`
- Changes: the dashboard's Needs you card is built like This week (the most urgent thing as the same blue tile, its number big, a white action pill; the all-clear checks as white glass tiles with mint ticks) (portal/dash.js, portal/dash.css). Every page switch and the first load lift each card in one after another, once (portal/motion.js, portal/motion.css). The website's blue and mint light ribbons now drift behind the app, with no live blur on the cards (portal/appbg.js, portal/glass.css).

## Before the app lag fix (2026-11-13)
- Live site (main): `b90b91e`
- Changes: the app's light ribbons are painted once and held still instead of redrawn every frame (14 to 60 frames a second on a normal laptop), and the card rise-in starts with one layout pass and moves cards on the graphics card (portal/appbg.js, portal/glass.css, portal/motion.js, portal/motion.css).

## Before the silk-light background (2026-11-13)
- Live site (main): `4ca1243`
- Changes: one shared background, site/silk.js, after the reference reel the user sent (one ribbon of fine threads pinched to a glowing waist, fanning wide and rolling slowly), drawn in a background thread (OffscreenCanvas in a Worker) so it moves without taking frames from the page. Used by the app (portal/appbg.js), the homepage (site/site.js) and the other pages (site/ribbons.js, version stamps updated on 48 pages).

## Before the theme pass, the live AI board and the dark-mode fixes (2026-11-14)
- Live site (main): `e67425d`
- Changes: the four money cards each draw their own chart (bars, smooth line, lollipops, staircase); Needs you lead tile in white; Week pace and the chart palette in blue, sky, mint and navy; about 590 off-theme oranges, yellows, purples and pinks across 42 app files moved onto the palette (reds and brand logos kept); the AI Team board alive (portal/aiboard.js: curved swaying links, task pulses, hover); black sidebar in dark mode; the background haze blurred so it never bands; the sidebar fits short windows.

## Before the slimmer dashboard (2026-11-14)
- Live site (main): `106abae`
- Changes: the dashboard's main view is four stat cards (Projects won, New leads, Active projects, Quotes out) and then Marked jobs; the money cards, Week pace, Needs you and This week moved into More numbers and charts (portal/dash.js, portal/dash.css).
- Reverted the same day at the owner's ask: the dashboard is back to the money cards, Week pace, Needs you and This week on top.

## Before the owner's dashboard layout (2026-11-14)
- Live site (main): `b1035a5`
- Changes: dashboard is Projects won, New leads, Active projects and Quotes out on top; then Money in and out beside Your pipeline; then Marked jobs; then every other figure and chart on the page with no fold. The Money in / Profit / Money out cards, Week pace, Needs you and This week are left out (portal/dash.js, portal/dash.css).

## Before the Active projects line graph (2026-11-14)
- Live site (main): `89fb251`
- Changes: the dashboard's Active projects card draws a line of how many projects were running in each period (won before it ended, not finished before it began), like Profit's, instead of an icon (portal/dash.js).

## Before moving the line graph to Projects won (2026-11-14)
- Live site (main): `f164fb4`
- Changes: Projects won draws a line graph (was lollipops); Active projects is back to its icon card (portal/dash.js).

## Before the silk background lag fix (2026-11-15)
- Live site (main): `5b1d982`
- Changes: site/silk.js draws about a tenth of what it did (one frame 110 ms down to 11 ms at 1920x1080 without a graphics card): 80 threads in 3 pieces each with solid colours, a smaller canvas, the blurred haze redrawn every 6th frame and laid in with plain smoothing, 24 frames a second. It measures its own cost and keeps to about 15% of one core (a still picture on a machine too slow for 6 a second), and rests while the person scrolls, clicks or types.

## Before offline mode (2026-11-15)
- Live site (main): `d93aca0`
- Changes: the app works with no signal. sw.js (bp-sw-3) keeps the last good app page and every script it runs on, so /app opens offline. portal/offline.js (loaded before the Supabase library) keeps every answer from Supabase on the device per signed-in person and hands it back offline, and queues crew changes (clock in/out, lunch and breaks, job steps, finishing, photos and files, materials, receipts, chat) to send in order when the signal returns; clock and break taps keep their time through the new crew_clock_at / crew_break_at (migration 20261115000000_offline_clock_at.sql, new functions only). The crew role is remembered on the device (portal/team.js) so an offline crew phone no longer turns into "owner"; the owner's job edits are marked unsent and go first on the next load or reconnect (app.html bpUnsent). Crew app saves today's and tomorrow's checklists ahead (portal/crewapp.js). Offline banner reworded (portal/appfeel.js).

## Before offline mode round two: estimates and invoices (2026-11-16)
- Live site (main): `d7270ef`
- Changes: with no signal, Send on an estimate or an invoice puts it in an outbox (portal/quote.js) instead of failing; it sends by itself with the normal Send code when the signal returns (estimates from the job as it is then; invoices exactly as they were). A queued invoice counts as billed right away so it isn't invoiced twice. Outbox panel on the Estimates and Invoices pages, "In outbox" badge and note on a waiting estimate, and the sync pill counts outbox items. portal/offline.js now keeps read-only server-function answers (list/get/view...), so Contacts, the estimate and invoice lists, the calendar and the inbox open offline; anything that sends, charges or asks the AI still goes straight through. bpOutbox joins the per-account device data.

## Before offline mode round three: new contacts and calendar bookings (2026-11-16)
- Live site (main): `064690d`
- Changes: with no signal, a new contact (app.html bpSaveContact) saves on the phone with an id made on the device, so it keeps the same id when it reaches the server, shows in Contacts and the booking picker right away, and Lisa's first text waits for the signal. Booking, moving or cancelling an appointment or job (ghl-calendar create/update/delete) waits too and shows on the calendar at once; moving or cancelling a booking that hasn't been sent yet changes the waiting one instead of sending anything. Contact edits (PATCH) queue as well. Anything the server refuses when it is finally sent now shows a red notice. portal/offline.js only, plus the messages in app.html.

## Before offline mode round four: work on site (2026-11-16)
- Live site (main): `dbc7ec5`
- Changes: inspection reports can be written, edited, given photos and deleted with no signal (portal/offline.js); the frequent autosaves fold into the one waiting item, and a report made and deleted offline is never sent. Photos taken offline show from the copy waiting to upload (portal/pfiles.js uses bpOffline.localFile), and photos seen online show offline: sw.js keeps job and inspection photos by path in a separate 'bp-photos' cache (newest 400). A reply to a customer (ghl-messaging send) waits in the outbox, shows in the conversation marked "sends when you're back online", and sends on reconnect; sending to a group stays online-only (app.html). Calendar note edits and removals, roof-check status, logged hours, equipment and marking notifications read also wait. New rows queued offline get their permanent id on the phone. Kept lists now follow each table's filters when patched.

## Before offline mode round five: the phone apps (2026-11-16)
- Live site (main): `60c20d3`
- Changes: sw.js now fetches the app page as a web page (Accept: text/html), so inside the Android app Capacitor keeps adding its native bridge (push, camera, Face ID) when the service worker serves the page, and the copy kept for offline has the bridge too. iPhone app: WKAppBoundDomains in mobile/ios/App/App/Info.plist and ios.limitsNavigationsToAppBoundDomains true in mobile/capacitor.config.json, so iOS runs the service worker in the app and it opens offline (takes effect with the next iOS build). mobile/www/offline.html (shown by the apps when the site can't load) has an "Open BuilderPro" button for the copy kept on the phone. docs/APP-STORES.md explains it. To undo the iOS part, set the flag back to false and remove the WKAppBoundDomains key.

## Before offline mode round six: sync you can trust (2026-11-16)
- Live site (main): `4d18b88`
- Changes: a Sync sheet (portal/offline.js), opened from the sync pill or the offline banner (portal/appfeel.js, portal/mobile.css): everything waiting to send with the time it was made and what it is ("Contact: Pat Rivera", "Inspection report: Roof inspection"), plus the outbox count; anything the server refused, with the reason in plain words and Try again / Dismiss (a refused change is now kept whole so it can be sent again, instead of only a red notice). The pill shows "N changes couldn't be saved" until they're handled, and offline it says how old the saved data on screen is. Signing out (app.html bpLogout) warns when offline (no signing back in without a signal) and when changes haven't synced. The app asks the browser to keep its saved data (navigator.storage.persist, not on Firefox, which would ask the person).

## Before offline mode round seven: edits made in two places (2026-11-16)
- Live site (main): `f5ac4c5`
- Changes: an offline edit is now merged with what changed elsewhere meanwhile instead of the last one to sync winning. Records (contacts, inspection reports, calendar notes, roof checks, equipment): portal/offline.js keeps the values the phone saw before the edit and, before sending, reads the record again; a different field changed elsewhere is left alone, the same field changed differently keeps this phone's value and is listed in the Sync sheet under "Changed in two places" with Use theirs / Keep mine, and a record deleted elsewhere is not written to (shown with OK). Jobs and money (app.html): bpBase keeps each job / entry as it was before this device changed it; a change that waited unsent for 30 s or more is merged field by field (bpReconcile, bpOffline.merge3: lists of steps, payments etc. merge item by item, photo lists merge as sets) with the server's copy before saving, and clashes go to the same Sync sheet section. Normal online saves are unchanged.

## Before offline mode round eight: every screen offline (2026-11-16)
- Live site (main): `7fb7866`
- Changes: a sweep of all 43 owner screens and 7 crew screens with no signal found five that broke; fixed in portal/offline.js and portal/aiteam.js. Server-function answers saying "not connected / not set up" (403/404) are kept, so Texts, Email, Calendar and Close Deals say the same thing offline instead of "Could not load". The won-deals list (and any other "..._list" read) is kept. The AI team's read-only lists (status, tasks, threads, approvals) are kept; asking the AI still needs a signal, and its loader no longer stops on a failed request. A table read with nothing kept on the phone is answered "offline" (504) at once: the Supabase library retries failed reads and 503s three times (about 7 s each), which left Subcontractors on "Loading" and would have done the same to any screen not opened online before.

## Before offline mode round nine: weak signal and fresh saved data (2026-11-17)
- Live site (main): `ca41a72`
- Changes (portal/offline.js): weak signal mode. After one slow (9 s) or failed answer while the phone says it's online, for a minute screens get the kept answer at once and a fresh one is fetched quietly behind it, and changes go straight to the queue; the first quick answer (under 2.5 s) ends it, and a slow request that started before that quick answer doesn't restart it. The pill says "Weak signal". Kept answers now remember how they were asked for (without the sign-in token) and how often; while the signal is good (not data saver or 2G), at most every 30 minutes, the 40 most-used kept answers over 20 minutes old are fetched again one at a time (table and server-function reads only, never RPCs). Server functions' 409 "not fully set up" answers are kept like 403/404.

## Before offline mode round ten: privacy and storage on the phone (2026-11-17)
- Live site (main): `c51c419`
- Changes: signing out (app.html bpLogout) now removes that person's kept copies, refused/clash notes and the photo cache from the device (bpOffline.forget), and the account's jobs, money and other device data (bpDeviceForget), unless something hasn't been sent yet (job edits, the invoice outbox, a waiting estimate); changes waiting in the queue always stay and go out at the next sign-in. Kept copies are capped at about 40 MB (trimmed to 30 MB, oldest first) on top of the three-week limit, and trimmed to 10 MB when the phone's storage is over 85% used. If a change can't be stored because the phone is full, kept copies are dropped and it's tried once more; if it still fails the person is told. All in portal/offline.js and app.html.

## Before offline mode round eleven: the morning after (2026-11-17)
- Live site (main): `abc0758`
- Changes: opening the app offline after the sign-in expired (it lasts about an hour) showed the sign-in page and every read waited about 25 s, because the Supabase library kept retrying the renewal. Both Supabase clients in app.html (BP_SB, bpSetSB) now read the stored sign-in through portal/offline.js (bpOffline.authStorage): with no signal an expired sign-in reads as current, so the app opens at once with what's saved (0.3-0.5 s in tests); the stored expiry is never written over (clamped to the token's own), and with a signal it renews as before. To undo: remove BP_SB_OPTS from the two createClient calls.

## Before centring date and time boxes on iPhone/iPad (2026-11-17)
- Live site (main): `514ef81`
- Changes: portal/shell.css. On iPhone/iPad Safari the value in date and time boxes (e.g. a job's Schedule start and end time) sat at the top of the box. Inside @supports (-webkit-touch-callout: none) (iOS Safari only), those boxes are laid out as inline-flex with align-items:center and the value stretched to the full width (left-aligned as before); select boxes get align-items:center there too. Chrome and desktop Safari are unchanged. A measured sweep of every owner and crew screen, the job sheet's tabs and the common pop-ups, at phone, iPad and desktop sizes, found nothing else off-centre.

## Before the period-switch bubble and a livelier background (2026-11-17)
- Live site (main): `5da5d9c`
- Changes: the dashboard's This month / 6 months / 1 year switch gets the same stretchy gliding pill as the page tabs, sidebar and phone bar (portal/slidetabs.js keeps the pill's position by name across the dashboard redraw; portal/dash.js calls bpSlideTabs after drawing; portal/dash.css). The silk background (site/silk.js) moves about 35% quicker, runs up to 30 frames a second (was 24) within about 22% of one core in its worker (was 15%), so about 21-24 frames a second on a typical computer instead of 14-15, and rests 0.45 s after scrolling, clicking or typing (was 0.7 s). To undo the background: roll 0.0003 back to 0.00022, the spine speeds back, 220 back to 150, fps 30/24 back to 24/20, 450 back to 700.

## Before the crew map (2026-11-18)
- Live site (main): `0584fc3`
- Changes: new Employees → Map tab (portal/crew.js adds the tab; new portal/crewmap.js and portal/crewmap.css, loaded in app.html). A Google-Maps-style map built on the app's keyless map kit (bpEnsureLeaflet, bpTileLayer: OpenFreeMap vector tiles, Esri satellite) with a floating search-and-list panel on a computer and a sheet under the map on a phone. Each person is a pin with their initials at their latest clock-in/out location (mint = on site, blue = clocked in elsewhere, grey = off the clock); active jobs are pins (points from pjPoint) with how many are clocked in there; people at one job line up under its pin. Tap a person for when/where they clocked in, distance from the job, Call, Directions, Open job. Map/Satellite, fit everyone, search, filters, refresh every minute. Reads time_clock (last 14 days) like the existing "On the clock now" list; no new tables or tracking. "Show an example" draws three sample people. Classes use the cmx- prefix (crewapp.css already uses cm-).

## Before a job's map point follows its address (2026-11-18)
- Live site (main): `ecdfe1e`
- Changes: app.html bpJobsSet now calls bpGeoFreshSoon: 2.5 s after a job save, active jobs whose address has no map point or changed since its point was found are looked up again (pjPoint, OpenStreetMap, up to 5, owner only, with a signal). Before, the point only updated when someone opened a map, so crew clock-ins could be checked against an old spot. portal/crewapp.js ignores a point found for a different address (no on-site check rather than a wrong one). Data (not code): a worker login narek7099+worker@ (Test Worker (sample), crew, in the plan299 company) and a job "GPS test (sample)" at 410 Olive Ave, Burbank assigned to it, Nov 18-25.

## Before taking the crew map out for now (2026-11-18)
- Live site (main): `d275820` (crew map live; to bring it back, restore portal/crew.js and the two crewmap tags in app.html from this commit)
- Changes: Employees → Map tab removed (portal/crew.js) and portal/crewmap.js / crewmap.css no longer loaded (app.html); both files stay in the repo marked PARKED for a later update. The clock-in location check and the job map-point fix stay. Data: the "GPS test (sample)" job removed with a tombstone in portal_finance.gone; Test Worker (sample) set inactive and its login (narek7099+worker@) banned (no DELETE used; it can be removed fully from Settings → Team).

## Before live updates and the other two dashboard layouts (2026-11-18)
- Live site (main): `1f7c598`
- Changes: (1) Live updates: new table public.bp_live (one row per company and kind, RLS: bp_owner()), touched by triggers on portal_finance, contacts, calendar_notes, time_clock, time_breaks, employees, inspection_reports, assets, roof_checks, client_settings, and broadcast by Supabase Realtime (migration 20261118000000_live_updates.sql, no DROP). New portal/live.js listens and refreshes only that kind (jobs/money through bpFinPull in app.html, merged job by job) and redraws the open screen quietly, keeping the scroll, waiting while a pop-up is open or a field is being typed in, ignoring this device's own saves, and catching up after the connection drops. portal/offline.js marks this device's last save; portal/motion.js skips the rise-in on these redraws; portal/crewapp.js exposes bpCrewLiveReload. To undo in the app: remove the live.js script tag. (2) Dashboard: Command center and Projects first rebuilt from Overview's cards (same four figures, period switch in the top bar, cards in a grid, Marked jobs in its card); "This week" no longer runs the date into the badge (portal/dash.js, dash.css).
- Also (2026-11-18): payroll_period() now returns rows only to the owner and office logins (migration 20261118000001_payroll_owner_only.sql); a crew login could call it directly and read everyone's pay rate and gross pay. To undo: re-run the function without the bp_role() line.

## Before error reporting (2026-11-18)
- Live site (main): `e46bf6f`
- Changes: new table public.client_errors (RLS on, no policies: only the service role reads it) filled by the RPC bp_report_error() (anon + signed-in, size caps, same error merged into one row with a count, hourly caps on new rows) (migration 20261118000002_client_errors.sql, no DROP). New portal/errors.js (loaded first in the page head) catches crashes and failed promises, strips emails / phone numbers / tokens / ids / query strings, skips noise (extensions, "Script error.", ResizeObserver, network drops), keeps reports while offline and sends them later. New edge function app-errors (admin only, ADMIN_EMAILS) and an "App errors" tab in command.html. To undo in the app: remove the errors.js script tag.

## Before the double-load fix (2026-11-18)
- Live site (main): `d2e6a4a`
- Changes: opening the app no longer fades the dashboard in two or three times. (1) bpNav in app.html: drawing the page that's already open (its data arriving, a live update, a save) no longer shows the spinner, restarts the page fade or jumps to the top; only a real switch of page does. (2) portal/dash.js + dash.css: a redraw of the dashboard while it's showing sets .bp-still on the view for 2.5 s, so charts, cards and numbers appear finished instead of growing in again (also on the phone home); picking another period or layout still plays. Count-ups once per visit, by card. (3) portal/motion.js: the rise and number count-ups play only on a real switch of page, never on a quiet redraw. (4) portal/mobile.css: on phones the page fade and the app-feel fade use the same animation, so every page no longer fades in twice. To undo: revert these files to the SHA above.

## Before the automatic reload after saving (2026-11-18)
- Live site (main): `1acb628`
- Changes: (1) portal/offline.js fires 'bp-saved' after anything the person saves (a table insert/update/delete, a saving RPC, a function call that creates/updates/deletes), sent or queued; never for reads, messages or AI calls. (2) portal/live.js: after a save that followed a tap or key press, once the pop-up is closed and nobody is typing, the open page is drawn again quietly (unless the app already redrew it after the save), and pages whose data lives on the server (contacts, calendar, estimates...) once more 4 s later for a slow server. A save made by a redraw never starts another (no loops). (3) app.html: saving a project redraws the page that's open (bpRedrawView) instead of drawing the Jobs list into Finances or Equipment. To undo: revert portal/live.js and portal/offline.js to the SHA above.

## Before mint everywhere, no red in stats, New leads graph, sidebar letters (2026-11-18)
- Live site (main): `876f81e`
- Changes: (1) Every green in the app, Command Center and website -> the mint family: #16C79A for fills, dots, bars and buttons (white text on a former green button became navy #001530), lighter mint tints for backgrounds, a darker mint #087F61 for small text (4.9:1 on white; new --green-t / --ok-t variables). Kept: Google and QuickBooks logo colors, supplier brand tints (portal/supply.js). (2) Red in stats, chips, badges and charts -> the theme's attention colors: blue chips/dots (#0853B5 text on #EBF4FF, #0970F7 dots; dark mode #4B99FE), navy #001530 for negative figures, navy diverging pole in charts (--bpc-neg*), the calendar "now" line blue, count badges blue. Red stays only for error messages and delete/remove buttons. (3) Dashboard: the New leads card is a bar graph of contacts added per week/month (public.contacts.date_added) with the change vs the period before; falls back to the icon card. (4) Sidebar labels: line box 20px (was 14px with overflow hidden), so g/p/y aren't cut off. Files: app.html, command.html, portal/*.css and *.js (see the commit), site/*.css, site/silk.js, signup.html and the compare pages. To undo: revert the commit.

## Before the AI Team console (2026-11-18)
- Live site (main): `7d84360`
- Changes: portal/aiteam.js only. "Your team" is now a three-panel console in deep navy: a rail with the team by group (Manager, Sales & growth, Jobs & crews, Office), the task board, waiting-for-you and this month's messages; the middle has four count tiles (everyone, working now, with tasks, waiting for you), a search over names and connections, and a table of every assistant (what it's connected to, tasks, status: Ready / Working / Queued / Needs you); the right panel shows the picked assistant with up/down to step through, Overview (a graph of the AI CEO and you on one side, its tools, pages and the web on the other, dots running along the links), Connections and Tasks tabs, ask-prompts, Chat and Give-a-task buttons. Below 1280px the rail becomes chips; below 900px it's one column and the picked assistant opens over the list with a back arrow. The old radial team map is behind "Team map" (A.tab 'map'). Reads only status and tasks. To undo: revert portal/aiteam.js.

## Before the AI Team map, second take (2026-11-18)
- Live site (main): `d1ea030`
- Changes: portal/aiteam.js only. The navy console (it felt like an app inside the app) is replaced by the app's own white cards: the map is the main part. Whole team as a flow (you on the left, the AI CEO in the middle, the ten assistants on the right on curved links with running dots, status on each ring, open tasks on a badge, You shows how many wait for your OK and opens Waiting for you); tap anyone and the map closes in on them (AI CEO and you on one side, their tools / pages / the web on the other), Whole team and previous/next to move around. Beside it the picked assistant (board, ask-prompts, Chat, Task); under it everyone as a list. Counts, groups and a search above dim whoever doesn't match. Dark mode follows the app's. The page no longer leaves the previous page on screen while the team's status loads. To undo: revert portal/aiteam.js to the SHA above.

## Before the full-width AI Team map and the mint New leads line (2026-11-18)
- Live site (main): `f54c354`
- Changes: (1) Dashboard New leads card: a mint line of leads adding up through the period (was thin bars) — portal/dash.js (leadsCard, miniViz mint option), portal/dash.css (.cb-line.mint). (2) AI Team, as the owner marked it: no counts row, no group buttons, no side card; the map takes the full width with the search in its top bar; zoomed in, the bar has Chat with … and Task; the list stays under it — portal/aiteam.js. To undo: revert those files to the SHA above.

## Before page descriptions (2026-11-18)
- Live site (main): `1bfc8c3`
- Changes: portal/shell.js DESC (window.BP_DESC): one plain line per page on what it's for, shown beside the page title on iPad and computers (#bpxVsub, hidden on phones) and as the hover tip on each tab; portal/shell.css shows it. To undo: revert those two files.

## Before simplify batch 1 (2026-11-19)
- Live site (main): `24f75a0`
- Changes (from the clarity audit): Texts gets a New text button (pick a customer, type, send; app.html bpNewTextOpen/bpNewTextSend, sends through ghl-messaging like a reply) and Broadcast becomes "Send to many" (a plain button); New contact no longer texts the person unless the box is ticked; dashboard top buttons "Send invoice" in place of "Order lists" (portal/dash.js); Add job says "For work you won without sending an estimate here"; Finances tabs "Tax years" (was Archive) and "Card payments" (was Payouts); help text says Jobs (was Active Projects); the Stripe button is the app's blue; Driving routes key and pins: Overdue navy, Due soon blue, No crew white ring, On track mint (were all blue; portal/aiceo-map.js); Calculator leads wording (portal/checks.js); AI Team price falls back to 49 (portal/aiteam.js). To undo: revert these files to the SHA above.

## Before simplify batch 2 (2026-11-19)
- Live site (main): `f88e09b`
- Changes: (1) Estimates: one estimate in one place — Drafts lists only estimates not sent yet; sent ones (q.estId) show under "Sent to customers" (portal/quote.js bpQbSheets, app.html #bpxQbSent, bpEstDraw count); the Invoices page no longer repeats estimates waiting for a yes; dashboard "Quotes out" counts estimates sent from BuilderPro (CRM deals when none) and opens Estimates (portal/dash.js quotesOut). (2) Calendar booking: Customer starts on "Pick a customer…", sorted by name, fills their address; the title follows the trade in Settings (bpTradeWords) instead of "Roof Inspection" / "Roofing Job". (3) Jobs page: Your jobs (search, filters, every active job, marked first) right under the numbers; the map folds away under "Map of your jobs and crew", closed by default and remembered (bpPjMapOpen); the Marked photo cards left this page (still on the dashboard). (4) "Behind" is a solid blue badge; pale pink backgrounds left behind blue text are pale blue (app.html, portal/dash.css, notify.css, custportal.css, mobile.css, matlists.js). To undo: revert these files to the SHA above.

## Before simplify batch 3 (2026-11-19)
- Live site (main): `8d20aa6`
- Changes: Automations: one plain sentence per automation on top (portal/automations.js SAY, all 55); the CRM name, settings pills and the step chart fold under "Show the steps" (remembered while the page is open). Employees: "Payroll tax & insurance" instead of burden, columns Reviews / Cost to you (portal/crew.js). Driving routes title (was Smart routing) and its source line without AI CEO jargon (app.html, portal/aiceo-map.js). Order lists: "for jobs not won yet" (portal/matlists.js). Schedule-a-crew note says what a crew is and opens Employees → Crews. To undo: revert these files to the SHA above.

## Before the clean dashboard (2026-11-19)
- Live site (main): `4d70921`
- Changes: Dashboard rebuilt on the look of the dashboard block the owner picked (efferd dashboard-4), in our own code and colours instead of installing React/shadcn. Flat white cards with a hairline border (portal/dash4.css, dashboard only, loaded after glass.css). Overview layout: the four figures, then a wide "Money in" area chart with its own range picker, then "Work won" (value won by month, total top right), the pipeline ring and a "Quick actions" list (New estimate, Add a job, Send an invoice, Book a visit, Send a text); "Money in and out" columns moved down beside "Where the money goes". Delta shown as a coloured arrow and figure, card menus show on hover. Added the missing .hl-c6 column size (used by the other layouts too). To undo: revert portal/dash.js and app.html to the SHA above and remove portal/dash4.css.

## Before the number-only top cards (2026-11-20)
- Live site (main): `8d65efc`
- Changes: The four cards at the top of the dashboard (Projects won, New leads, Active projects, Quotes out) lose their mini graphs and icons; the number is the main point (about 36 to 46px, bold), with the label above and one line under it (portal/dash.js sparkTiles, leadsCard, statCard; portal/dash4.css). To undo: revert portal/dash.js, portal/dash4.css and app.html to the SHA above.

## Before smaller top-card numbers (2026-11-20)
- Live site (main): `97a54ce`
- Changes: The four top dashboard numbers come down from 36 to 46px to 28 to 34px (portal/dash4.css). To undo: revert portal/dash4.css and app.html to the SHA above.

## Before sidebar Employees, Finance tabs, project form (2026-11-20)
- Live site (main): `633e15b`
- Changes: Sidebar gets its own "Employees" branch under Jobs (Employees, Subcontractors; app.html BP_NAV). Finances gets Income and Expenses tabs beside Overview (views finincome / finexpenses, each with four figures and its own list; Expenses adds the category chart and repeating costs); the Income & expenses list left Overview. Leads tabs: Calculators now sits after Calculator leads. Job cost chart tooltip: the bottom line wraps and shows the job title and what was kept (charts.css, dash.js). Opening a project shows the fill-out boxes straight away again, with the customer card on top (projsheet.js/css). To undo: revert app.html, portal/dash.js, portal/charts.css, portal/projsheet.js, portal/projsheet.css, portal/live.js, portal/shell.js to the SHA above.

## Before the flat look everywhere, new calendar, cleaner Leads (2026-11-20)
- Live site (main): `9dafd01`
- Changes: New portal/flat.css (loaded last) carries the dashboard's clean look to every page: white cards with a hairline border instead of blue glass, number tiles with a quiet label over a big figure, flat grey tab rows with the chosen tab on white, solid buttons, plain white top bar; dark mode matches. Calendar: four numbers on top (Today, Next 7 days, the month, Open to-dos; hidden on phones), one clean month grid with lines between days, today in a blue circle, events as tinted chips with a coloured dot (blue inspections, mint jobs, grey notes), past days no longer faded (app.html bpCalStats). Leads: Contacts get stage buttons with counts (All, New leads, Inspection booked, Estimate out, Customers) and a Stage column; Calculator leads drops the repeated title and the My Calculators button. To undo: remove the flat.css link from app.html and revert app.html and portal/checks.js to the SHA above.

## Before cleaner income/expense lists, jobs list, full-width calendar, contact page (2026-11-20)
- Live site (main): `ff84db3`
- Changes: Finances Income and Expenses tabs list one entry a line grouped by month (what, who / date / where it came from, amount; a bin only on entries added by hand). Jobs: the "job steps to check off" banner is gone from the page (steps are checked off on each project's Schedule); job rows are one clean line (street only, status only when it says something, price with what's been paid, crew, Mark done); flat number tiles and filter buttons. Safari's automatic address/phone links are switched off in the app (format-detection meta) so addresses no longer wrap with dotted underlines. Calendar takes the full width: projects with no days and the Google box sit over it only when they apply, To-dos and Upcoming sit under it. Contact page: one plain top card with the person, actions and their numbers in a line; Stage and Added rows left Contact details (address shows if on file); flat tabs on contacts and open projects. To undo: revert app.html, portal/contact.js and portal/flat.css to the SHA above.

## Before the hard hat icon (2026-11-20)
- Live site (main): `9639d10`
- Changes: The Employees item in the sidebar (and the phone menu) uses a new hard hat icon instead of the single-person one (portal/shell.js icon "hardhat", app.html BP_NAV). To undo: revert app.html and portal/shell.js to the SHA above.

## Before the two-column contact page (2026-11-20)
- Live site (main): `aa390bb`
- Changes: The contact (lead) page is two columns: on the left one card with the person (avatar, name, stage, Call / Text / Email, phone, email, address, tags, Edit, Delete); on the right a "Next step" card (one suggestion for their stage with a slim 7-step progress line and one or two buttons), then Jobs and estimates, the calculator estimate and Equipment. The number strip, the big pipeline and the repeated stage rows are gone; tags that repeat the stage are hidden (portal/contact.js, portal/flat.css). To undo: revert portal/contact.js, portal/flat.css and app.html to the SHA above.

## Before the one-column lead page (2026-11-20)
- Live site (main): `5538b5f`
- Changes: The contact (lead) page is one column, in the order a contractor uses it: name, stage and Edit; three big buttons (Call in blue, Text, Email); a "Next step" card with one line and one or two buttons for where they are; Details (phone, email, address with Directions, "Add" when missing); Jobs and estimates; Equipment folded closed; Delete contact at the bottom (portal/contact.js, portal/flat.css). Equipment's "Scan a nameplate" and "Add by hand" buttons are the same size now. To undo: revert portal/contact.js, portal/flat.css and app.html to the SHA above.

## Before the full-width lead page (2026-11-20)
- Live site (main): `b62f745`
- Changes: The contact (lead) page fills the whole width of the page instead of stopping at 820px (portal/flat.css .ctp3). To undo: revert portal/flat.css and app.html to the SHA above.

## Before Calculator leads line and circle charts (2026-11-20)
- Live site (main): `9164424`
- Changes: Calculator leads: the four number tiles lose their icons and use the number-first style (a long top tool wraps). Leads per day is a line chart with a soft fill (whole-number ticks); Which tools bring leads, How urgent and Top ZIP codes are circle charts (top three plus "Other" past four), side by side on wide screens (portal/checks.js, portal/flat.css). To undo: revert portal/checks.js, portal/flat.css and app.html to the SHA above.

## Saved: the classic layout, before the new-layout trial (2026-11-20)
- Live site (main): `37b34f5`  <- the app exactly as it was before the second layout was added (the owner asked to keep this version)
- Changes: A second app layout to compare, after the efferd app-shell-4 block (rebuilt in our code, no React/shadcn): a light sidebar card floating off the edge, a big New button with a square search button, two labelled groups ("Run the business", "Tools") with each section's pages listed under it (no tab row across the top), a small "new" card and Settings / Help at the bottom, and a header with a button to tuck the sidebar away and the page as a breadcrumb (Finances > Income). Off by default; switched from the account menu ("Try the new layout" / "Use the classic layout") or with ?layout=new / ?layout=classic, remembered on the device. Phones keep their own layout. Files: portal/shell.js (s4 mode), new portal/shell4.css, app.html. To undo: revert portal/shell.js and app.html to the SHA above and remove portal/shell4.css.

## Before the phone clean-up (2026-11-20)
- Live site (main): `dd35b0e`
- Changes (phones only): the top bar is solid white and the page-tab row is 52px with the chosen tab inside it (it spilled 8px under the row, so the page looked like it covered the top). Contacts: the "N contacts" count is hidden so New contact fills the row. Jobs: the filter box (All / Behind / No plan / Nobody assigned) is hidden; job cards are compact (name and what's left on one line, job and street under it, a thin mint bar, a status only when planned). Open project: the header is about 40% shorter (no status pill, ring or Next phase; Estimate / Collected / Balance in one row; 44px buttons). Files: portal/flat.css, portal/mobile.js, app.html. To undo: revert those to the SHA above.

## Before the simpler phone home and the More menu fix (2026-11-21)
- Live site (main): `77182a4`
- Changes (phones): Home is simpler: a smaller greeting, one "Customers owe you" card with active jobs and collected under it, one row of three quick buttons (Estimate, Job, Invoice), a one-line setup bar (opens the full list on tap), one "Today" card for what needs you and what's booked (was two cards), and a smaller apps grid (portal/mobile.js home, setupCard; portal/flat.css .mh3). Open project: the More menu moves out of the sideways-scrolling tab row when opened (iPhone Safari clipped it there) and opens as a panel from the bottom on phones (portal/projsheet.js bpPjsMore). Dark mode: the selected bottom-bar tab is dark with white text. To undo: revert portal/mobile.js, portal/projsheet.js, portal/flat.css and app.html to the SHA above.

## Before the one-scroll project sheet on phones (2026-11-21)
- Live site (main): `1a9a46b`
- Changes (phones): an open project scrolls as one page: the header (name, address, money, Call/Text/Mark done) scrolls away, the tab row sticks to the top at full width, the Delete/Cancel/Save bar stays at the bottom; switching tabs jumps to just under the header. Overview drops the phone/email rows (the form under it has them); fields 44px tall. The More panel hangs off the backdrop so it stays put while the sheet scrolls (portal/projsheet.js, portal/flat.css). To undo: revert those and app.html to the SHA above.

## Before the app-style project screen on phones (2026-11-21)
- Live site (main): `66b8708`
- Changes (phones, under 760px): an open project is a full-screen app screen that slides in from the right: a frosted top bar with "‹ Jobs" (goes back, saving anything changed) and Save, the name appearing in the bar once it scrolls up; a large title; money in one rounded group; round action buttons Call / Text / Directions / Done; tabs as plain words with a blue underline, stuck under the bar; the Overview form as grouped label-and-value rows like iPhone Settings; Delete project as a red row at the end; no bottom button bar; swipe from the left edge to go back; light grey page, black in dark mode (portal/projsheet.js appify, portal/flat.css). iPad and computer unchanged. To undo: revert portal/projsheet.js, portal/flat.css and app.html to the SHA above.

## Before the flashlight layers on phones (2026-11-21)
- Live site (main): `becb3fd`
- Changes (phones): light-from-above layering: the page at the back is the darkest (#e3e8ef; near-black in dark mode), cards and groups one step lighter with a bright top edge and soft shadow, buttons and the bars at the top the lightest (CSS variables --fl-0/1/2 in portal/flat.css). Open project: tighter header, smaller action buttons, the customer card is gone (a "Customer profile" row in the first group and the automatic-texts row as its own group instead), shorter notes box (portal/projsheet.js appify). Dark mode: job card bars and tags fixed. To undo: revert portal/flat.css, portal/projsheet.js and app.html to the SHA above.

## Before app-style Money and Schedule tabs on phones (2026-11-21)
- Live site (main): `8864f25`
- Changes (phones, open project): Money: the payment plan as one row per payment (number, title and when it is due, the amount and its tag on the right, "Mark ready to bill" and "Change" as blue words), the repeated Price/Paid/Still owed boxes and the note hidden, Estimate and Paid so far as label-and-value rows (Balance is already in the header), Budget folded into one row until "Set limits" is tapped, expenses as one row each, explanations hidden. Schedule: the progress line without its legend and table, one row per phase with a round tick and "Not yet" as a blue word, "Edit phases and deadlines" as a row, a tighter calendar with round days and blue arrows, Start time and End time as rows, explanations hidden. About 45% less scrolling on Money and 25% on Schedule (portal/projsheet.js appify tags the groups; portal/flat.css). To undo: revert those and app.html to the SHA above.

- 2026-11-21: Before app-style rest of project tabs on phones (Crew, Materials, Photos, Subs, Permits, Contract, Customer, Inspections, Documents, Blueprints). main = fc38ca3

- 2026-11-21: Before the app clean-up batch 1 (new portal/ui.css: iOS tab bar, tab strip fade, even segmented controls and buttons, one empty/error look, dark Automations). main = 8c249d0

- 2026-11-21: Before the app clean-up batch 2 (form fields, one brand blue, Customize prices on phones, flat cards, Finances tab actions, tab strip soft edges). main = 0b0710f

- 2026-11-21: Before the app clean-up batch 3 (Lisa publish bar, contact tabs, dialog buttons, link buttons, Lead sources, Supply search). main = c490246

- 2026-11-21: Before the app clean-up batches 4-5 (Settings back bar, Plan and Team lists, 2-line explanations with more, home header, estimate step fixes, subcontractor tiles). main = 1ba7a81

- 2026-11-21: Before the app clean-up round 6 (iPhone switches, careful 4-line "More", tab strip edges painted on top, card stacks as lists, Save bar above the tab bar, routes and employees fixes). main = 64eed94

- 2026-11-21: Before the AI Team clean-up (phone org chart, solid blue AI CEO, bigger icons, names on a backing, one search box). main = 07d9daf

- 2026-11-21: Before the phone home with two looks (Sections list / Sidebar menu), BuilderPro logo, even header buttons, no money card. main = 43f1c19

- 2026-11-22: Before the phone dashboard with action lists (Needs you, Today, Jobs in progress, New leads to call, Waiting on a yes) and the sidebar as the default phone menu. main = 2f4fca0

- 2026-11-22: Before completion celebrations (portal/celebrate.js: green check card / pill on phase, job, to-do, deal won, sends, crew finish, wages paid) and progress rings on the phone dashboard. main = 52aebe7

- 2026-11-22: Before the immersive homeowner page (photo header with progress ring, photo strip, crew card, full-screen photo viewer, a celebration when a phase finished since last visit). main = 669bb61

- 2026-11-22: Before project screen fixes (clean field rows, mint work ring in the job header on phones, round crew ticks, hide empty Recommended, materials steps on one line). main = 4a3bf3e

- 2026-11-22: Before homeowner portal review fixes (dark mode, Pay tab paid bar and call-to-pay, no Pay button without card payments, PDF labels, decline as a text button). main = c6b939f
- 2026-11-22 before Lisa does tasks + voice (estimate, invoice, contact, job, visit, expense; mic in Ask AI): main was 8a65336
- 2026-11-23 before AI Team model split (daily brief and teammate questions on Haiku 5.5, falls back to Sonnet): main was 09146c7
- 2026-11-23 before removing the AI Team daily brief (morning run now only works open tasks; site and app text updated): main was 307d0cb
- 2026-11-23 before phone app feel (glass top bar, fewer header buttons, taps press in, screens slide in, Jobs tab, swipeable job cards on Home): main was cbe47fc
- 2026-11-23 before compact Employees rows on the phone and menu logo room: main was b0b58c3
- 2026-11-23 before phone app feel round 2 (grouped number cards, round + on Calendar, rows instead of card-in-card on Invoices/Estimates, compact Connect rows on Reputation/Marketing): main was 109a983
- 2026-11-23 before grouped number cards on Subcontractors and Calculator leads: main was c8bf855
- 2026-11-23 before back arrow in the phone top bar on detail pages (contact, equipment, estimate, invoice): main was 5709d47
- 2026-11-24 before Who's going on calendar bookings, logo-only phone top bar, sweep fixes (Lisa publish bar, faint icons, tap sizes): main was 2ff5d55
- 2026-11-24 before tighter 4-choice switches on the phone: main was 494468d
- 2026-11-24 before crew visits (crew_visits table, crew_me returns visits, crew Today shows inspections; migration 20261124000001 adds only): main was d69a8ec
- 2026-11-24 before pull to refresh loads fresh data (jobs, money, contacts) before redrawing: main was ce060fa
- 2026-11-24 before calmer computer background on work pages (swirl stays on Dashboard): main was ba1c115
- 2026-11-24 before one bundled portal stylesheet (portal/app.css from portal/css-bundle.txt, built by site/assemble.py; to undo, restore the 31 link tags in app.html): main was 3aa8cf8
- 2026-11-24 before iPhone readiness (theme color matches the top bar, keyboard hides the tab bar and scrolls the field into view, landscape clear of the notch): main was 6976e21
- 2026-11-24 before Calendar phone fix (Inspections/Jobs buttons no longer cover the Day/Week/Month switch): main was 8150300
- 2026-11-24 before Calendar phone: Inspections/Jobs use one row (Day/Week/Month, Today, round + with Book and Closed days / Schedule a crew): main was f713440
- 2026-11-24 visual pass (slim zero tiles, mint main buttons, phone row buttons, grouped employees): restore to 312fcfe
- 2026-11-24 AI Team assistant picker, shorter phone people rows, dark AI chat readability: restore to 2d05462
- 2026-11-24 slim zero tiles on Lead Sources, Settings brand colour row and header, phone Inbox banner: restore to 4c1c2b4
- 2026-11-24 contact page phone header, dark unpicked tabs readable, shorter Lead Sources empty note: restore to e776dfa
- 2026-11-24 flat mint main buttons, calm setup/status notes: restore to 953064b
- 2026-11-24 plain app background (moving lines off), designed empty pages: restore to c199c73
- 2026-11-24 job Overview: Customer & site boxes fold on computer: restore to 6922aed
- 2026-11-24 receipts slim tiles + empty, calm automations note, chart date labels, phone income/expense single add: restore to ff2544d
- 2026-11-24 equipment empty single set of buttons, reputation no empty chart cards: restore to 34884cf
- 2026-11-24 AI CEO daily briefing paused (cron bp-ai-ceo-daily active=false), its notification toggle hidden, Lisa status wording, hours row width: restore to b6762ec
- 2026-11-24 bell important stripe blue, phone pop-up buttons pinned, sub insurance banner amber: restore to 5231686
- 2026-11-24 Marketing section hidden (BP_MARKETING_ON=false in app.html): restore to dd7d437
- 2026-11-24 AI Team Marketing assistant hidden, website/pricing marketing claims removed: restore to 07cdcc7
- 2026-11-24 ai-team v25: Marketing assistant out of CEO team list and ask/assign tools (OFF set): restore to 9a7ff61
- 2026-11-24 phone app feel: one + for adding (page add buttons into the + sheet), 16px margins, no results counts/sort: restore to 16b9b80
- 2026-11-24 phone app feel round 2: iOS search fields, no Quick add/receipt hero, flat lists in cards, calendar without gridlines, empty-state bold fix: restore to 1bbef90
- 2026-11-24 phone: nothing scrolls sideways (tabs + More sheet, chips to dropdown, dashboard jobs list, AI tabs wrap, automations flow vertical), page switch pinned: restore to 1519e14
- 2026-11-25 iPhone launch screens, white theme colour, shorter phone Finances overview: restore to 6ded0e6
- 2026-11-25 before new store screenshots (dash, jobs, money, calendar, crew, homeowner): restore to 8e6bc7a
- 2026-11-25 before project screen redesign (new portal/pjs.css, old project-sheet rules removed): restore to 9a85339
- 2026-11-25 before phone-only project screen and phone home header (computer restored): restore to cbdf6e4
- 2026-11-25 before phone home cards and tab-edge fix: restore to 4db915b
- 2026-11-25 before white phone home: restore to 57b5197
- 2026-11-25 before brand-new phone home (week strip, round actions, tiles, photo job cards): restore to 4bbbff4
- 2026-11-26 before Calculators/Automations moved to Settings and Lead stats: restore to 342c7a8
- 2026-11-26 before native phone shell (More tab, plain tab bar, system font, large titles, slides): restore to 0820251
- 2026-11-26 before roomier phone top bar, sidebar menu back, aligned home tile numbers: restore to 7428032
- 2026-11-26 before Employees Hours and Crews redesign: restore to ee07f70
- 2026-11-26 before pay stubs: restore to e20f810
- 2026-11-26 before 1099 contractor checks: restore to 0545caa
- 2026-11-26 before Pay by check (signed) and double confirmation on money: restore to 3d43ec6
- 2026-11-26 inspections setup note: restore to 09b0160
- 2026-11-26 phone calendar day screen: restore to 6d4510c
- 2026-11-26 computer calendar day panel: restore to 2e9b075
