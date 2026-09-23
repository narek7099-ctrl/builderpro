#!/usr/bin/env python3
"""Build the public embed pages for every trade into embed/.

A client embedding an estimator on their own website needs it as a real URL,
with their owner id in the query string so it loads THEIR pricing and files
roof checks under THEIR account. Whatever the source, the output is the same
shape, and this script is the only thing that writes embed/ — nothing in
there should ever be hand-edited.

There are two kinds of source, for a reason:

  * The first seven live in index.html as <iframe srcdoc="..."> on the
    marketing carousel, so those slides render with no extra request. The
    srcdoc IS the source; embed/ is generated from it.

  * The three newest live as whole files in embed-src/ and are loaded by URL
    on the carousel instead. Inlining a 120 KB document twice to save one
    lazy-loaded request is a poor trade, and an escaped copy is miserable to
    edit. New trades should go here.

Either way this patches the pricing loader to honour ?u=<owner uuid> and
appends the theme applier, so a contractor's saved colours, font and logo
reach all ten. Re-run it whenever an estimator changes.

    python3 tools/build-embeds.py
"""
import html, io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'index.html')
OUT = os.path.join(ROOT, 'embed')
INLINE = ['roofing', 'hvac', 'countertops', 'trim', 'painting', 'pools', 'landscaping']
STANDALONE = ['plumbing', 'electrical', 'general']
TRADES = INLINE + STANDALONE
SRC_DIR = os.path.join(ROOT, 'embed-src')

s = io.open(SRC, encoding='utf-8').read()
os.makedirs(OUT, exist_ok=True)

# the loader inside every document fetches pricing with no owner filter; on a
# client's site it must ask for that client's row and tag the config with them
# roofing selects pricing,owner (it files roof checks); the other six select pricing only
LOADER_RE = re.compile(r'fetch\(U\+"/rest/v1/calculator_pricing\?calc_id=eq\."\+CID\+"&select=(pricing(?:,owner)?)",')
LOADER_NEW = ('var OWN="";try{OWN=(new URLSearchParams(location.search).get("u")||"").replace(/[^0-9a-f-]/gi,"");}catch(e){}'
              'if(OWN&&typeof E_CONFIG!=="undefined")E_CONFIG.ownerId=OWN;'
              'fetch(U+"/rest/v1/calculator_pricing?calc_id=eq."+CID+(OWN?"&owner=eq."+OWN:"")+"&select=\\1",')

def source_for(t):
    """The document for a trade, from index.html or from embed-src/."""
    if t in STANDALONE:
        p = os.path.join(SRC_DIR, t + '.html')
        if not os.path.exists(p):
            print('no source file for', t, '-- expected', p); sys.exit(1)
        return io.open(p, encoding='utf-8').read()
    key = '(function(){try{var CID=&quot;' + t + '&quot;'
    if key not in s:
        print('no loader for', t); sys.exit(1)
    k = s.index(key)
    a = s.rfind('srcdoc="', 0, k) + len('srcdoc="')
    b = s.index('"></iframe>', k)
    return html.unescape(s[a:b])


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
    doc = doc.replace('<!doctype html>', '<!doctype html><!-- built by tools/build-embeds.py from index.html; edit the source, not this file -->', 1)
    if '<meta name="viewport"' not in doc:
        doc = re.sub(r'(<head[^>]*>)', r'\1<meta name="viewport" content="width=device-width,initial-scale=1">', doc, count=1)
    # the owner's saved look (colours, font, logo) and live preview from the portal
    applier = io.open(os.path.join(ROOT, 'tools', 'theme-applier.js'), encoding='utf-8').read().replace('__KIND__', 'calc')
    if '</body>' in doc:
        doc = doc.replace('</body>', '<script id="bp-theme-applier">' + applier + '</script></body>', 1)
    else:
        doc += '<script id="bp-theme-applier">' + applier + '</script>'
    io.open(os.path.join(OUT, t + '.html'), 'w', encoding='utf-8').write(doc)
    built.append((t, len(doc)))

for t, n in built:
    print('embed/%s.html  %d bytes' % (t, n))
