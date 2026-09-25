#!/usr/bin/env python3
"""Assemble embed-src/house-scan.html — the map-to-house shot for the nine
calculators other than roofing.

The map, the house model, the camera and the shading are the roof scan's, so
they are taken from embed-src/roof-scan.html rather than copied: this script
lifts that shared block out and drops it into embed-src/house-scan.src.js
where it says /*@@SHARED@@*/. Fix the house or the map in roof-scan.html,
re-run this, and both scans have the fix.

    python3 tools/build-house-scan.py
    python3 tools/inject-house-scan.py && python3 tools/inject-theme.py && python3 tools/build-embeds.py
"""
import io, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
roof = io.open(os.path.join(ROOT, 'embed-src', 'roof-scan.html'), encoding='utf-8').read()
src = io.open(os.path.join(ROOT, 'embed-src', 'house-scan.src.js'), encoding='utf-8').read()

a = roof.find('  /* ── the house model')
b = roof.find("  /* The shot, on the scan's own clock")
if a < 0 or b < 0 or b <= a:
    print('could not find the shared block in roof-scan.html'); sys.exit(1)
shared = roof[a:b]

s0 = roof.index('<style id="rs-style">') + len('<style id="rs-style">')
s1 = roof.index('</style>', s0)
style = '\n'.join(l for l in roof[s0:s1].split('\n') if 'rs-mode' not in l)

extra = r'''
/* while the house scan runs, and after, the trace tools stay out of the way;
   they come back only if the scan finds nothing */
#est-embed .e-addrpanel.hs-mode #e-mapwrap,
#est-embed .e-addrpanel.hs-mode .e-flatrow,
#est-embed .e-addrpanel.hs-mode #e-mresult,
#est-embed .e-addrpanel.hs-mode #e-slopecard,
#est-embed .e-addrpanel.hs-mode #e-manualbtn,
#est-embed .e-addrpanel.hs-mode #e-sldwrap,
#est-embed .e-addrpanel.hs-done #e-mapwrap,
#est-embed .e-addrpanel.hs-done .e-flatrow,
#est-embed .e-addrpanel.hs-done #e-mresult,
#est-embed .e-addrpanel.hs-done #e-slopecard,
#est-embed .e-addrpanel.hs-done #e-manualbtn{display:none !important;}
#est-embed .rs-grid.hs-grid3{grid-template-columns:repeat(3,1fr);}#est-embed .rs-grid.hs-grid2{grid-template-columns:1fr 1fr;}#est-embed .rs-grid.hs-grid1{grid-template-columns:1fr;}
@media(max-width:560px){#est-embed .rs-grid.hs-grid3{grid-template-columns:1fr 1fr;}}
/* the questions pool and landscaping ask before the shot */
#est-embed .hs-q{display:none;padding:22px 22px 24px;}
#est-embed .hs-q.on{display:flex;flex-direction:column;gap:18px;}
#est-embed .hs-qrow{display:flex;flex-direction:column;gap:10px;}
#est-embed .hs-qt{font-size:12px;font-weight:600;text-transform:uppercase;color:var(--rs-grey);}
#est-embed .hs-qo{display:flex;flex-wrap:wrap;gap:6px;}
#est-embed .hs-chip{appearance:none;border:1px solid rgba(0,0,0,.10);background:#fff;color:var(--rs-ink);border-radius:40px;padding:11px 16px;font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:background-color .3s ease,color .3s ease,border-color .3s ease;}
#est-embed .hs-chip:hover{background:#edf2f6;border-color:#edf2f6;}
#est-embed .hs-chip.on{background:var(--rs-ink);border-color:var(--rs-ink);color:#fff;}
#est-embed .hs-chip:focus-visible,#est-embed .hs-go:focus-visible{outline:3px solid var(--rs-blue);outline-offset:3px;}
#est-embed .hs-go{appearance:none;align-self:flex-start;border:1px solid var(--rs-ink);background:var(--rs-ink);color:#fff;border-radius:40px;padding:15px 22px;font:inherit;font-size:12px;font-weight:600;text-transform:uppercase;cursor:pointer;transition:background-color .3s ease,border-color .3s ease;}
#est-embed .hs-go:hover{background:var(--rs-blue);border-color:var(--rs-blue);}
'''

header = ('<!-- HOUSE SCAN — built by tools/build-house-scan.py from embed-src/house-scan.src.js\n'
          '     and the shared map/house block of embed-src/roof-scan.html. Edit those, not this. -->\n')
out = (header + '<style id="hs-style">' + style + extra + '</style>\n'
       + '<script id="hs-script">\n' + src.replace('/*@@SHARED@@*/', shared) + '</script>\n')
io.open(os.path.join(ROOT, 'embed-src', 'house-scan.html'), 'w', encoding='utf-8').write(out)
print('embed-src/house-scan.html  %d bytes (shared block %d bytes)' % (len(out), len(shared)))
