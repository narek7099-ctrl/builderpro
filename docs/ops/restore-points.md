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
