#!/usr/bin/env python3
"""Build the public embed pages from the estimator documents inside index.html.

Each trade's estimator lives in index.html as an <iframe srcdoc="..."> so the
marketing site can show all seven without extra requests. A client embedding
one on their own website needs the same document as a real URL, with their
owner id in the query string so it loads THEIR pricing and files roof checks
under THEIR account.

This script is the single source: it unescapes each srcdoc, patches the loader
to honour ?u=<owner uuid>, and writes embed/<trade>.html. Re-run it whenever the
estimators change so the embeds never drift from the site.

    python3 tools/build-embeds.py
"""
import html, io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'index.html')
OUT = os.path.join(ROOT, 'embed')
TRADES = ['roofing', 'hvac', 'countertops', 'trim', 'painting', 'pools', 'landscaping']

s = io.open(SRC, encoding='utf-8').read()
os.makedirs(OUT, exist_ok=True)

# the loader inside every document fetches pricing with no owner filter; on a
# client's site it must ask for that client's row and tag the config with them
# roofing selects pricing,owner (it files roof checks); the other six select pricing only
LOADER_RE = re.compile(r'fetch\(U\+"/rest/v1/calculator_pricing\?calc_id=eq\."\+CID\+"&select=(pricing(?:,owner)?)",')
LOADER_NEW = ('var OWN="";try{OWN=(new URLSearchParams(location.search).get("u")||"").replace(/[^0-9a-f-]/gi,"");}catch(e){}'
              'if(OWN&&typeof E_CONFIG!=="undefined")E_CONFIG.ownerId=OWN;'
              'fetch(U+"/rest/v1/calculator_pricing?calc_id=eq."+CID+(OWN?"&owner=eq."+OWN:"")+"&select=\\1",')

built = []
for i, t in enumerate(TRADES):
    key = '(function(){try{var CID=&quot;' + t + '&quot;'
    if key not in s:
        print('no loader for', t); sys.exit(1)
    k = s.index(key)
    a = s.rfind('srcdoc="', 0, k) + len('srcdoc="')
    b = s.index('"></iframe>', k)
    doc = html.unescape(s[a:b])
    if not LOADER_RE.search(doc):
        print('loader shape changed for', t); sys.exit(1)
    doc = LOADER_RE.sub(LOADER_NEW, doc, count=1)
    # a viewport meta and a title, since this is now a whole page rather than a frame
    doc = doc.replace('<!doctype html>', '<!doctype html><!-- built by tools/build-embeds.py from index.html; edit the source, not this file -->', 1)
    if '<meta name="viewport"' not in doc:
        doc = re.sub(r'(<head[^>]*>)', r'\1<meta name="viewport" content="width=device-width,initial-scale=1">', doc, count=1)
    io.open(os.path.join(OUT, t + '.html'), 'w', encoding='utf-8').write(doc)
    built.append((t, len(doc)))

for t, n in built:
    print('embed/%s.html  %d bytes' % (t, n))
