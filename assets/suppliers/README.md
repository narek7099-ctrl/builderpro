# Supplier logos

Drop a logo in here named after the chain id and it appears on the
Suppliers page and on every supplier card, automatically. Nothing is
fetched at runtime — if the file is not here, the tile keeps its
lettermark, so the page is never waiting on artwork.

    assets/suppliers/<id>.png

## What to supply

- **PNG with a transparent background**, about 240px wide, the logo
  trimmed so there is no built-in padding.
- The horizontal lockup where a brand has one; otherwise the square mark.
- Both light and dark mode show it on a near-white tile, so a white
  logo will disappear. Use the dark or full-colour version.

## The ids

Name the file exactly as the id, lowercase.

| id | chain |
|----|-------|
| `abc` | ABC Supply |
| `srs` | SRS Distribution |
| `beacon` | Beacon Building Products |
| `carter` | Carter Lumber |
| `ferguson` | Ferguson |
| `winsupply` | Winsupply |
| `johnstone` | Johnstone Supply |
| `ced` | CED (Consolidated Electrical) |
| `graybar` | Graybar |
| `sherwin` | Sherwin-Williams |
| `benmoore` | Benjamin Moore |
| `siteone` | SiteOne Landscape Supply |
| `whitecap` | White Cap |
| `lw` | L&W Supply |
| `fbm` | Foundation Building Materials |
| `bfs` | Builders FirstSource |
| `e84` | 84 Lumber |
| `fastenal` | Fastenal |
| `homedepot_pro` | Home Depot Pro |
| `lowes_pro` | Lowe's Pro |
| `menards` | Menards |
| `supplyhouse` | SupplyHouse.com |
| `pexuniverse` | PexUniverse |
| `hvacdirect` | HVACDirect |
| `grainger` | Grainger |
| `zoro` | Zoro |
| `amazonbiz` | Amazon Business |
| `northerntool` | Northern Tool |
| `poolcorp` | POOLCORP / SCP Distributors |
| `heritagepool` | Heritage Pool Supply |
| `leslies` | Leslie's Pool Supplies |
| `floordecor` | Floor & Decor |
| `msi` | MSI Surfaces |
| `tileshop` | The Tile Shop |
| `cosentino` | Cosentino |
| `richelieu` | Richelieu Hardware |
| `metrie` | Metrie |

## A note on where they come from

These are other companies' trademarks. Using them to identify that
company — "ABC Supply stocks this, here is how to add them" — is
ordinary nominative use and is what every marketplace does. Take them
from each company's own press or brand page where possible rather than
an image search, since those are the versions they publish for this
purpose and they are the current ones.

## After you add files

Add each id to the list in `portal/supply-dir.js`:

```js
SP.LOGOS = 'abc srs beacon homedepot_pro lowes_pro'.split(' ').filter(Boolean);
```

Only ids in that list are ever requested. With the list empty the page
asks for nothing at all and every tile wears its lettermark, so there are
no 404s and nothing to clean up if some logos never arrive.
