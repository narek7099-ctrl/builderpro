---
version: 1
name: BuilderPro-OS-design-system
description: >
  The design system for BuilderPro OS — contractor software (roofing first). Two
  surfaces share one language. The marketing site is white and airy with a single
  saturated blue doing all the persuading. The portal is a navy sidebar against a
  cool near-white workspace, built to be read all day on a phone in a truck. Brand
  voltage is restraint: one blue, cool neutrals, generous whitespace, and real
  roofing photography under a navy tint rather than illustration. Type is Inter
  throughout — no serif anywhere in product UI. The lattice-hexagon mark pairs
  with a bold two-tone wordmark, slate "Builder" + blue "Pro".

colors:
  # brand
  primary: "#2f6bff"            # the one accent. buttons, links, active nav, focus
  primary-active: "#1b56ee"     # hover / pressed
  primary-soft: "#eef3ff"       # tinted fills, badges, active row wash
  primary-on-dark: "#7bc8ff"    # links & accents on the navy sidebar
  primary-disabled: "#c9d8ff"
  logo-word: "#4a5568"          # "Builder" in the wordmark
  logo-accent: "#3b73b9"        # "Pro" in the wordmark

  # text
  ink: "#0c0c0d"                # headings, primary text
  ink-2: "#26262a"              # secondary headings
  body: "#3f4350"
  muted: "#6a6a70"              # labels, captions, helper text
  muted-soft: "#9a9aa0"         # timestamps, disabled, fine print
  on-primary: "#ffffff"
  on-dark: "#ffffff"
  on-dark-soft: "#b9c5d8"       # sidebar nav items at rest

  # surfaces (cool, never warm — see "Known tension")
  canvas: "#ffffff"             # marketing page ground
  workspace: "#f7f9fc"          # portal page ground behind panels
  surface-card: "#ffffff"       # panels, cards, table bodies
  surface-soft: "#f6f8fb"       # inset rows, quiet fills, tab rests
  surface-dark: "#1b2636"       # portal sidebar
  surface-dark-deep: "#0b1220"  # darkest navy, login card, dark-mode ground
  surface-dark-elevated: "#151b26"  # dark-mode cards
  hairline: "#e4e9f0"           # borders, table rules
  hairline-soft: "#f0f2f6"      # inner dividers
  hairline-dark: "#232c3a"      # borders inside navy / dark mode

  # photo treatment
  photo-tint-from: "rgba(18,35,61,0.90)"
  photo-tint-to: "rgba(30,58,99,0.84)"

  # semantic
  success: "#15803d"
  success-soft: "#ecfdf5"
  warning: "#b45309"
  warning-soft: "#fff7ed"
  error: "#b91c1c"
  error-soft: "#fee2e2"
  info: "#1b56ee"
  info-soft: "#eef3ff"
  # lead-score ramp (Lead Radar dots, roof-health rings)
  score-hot: "#e11d48"
  score-warm: "#f59e0b"
  score-cool: "#eab308"
  score-watch: "#3b82f6"

typography:
  display-xl:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 56px
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: -1.8px
  display-lg:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 42px
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: -1.2px
  display-md:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.8px
  page-title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 26px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.5px
  panel-title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.2px
  stat-value:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -0.6px
  body-md:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 13.5px
    fontWeight: 400
    lineHeight: 1.55
  table-cell:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 13.5px
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.45
  label-uppercase:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.07em
    textTransform: uppercase
  button:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1
  nav-link:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
  nav-sublink:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 13.3px
    fontWeight: 500
    lineHeight: 1.4
  wordmark:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 22px
    fontWeight: 700
    letterSpacing: -0.03em
  numeric:
    fontFamily: "Inter, system-ui, sans-serif"
    fontVariantNumeric: tabular-nums
    fontSize: 13.5px
    fontWeight: 600

rounded:
  xs: 6px
  sm: 8px
  md: 10px          # the workhorse — buttons, inputs, rows
  lg: 12px          # cards, modals
  xl: 14px          # panels
  xxl: 16px         # hero cards, map frame
  pill: 999px
  full: 999px

spacing:
  xxs: 4px
  xs: 6px
  sm: 10px
  md: 14px
  lg: 18px
  xl: 26px
  xxl: 40px
  section: 88px

motion:
  instant: 120ms
  fast: 150ms
  base: 200ms
  slow: 320ms
  step: 520ms                                    # step-to-step slide in flows
  ease-standard: "cubic-bezier(.4,0,.2,1)"
  ease-out-soft: "cubic-bezier(.22,1,.28,1)"     # entrances, step transitions
  reduced-motion: "honour prefers-reduced-motion — disable slides and spins"

elevation:
  flat: "none"
  raised: "0 1px 3px rgba(16,24,40,.08)"
  card: "0 4px 14px rgba(16,24,40,.10)"
  float: "0 10px 30px rgba(16,24,40,.08)"
  modal: "0 24px 70px rgba(16,24,40,.22)"
  accent-glow: "0 2px 8px rgba(47,107,255,.28)"
  focus-ring: "0 0 0 3px rgba(47,107,255,.14)"

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 11px 18px
  button-primary-hover:
    backgroundColor: "{colors.primary-active}"
  button-ghost:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.md}"
    padding: 11px 18px
  button-row:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.sm}"
    padding: 5px 10px
    typography: "{typography.caption}"
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  input:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.md}"
    padding: 10px 12px
    focus: "border {colors.primary} + {elevation.focus-ring}"
  panel:
    backgroundColor: "{colors.surface-card}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.xl}"
    padding: 18px
  stat-tile:
    backgroundColor: "{colors.surface-card}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.xl}"
    padding: 18px
    label: "{typography.label-uppercase}"
    value: "{typography.stat-value}"
  sidebar:
    backgroundColor: "{colors.surface-dark}"
    width: 248px
    textColor: "{colors.on-dark-soft}"
    activeBackground: "{colors.primary}"
    activeText: "{colors.on-dark}"
    hoverBackground: "rgba(255,255,255,.08)"
  sidebar-sublink:
    typography: "{typography.nav-sublink}"
    padding: 8px 12px 8px 22px
    activeBackground: "rgba(47,107,255,.22)"
    activeRail: "inset 3px 0 0 {colors.primary-on-dark}"
  tab-pill:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.muted}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.pill}"
    padding: 10px 18px
    activeBackground: "{colors.primary}"
    activeText: "{colors.on-primary}"
  badge:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-active}"
    rounded: "{rounded.pill}"
    padding: 3px 10px
    typography: "{typography.caption}"
  table:
    headerBackground: "{colors.surface-soft}"
    headerTypography: "{typography.label-uppercase}"
    rowBorder: "1px solid {colors.hairline-soft}"
    cellPadding: 12px 16px
    numericAlign: right
  modal:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.lg}"
    padding: 24px
    shadow: "{elevation.modal}"
    maxWidth: 440px
  photo-band:
    background: "linear-gradient(150deg, {colors.photo-tint-from}, {colors.photo-tint-to}), url(<roofing photo>)"
    textColor: "{colors.on-dark}"
    eyebrowColor: "#9cc8ee"
    padding: 36px 26px 40px
---

## Overview

BuilderPro OS is software a roofing contractor opens between jobs, often
one-handed, often in daylight on a phone. Every decision below serves that:
high contrast, big tap targets, numbers that line up, and no ornament that
costs a scroll.

Two surfaces, one language:

- **Marketing site** (`builderpro-os.com`) — white ground, generous air, one blue
  doing all the persuading, roofing photography under a navy tint.
- **Portal** (the app behind sign-in) — navy sidebar, cool near-white workspace,
  white panels. Denser than the marketing site but never cramped.

The through-line is **restraint**. One accent colour. One typeface. Cool
neutrals. If a screen feels busy, the fix is removing something, not adding a
divider.

## Colors

### Brand & accent

`#2f6bff` is the only accent in the product. It marks the primary action, the
active nav item, links, and focus. When two things on a screen are blue, one of
them is wrong — demote it to a ghost button or plain text.

On the navy sidebar, blue text goes illegible, so links and accents there use
`primary-on-dark` `#7bc8ff`.

### Surfaces

Marketing sits on white. The portal sits on `workspace` `#f7f9fc` with white
panels floating on it — that half-step of contrast is what makes panels read as
objects without needing heavy shadows.

The sidebar is `#1b2636`. Dark mode drops the whole app to `#0b1220` with
`#151b26` cards and `#232c3a` borders.

### Text

Four weights of grey and no more: `ink` for headings, `body` for prose, `muted`
for labels and helper text, `muted-soft` for timestamps and fine print. Never
put `muted-soft` on anything a user must read to act.

### Semantic

Each semantic colour has a soft partner for fills (`success` + `success-soft`).
Use the soft fill with the strong text on it; never strong-on-strong.

The score ramp (hot → watch) belongs to lead scoring and roof health. It is not
a general palette — don't use `score-warm` as a warning colour, use `warning`.

### Known tension — read before adding colour

The codebase still carries warm leftovers from an earlier direction:
`--bar:#f4f2ec`, `--line:#e9e8e3`, `--card:#fbfaf7`, `--cream:#f4e7bd`. These
read "newsletter", not "software", and they clash with the cool blue.

**New work must use the cool tokens above.** Treat the warm values as legacy to
be migrated, not as the system. The same goes for `--serif: Newsreader` — it is
still applied to some marketing headings and should not spread.

## Typography

**Inter everywhere. No serif in product UI.** The serif in the codebase is
legacy; new UI uses Inter at every level.

### Hierarchy

Display sizes are for the marketing site only. In the portal, the largest text
is `page-title` at 26px — a dashboard does not need a 56px headline.

- Display 56 / 42 / 32 — marketing heroes and section heads, weight 800, tight
  tracking (negative, scaling with size)
- Page title 26 — portal view headings
- Panel title 15/700 — the heading inside a card
- Stat value 28/700 with tabular numerals
- Body 15 / 13.5
- Label uppercase 11/600 at 0.07em — stat tile labels, table headers
- Caption 12 — helper text

### Rules

- **Tabular numerals on every number that stacks**: money columns, scores,
  counts. Misaligned digits are the fastest way to look amateur.
- Negative letter-spacing on anything 26px or larger; none below.
- Line-height 1.55–1.6 for prose, 1.0–1.2 for display and numbers.
- Never centre a paragraph longer than two lines.
- Sentence case for buttons and nav. Uppercase only for the 11px label style.

## Layout

### Spacing

The scale is 4 / 6 / 10 / 14 / 18 / 26 / 40, section 88. Pick from it; don't
invent 7px.

### Grid

- Marketing max width 1200px, 32px side gutters
- Portal: 248px sidebar + fluid main, 26px gutters, panels max ~1200px
- Card grids use `repeat(auto-fill, minmax(300px, 1fr))` with 14px gaps —
  they reflow rather than squashing

### Density

The portal is information-dense by necessity, so whitespace does the separating:
18px inside panels, 14px between them, 26px between sections. When a section
gets crowded, split it into tabs rather than shrinking the type.

## Elevation

Shadows are soft, blue-grey and low-opacity — never black, never harsh.

`raised` for resting cards, `card` for anything that lifts on hover, `float` for
the map frame and popovers, `modal` for dialogs. The only glow is
`accent-glow` under an active blue pill.

Borders do most of the work; shadow is a hint, not the main event.

## Shapes

Radius 10px is the workhorse. Panels 14px, cards 12px, small controls 8px, pills
999px. The logo tile is 11/40 of its box.

Nothing is square-cornered except table cells and full-bleed photo bands.

## Motion

Motion exists to explain what moved, never to decorate.

- 150ms for hover and colour changes
- 200ms for panel and tab swaps
- 520ms `ease-out-soft` for step-to-step slides in the estimator and roof checker,
  sliding the opposite way on Back so direction carries meaning
- A centred circular spinner for view loads; never a bar at the top
- Honour `prefers-reduced-motion` — disable slides and spins entirely

Never animate something the user is trying to read or tap.

## Photography

Real roofing photos only — crews, decking, underlayment, finished roofs. No
stock illustration, no 3D renders, no icon-people.

Always under the navy tint gradient, so text sits on top at full contrast and
every photo band matches regardless of the source image. Eyebrow text on a photo
band is `#9cc8ee`; headline is white.

## Components

### Sidebar

248px, `#1b2636`. Five branches — Dashboard, Projects, Finances, Leads,
Marketing — with Ridge AI and Settings pinned at the bottom behind a rule.

Branches with children expand in place. The active sub-page gets a translucent
blue wash and a 3px left rail in `primary-on-dark`. Items at rest are
`on-dark-soft`; hover lifts to white on an 8%-white wash.

### Buttons

Primary blue, ghost white-with-border, row buttons small and bordered. One
primary per screen region. Destructive actions are `error` and always confirm.

### Panels & stat tiles

White, 1px `hairline` border, 14px radius, 18px padding. Stat tiles are the same
shell with an uppercase label, a 28px tabular value, and a muted note.

### Tables

Uppercase 11px headers on `surface-soft`, rows divided by `hairline-soft`, 12/16
padding, numbers right-aligned and tabular. Row hover tints `surface-soft`. Every
list view gets an **Export CSV**.

### Tabs

Pill tabs in their own band with real padding — 22px is right when the band sits
between a header and content. Active pill is solid blue with `accent-glow`.

### Empty states

Say what will appear here and give the one button that makes it happen. Never a
bare "No data".

### Honesty states

When something is demo data, a connection is missing, or a lookup failed, say so
plainly in an amber `warning-soft` band with the real reason and the next action.
Never fake a number, and never claim a retry that isn't happening.

## Do's and Don'ts

### Do

- Use one blue, one typeface, cool neutrals
- Right-align and tabular-align every stacked number
- Give tap targets 38px minimum height
- Put an Export CSV on every list
- Tell the truth in empty and error states
- Split crowded sections into tabs
- Keep the sidebar the only navigation — no duplicate in-page tab row for the
  same destinations

### Don't

- Don't add a second accent colour
- Don't use serif in product UI
- Don't introduce warm/cream surfaces (see Known tension)
- Don't use display sizes inside the portal
- Don't auto-advance a form on selection — let the user confirm with Next
- Don't animate anything the user is reading
- Don't stack cards inside cards inside cards
- Don't put unreadable `muted-soft` text on something actionable

## Responsive

### Breakpoints

- `≤600px` phone — estimator and public embeds go single-column
- `≤700px` small tablet — card grids to one column, map 420px tall
- `≤820px` — sidebar collapses to the horizontal mobile bar
- `≥821px` desktop — full sidebar, sticky main scroll

### Rules

- Minimum 38px tap targets; 44px for anything used on a roof
- 16px side gutter minimum at every width
- Tables and the map scroll horizontally inside their own container; the page
  body never does
- Modals go full-width with 16px margins under 600px
