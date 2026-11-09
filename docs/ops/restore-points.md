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
