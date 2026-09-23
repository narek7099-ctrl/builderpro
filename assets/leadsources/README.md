# Lead-source logos

`assets/leadsources/<vendor>.png`, named after the vendor id used in
`lead_sources.vendor` and in `portal/lead-senders.js`.

Only the ids listed in `LS_MAIN` (index.html) get a tile of their own on
the Lead Sources page — currently `angi` and `thumbtack`, because those are
the two nearly every residential contractor already buys from. Adding a
file here does not create a tile; add the id to `LS_MAIN` as well.

## What to supply

- **PNG with a transparent background**, 240px wide, trimmed to the ink so
  the tile controls the padding rather than the file.
- The horizontal lockup where a brand has one, otherwise the square mark.
  The two here are deliberately different shapes — Thumbtack's wordmark is
  240×55, Angi's mark is square — and the tile uses a fixed box with
  `object-fit: contain`, so they sit optically level regardless.
- A white background baked into the file will show as a pale slab on the
  dark card. Strip it.

These are third-party trademarks, used to identify the service a
contractor is connecting to. Keep them unmodified apart from trimming and
scaling, and drop one the moment we stop integrating with that platform.
