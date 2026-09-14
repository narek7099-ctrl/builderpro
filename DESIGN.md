---
version: 1
name: BuilderPro-OS-design-system
description: >
  The design system for BuilderPro OS — contractor software (roofing first). Two
  surfaces share one language. The marketing site is white and airy with a single
  saturated blue doing all the persuading. The portal is a navy sidebar against a
  cool near-white workspace, built to be read all day on a phone in a truck. Brand
  voltage is restraint: one blue, cool neutrals, generous whitespace, and real
  roofing photography under a navy tint rather than illustration. The portal is
  set in Geist with one icon family (Material Symbols Rounded, weight 300) and
  no emoji; the marketing site still carries Inter as legacy. Surfaces are built
  like machined parts: a hairline edge, a light catch along the top, a shadow
  tinted to the ground. Light and dark are both designed, not one dimmed. The
  lattice-hexagon mark pairs with a bold two-tone wordmark, slate "Builder" +
  blue "Pro".

colors:
  # brand
  primary: "#2b63e6"            # the one accent. buttons, links, active nav, focus
  primary-active: "#1f4fc4"     # hover / pressed, and accent text on light fills
  primary-soft: "#e8effd"       # tinted fills, badges, active row wash
  primary-hi: "#4a83ff"         # top of the primary gradient (buttons, active nav)
  primary-on-dark: "#8fc1ff"    # links & accents on the navy sidebar
  primary-dark-mode: "#5a8bff"  # the accent when the whole app is dark
  primary-dark-mode-text: "#8db0ff" 
  primary-disabled: "#c9d8ff"
  logo-word: "#4a5568"          # "Builder" in the wordmark
  logo-accent: "#3b73b9"        # "Pro" in the wordmark

  # text
  ink: "#0f1a2b"                # headings, primary text (navy-black, never pure)
  ink-2: "#1b2a41"              # secondary headings
  body: "#3c4c63"
  muted: "#5a6b82"              # labels, captions, helper text
  muted-soft: "#8a97a8"         # timestamps, disabled, fine print
  on-primary: "#ffffff"
  on-dark: "#ffffff"
  on-dark-soft: "#b9c5d8"       # sidebar nav items at rest

  # surfaces (cool, never warm — see "Known tension")
  canvas: "#ffffff"             # marketing page ground
  workspace: "#eef1f6"          # portal page ground behind panels
  workspace-deep: "#e6eaf1"     # recessed trays (segmented tabs)
  surface-card: "#ffffff"       # panels, cards, table bodies
  surface-soft: "#f5f7fb"       # inset rows, quiet fills, table heads
  sidebar-top: "#12203a"        # sidebar gradient, top
  sidebar-bottom: "#0c1526"     # sidebar gradient, bottom
  hairline: "#dfe5ee"           # borders, table rules
  hairline-soft: "#e9edf3"      # inner dividers
  edge-light: "rgba(255,255,255,.85)"   # the 1px light catch on top of every surface
  shadow-tint: "15,26,43"       # rgb the ambient shadows are mixed from (navy, not black)

  # dark mode (a second designed palette, not the light one inverted)
  dark-ground: "#0b0f16"
  dark-ground-deep: "#0e131c"   # recessed inputs and trays
  dark-card: "#121826"
  dark-soft: "#171f2e"          # raised tab, ghost button rest
  dark-hairline: "#233043"
  dark-hairline-soft: "#1c2637"
  dark-ink: "#e9eef6"
  dark-muted: "#9fabbd"
  dark-muted-soft: "#6f7d92"
  dark-edge-light: "rgba(255,255,255,.055)"
  dark-sidebar-top: "#0d1220"
  dark-sidebar-bottom: "#090d15" 

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
    fontFamily: "Inter, system-ui, sans-serif"   # marketing site only (legacy)
    fontSize: 56px
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: -1.8px
  display-lg:
    fontFamily: "Inter, system-ui, sans-serif"   # marketing site only (legacy)
    fontSize: 42px
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: -1.2px
  display-md:
    fontFamily: "Inter, system-ui, sans-serif"   # marketing site only (legacy)
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.8px
  page-title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 25px
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: -0.028em
  panel-title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.2px
  stat-value:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 26px
    fontWeight: 800
    lineHeight: 1
    letterSpacing: -0.03em
    fontVariantNumeric: tabular-nums
  body-md:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 13.5px
    fontWeight: 400
    lineHeight: 1.55
  table-cell:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 13.5px
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.45
  label-uppercase:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.07em
    textTransform: uppercase
  button:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1
  nav-link:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
  nav-sublink:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 13.3px
    fontWeight: 500
    lineHeight: 1.4
  wordmark:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 22px
    fontWeight: 700
    letterSpacing: -0.03em
  numeric:
    fontFamily: "Geist, system-ui, sans-serif"
    fontVariantNumeric: tabular-nums
    fontSize: 13.5px
    fontWeight: 600

icons:
  family: "Material Symbols Rounded"
  weight: 300                    # light, precise lines; never the filled or heavy cuts
  fill: 0
  opticalSize: 20
  markup: '<span class="ms">name</span>'
  navSize: 20px
  inlineSize: 1.2em              # inside buttons and labels
  emoji: "never, anywhere in product UI"

rounded:
  xs: 6px
  sm: 8px
  md: 10px          # inputs, row buttons
  button: 11px      # primary and ghost buttons
  lg: 12px          # table wraps, inner cards
  xl: 18px          # panels, stat tiles, map frame
  modal: 20px
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
  ease-standard: "cubic-bezier(.32,.72,0,1)"    # hover, press, tab swaps: mass, then settle
  ease-out-soft: "cubic-bezier(.16,1,.3,1)"      # entrances, step transitions
  view-enter: "420ms ease-out-soft, 10px rise"
  press: "translateY(1px) scale(.99)"            # every button, so a tap lands
  reduced-motion: "honour prefers-reduced-motion — disable slides and spins"

elevation:
  # every surface: light catch on top, then a tinted ambient shadow. The rgb in
  # the shadow is {colors.shadow-tint}, so shadows read as shade, not soot.
  surface: "inset 0 1px 0 {edge-light}, 0 1px 2px rgba(15,26,43,.05), 0 12px 32px -16px rgba(15,26,43,.28)"
  surface-hover: "inset 0 1px 0 {edge-light}, 0 2px 4px rgba(15,26,43,.06), 0 22px 44px -18px rgba(15,26,43,.35)"
  recessed: "inset 0 1px 2px rgba(15,26,43,.06)"                         # inputs, tab trays
  raised-in-tray: "inset 0 1px 0 {edge-light}, 0 1px 3px rgba(15,26,43,.14), 0 4px 10px -6px rgba(15,26,43,.3)"
  button-primary: "inset 0 1px 0 rgba(255,255,255,.28), inset 0 -1px 0 rgba(0,0,0,.12), 0 1px 2px rgba(15,26,43,.12), 0 8px 18px -8px rgba(43,99,230,.45)"
  modal: "inset 0 1px 0 {edge-light}, 0 30px 80px -20px rgba(15,26,43,.55), 0 2px 6px rgba(15,26,43,.1)"
  accent-glow: "0 10px 22px -8px rgba(43,99,230,.45)"                    # under the active nav pill
  focus-ring: "0 0 0 3px rgba(43,99,230,.16)"
  grain: "fixed, pointer-events none, 4% multiply (5% screen in dark)"

components:
  button-primary:
    background: "linear-gradient(180deg, {colors.primary-hi}, {colors.primary})"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: 11px 18px
    shadow: "{elevation.button-primary}"
  button-primary-hover:
    transform: "translateY(-1px)"
    filter: "brightness(1.05)"
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
    shadow: "{elevation.surface}"
  stat-tile:
    backgroundColor: "{colors.surface-card}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.xl}"
    padding: 18px
    label: "{typography.label-uppercase}"
    value: "{typography.stat-value}"
  sidebar:
    background: "linear-gradient(180deg, {colors.sidebar-top}, {colors.sidebar-bottom})"
    sheen: "radial-gradient(120% 60% at 0% 0%, rgba(90,139,255,.18), transparent 60%)"
    width: 244px
    textColor: "#b4c0d3"
    activeBackground: "linear-gradient(180deg, {colors.primary-hi}, {colors.primary})"
    activeShadow: "inset 0 1px 0 rgba(255,255,255,.28), {elevation.accent-glow}"
    activeText: "{colors.on-dark}"
    hoverBackground: "rgba(255,255,255,.07)"
    accordions: "independent; any number open; the open set is remembered per device"
  sidebar-sublink:
    typography: "{typography.nav-sublink}"
    padding: 8px 12px 8px 22px
    activeBackground: "same gradient pill as a top-level item"
  tab-segment:
    tray: "{colors.workspace-deep}, padding 3px, radius 11px, {elevation.recessed}"
    textColor: "{colors.muted}"
    rounded: 8px
    padding: 7px 14px
    activeBackground: "{colors.surface-card}"
    activeText: "{colors.ink}"
    activeShadow: "{elevation.raised-in-tray}"   # the active tab is raised out of the tray, never painted blue
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
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.modal}"
    padding: 24px
    shadow: "{elevation.modal}"
    scrim: "rgba(8,12,20,.5) with 6px blur"
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

The through-line is **restraint with weight**. One accent colour. One typeface.
One icon family. Cool neutrals. Surfaces have a physical edge and a shadow the
colour of the ground, so the app reads as made, not generated. If a screen feels
busy, the fix is removing something, not adding a divider.

## Colors

### Brand & accent

`#2b63e6` is the only accent in the product. It marks the primary action, the
active nav item, links, and focus. When two things on a screen are blue, one of
them is wrong: demote it to a ghost button or plain text. Filled blue is built as
a short vertical gradient (`primary-hi` to `primary`) with a 1px light catch on
top, so it reads as a solid object rather than a flat swatch.

On the navy sidebar, blue text goes illegible, so links and accents there use
`primary-on-dark` `#8fc1ff`. In dark mode the accent lifts to `#5a8bff` so it
keeps its contrast against `dark-card`.

### Surfaces

Marketing sits on white. The portal sits on `workspace` `#eef1f6` with white
panels on it. Every panel is a machined part: a `hairline` edge, `edge-light`
along the top, and an ambient shadow mixed from `shadow-tint` (navy) rather than
black. A fixed 4% grain sits over the whole portal so flat areas have a surface.

The sidebar is a vertical gradient `sidebar-top` to `sidebar-bottom` with a soft
blue sheen in the top-left corner.

### Dark mode

Dark is its own palette, not light with the lights off: `dark-ground` `#0b0f16`,
`dark-card` `#121826`, `dark-hairline` `#233043`, ink `#e9eef6`. The light catch
drops to 5.5% white, shadows go black, inputs recess to `dark-ground-deep`, and
the accent lifts to `#5a8bff`. Both modes ship together; nothing is designed in
one and checked in the other. A third setting, System, follows the device.

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

**Geist in the portal. No serif in product UI.** Inter and the Newsreader serif
remain on the marketing site as legacy and must not spread into the app.
Numbers are tabular everywhere in the portal (`font-variant-numeric`).

## Iconography

One family: **Material Symbols Rounded at weight 300, unfilled, optical size
20.** Rendered as `<span class="ms">name</span>`. Light, precise lines that match
the type's weight. No emoji anywhere in product UI, and no second icon set: a
hand-drawn SVG next to a Symbols glyph is the fastest way to look assembled.
The rating star (★) in review widgets is a typographic glyph, not an emoji, and
stays.

### Hierarchy

Display sizes are for the marketing site only. In the portal, the largest text
is `page-title` at 25px, weight 800, tight tracking. A dashboard does not need
a 56px headline.

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
- Portal: 244px sidebar + fluid main, 28/34px gutters, panels max ~1200px
- Card grids use `repeat(auto-fill, minmax(300px, 1fr))` with 14px gaps —
  they reflow rather than squashing

### Density

The portal is information-dense by necessity, so whitespace does the separating:
18px inside panels, 14px between them, 26px between sections. When a section
gets crowded, split it into tabs rather than shrinking the type.

## Elevation

Every surface is built the same way, in this order: a 1px `hairline` border, a
1px `edge-light` inset along the top (the light catch), then an ambient shadow
mixed from `shadow-tint`. Light comes from above. Nothing casts a black shadow
on a light ground.

Inputs and tab trays are the inverse: recessed, with an inset shadow and no
light catch. The active tab is raised out of the tray with `raised-in-tray`.
Primary buttons carry both a top highlight and a bottom shade so they read as
a solid piece, and press down 1px when tapped.

## Shapes

Panels and stat tiles 18px, modals 20px, buttons 11px, inputs 10px, tabs 8px
inside an 11px tray, pills 999px. The logo tile is 11/40 of its box.

Nothing is square-cornered except table cells and full-bleed photo bands.

## Motion

Motion exists to explain what moved, never to decorate.

- 180ms `ease-standard` for hover, press and colour changes
- 200ms `ease-standard` for panel and tab swaps
- 420ms `ease-out-soft` for a view entering, rising 10px
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

244px, navy gradient with a blue sheen top-left. Five branches: Dashboard,
Projects, Finances, Leads, Marketing. Settings is pinned at the bottom behind a
rule, and Ridge AI lives inside Settings as a tab rather than in the sidebar.

Branches are independent accordions: any number can be open at once, a tap on a
header only touches that branch, and the open set is remembered on the device.
The active item, top-level or sub-page, is the same gradient pill with a light
catch and a soft blue glow. Items at rest are `#b4c0d3`; hover lifts to white
on a 7%-white wash.

### Buttons

Primary is the blue gradient with top highlight, bottom shade and a tinted
glow; ghost is the card colour with a hairline and a light catch; row buttons are
the same at a smaller size. All three lift 1px on hover and press 1px on tap.
One primary per screen region. Destructive actions say **Delete** in red, sit
last in their row, and always confirm by naming what is about to go.

### Panels & stat tiles

White, 1px `hairline` border, 18px radius, 18px padding, `elevation.surface`.
Stat tiles are the same shell with an uppercase label, a 26px tabular value in
weight 800, and a muted note. No coloured top border on tiles.

### Tables

Uppercase 11px headers on `surface-soft`, rows divided by `hairline-soft`, 12/16
padding, numbers right-aligned and tabular. Row hover tints `surface-soft`. Every
list view gets an **Export CSV**.

### Tabs

Segmented: a recessed tray with the active tab raised out of it in the card
colour. Never a solid blue active tab; blue is reserved for the primary action
and the active nav item.

### Empty states

Say what will appear here and give the one button that makes it happen. Never a
bare "No data".

### Honesty states

When something is demo data, a connection is missing, or a lookup failed, say so
plainly in an amber `warning-soft` band with the real reason and the next action.
Never fake a number, and never claim a retry that isn't happening.

## Do's and Don'ts

### Do

- Use one blue, one typeface, one icon family, cool neutrals
- Build every surface the same way: edge, light catch, tinted shadow
- Design both modes at once and look at both before shipping
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
- Don't use emoji in product UI, and don't mix a second icon set in
- Don't paint an active tab blue
- Don't cast a black shadow on a light ground
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
- `≥821px` desktop — full 244px sidebar, sticky main scroll

### Rules

- Minimum 38px tap targets; 44px for anything used on a roof
- 16px side gutter minimum at every width
- Tables and the map scroll horizontally inside their own container; the page
  body never does
- Modals go full-width with 16px margins under 600px
