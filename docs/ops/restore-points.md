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
