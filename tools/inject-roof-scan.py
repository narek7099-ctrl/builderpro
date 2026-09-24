#!/usr/bin/env python3
"""Put the roofing estimator's add-ons into its source.

  embed-src/roof-scan.html   the satellite roof scan
  embed-src/site-theme.html  the marketing site's design system, applied last

The roofing estimator's source is the <iframe srcdoc="..."> on the marketing
carousel in index.html (see tools/build-embeds.py), so the scan goes in there,
escaped for the attribute, between markers. Re-running replaces the block
rather than adding a second one.

    python3 tools/inject-roof-scan.py && python3 tools/build-embeds.py
"""
import io, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'index.html')
BLOCKS = [('roof-scan.html', '<!--RS-BEGIN-->', '<!--RS-END-->'),
          ('site-theme.html', '<!--ST-BEGIN-->', '<!--ST-END-->')]

s = io.open(SRC, encoding='utf-8').read()

key = '(function(){try{var CID=&quot;roofing&quot;'
if key not in s:
    print('roofing estimator not found in index.html'); sys.exit(1)

for name, BEGIN, END in BLOCKS:
    snip = io.open(os.path.join(ROOT, 'embed-src', name), encoding='utf-8').read()
    # inside a double-quoted attribute only & and " need escaping; the existing
    # srcdoc documents leave < and > as they are, and so does this
    esc = (BEGIN + snip + END).replace('&', '&amp;').replace('"', '&quot;')
    k = s.index(key)
    a = s.rfind('srcdoc="', 0, k) + len('srcdoc="')
    b = s.index('"></iframe>', k)
    doc = s[a:b]
    if BEGIN in doc:
        i = doc.index(BEGIN); j = doc.index(END) + len(END)
        doc = doc[:i] + esc + doc[j:]; how = 'replaced'
    elif '</body>' in doc:
        i = doc.rindex('</body>'); doc = doc[:i] + esc + doc[i:]; how = 'inserted'
    else:
        doc = doc + esc; how = 'appended'
    s = s[:a] + doc + s[b:]
    print('%s %s in the roofing estimator (%d bytes)' % (name, how, len(snip)))

io.open(SRC, 'w', encoding='utf-8').write(s)
