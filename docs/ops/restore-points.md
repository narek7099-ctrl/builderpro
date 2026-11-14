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
