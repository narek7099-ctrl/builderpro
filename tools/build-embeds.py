#!/usr/bin/env python3
"""Build the public embed pages for every trade into embed/.

A client embedding an estimator on their own website needs it as a real URL,
with their owner id in the query string so it loads THEIR pricing and files
roof checks under THEIR account. Whatever the source, the output is the same
shape, and this script is the only thing that writes embed/ — nothing in
there should ever be hand-edited.

Every estimator's source is a whole file in embed-src/<trade>.html. (The
first seven used to live inside index.html as <iframe srcdoc> copies on a
hidden homepage carousel; they moved out when the homepage and the app were
split, so the homepage no longer carries 1.1 MB of calculators.)

Either way this patches the pricing loader to honour ?u=<owner uuid> and
appends the theme applier, so a contractor's saved colours, font and logo
reach all twelve. Re-run it whenever an estimator changes.

    python3 tools/build-embeds.py
"""
import html, io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'embed')
TRADES = ['roofing', 'hvac', 'countertops', 'trim', 'painting', 'pools', 'landscaping',
          'plumbing', 'electrical', 'general', 'concrete', 'flooring']
SRC_DIR = os.path.join(ROOT, 'embed-src')
os.makedirs(OUT, exist_ok=True)

# the loader inside every document fetches pricing with no owner filter; on a
# client's site it must ask for that client's row and tag the config with them
# roofing selects pricing,owner (it files roof checks); the other six select pricing only
LOADER_RE = re.compile(r'fetch\(U\+"/rest/v1/calculator_pricing\?calc_id=eq\."\+CID\+"&select=(pricing(?:,owner)?)",')
LOADER_NEW = ('var OWN="";try{OWN=(new URLSearchParams(location.search).get("u")||"").replace(/[^0-9a-f-]/gi,"");}catch(e){}'
              'if(OWN&&typeof E_CONFIG!=="undefined")E_CONFIG.ownerId=OWN;'
              'fetch(U+"/rest/v1/calculator_pricing?calc_id=eq."+CID+(OWN?"&owner=eq."+OWN:"")+"&select=\\1",')

def source_for(t):
    """The document for a trade, from embed-src/."""
    p = os.path.join(SRC_DIR, t + '.html')
    if not os.path.exists(p):
        print('no source file for', t, '-- expected', p); sys.exit(1)
    return io.open(p, encoding='utf-8').read()


import hashlib
_v = lambda f: hashlib.md5(io.open(os.path.join(OUT, f), 'rb').read()).hexdigest()[:8]
SKIN = ('<link rel="stylesheet" href="tool-skin-est.css?v=%s"><script src="tool-skin-est.js?v=%s" defer></script>'
        % (_v('tool-skin-est.css'), _v('tool-skin-est.js')))

POWERED = '<a class="bp-pw" href="https://builderpro-os.com/?ref=calculator" target="_blank" rel="noopener">Powered by BuilderPro OS</a><style>.bp-pw{display:block;width:max-content;margin:12px auto 8px;font:500 11px/1.4 -apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;color:#98a2b3;text-decoration:none;letter-spacing:.01em}.bp-pw:hover,.bp-pw:focus-visible{color:#667085;text-decoration:underline}</style>'

built = []
for t in TRADES:
    doc = source_for(t)
    # A standalone source may already carry the owner-aware loader, since it
    # was authored as a whole page rather than unescaped out of a frame.
    # Patching is required only where the bare shape is still present; a
    # source with neither shape has had its loader renamed and must fail
    # loudly rather than ship an embed that loads nobody's pricing.
    if LOADER_RE.search(doc):
        doc = LOADER_RE.sub(LOADER_NEW, doc, count=1)
    elif 'E_CONFIG.ownerId=OWN' not in doc:
        print('loader shape changed for', t); sys.exit(1)
    # a viewport meta and a title, since this is now a whole page rather than a frame
    doc = doc.replace('<!doctype html>', '<!doctype html><!-- built by tools/build-embeds.py from embed-src/; edit the source, not this file -->', 1)
    if '<meta name="viewport"' not in doc:
        doc = re.sub(r'(<head[^>]*>)', r'\1<meta name="viewport" content="width=device-width,initial-scale=1">', doc, count=1)
    # the owner's saved look (colours, font, logo) and live preview from the portal
    applier = io.open(os.path.join(ROOT, 'tools', 'theme-applier.js'), encoding='utf-8').read().replace('__KIND__', 'calc')
    # a small, quiet credit under the tool (outside #est-embed, so it stays when a contractor hides their own brand line)
    if '</body>' in doc:
        doc = doc.replace('</body>', POWERED + '<script id="bp-theme-applier">' + applier + '</script></body>', 1)
    else:
        doc += POWERED + '<script id="bp-theme-applier">' + applier + '</script>'
    # the BuilderPro tool look (tools/tool-skin.py): last in the head so it wins over the page's own styles
    doc = doc.replace('</head>', SKIN + '</head>', 1)
    io.open(os.path.join(OUT, t + '.html'), 'w', encoding='utf-8').write(doc)
    built.append((t, len(doc)))

for t, n in built:
    print('embed/%s.html  %d bytes' % (t, n))

# the per-trade Health and Damage checkers read each calculator's lead webhook
# from the pages just written, so they are rebuilt alongside them
import runpy
runpy.run_path(os.path.join(ROOT, 'tools', 'build-checkers.py'), run_name='__main__')
