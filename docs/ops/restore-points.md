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
