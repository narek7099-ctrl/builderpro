#!/usr/bin/env python3
"""Put embed-src/roof-scan.html into the roofing estimator.

The roofing estimator's source is the <iframe srcdoc="..."> on the marketing
carousel in index.html (see tools/build-embeds.py), so the scan goes in there,
escaped for the attribute, between markers. Re-running replaces the block
rather than adding a second one.

    python3 tools/inject-roof-scan.py && python3 tools/build-embeds.py
"""
import io, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'index.html')
SNIP = os.path.join(ROOT, 'embed-src', 'roof-scan.html')
BEGIN, END = '<!--RS-BEGIN-->', '<!--RS-END-->'

s = io.open(SRC, encoding='utf-8').read()
snip = io.open(SNIP, encoding='utf-8').read()

# inside a double-quoted attribute only & and " need escaping; the existing
# srcdoc documents leave < and > as they are, and so does this
esc = (BEGIN + snip + END).replace('&', '&amp;').replace('"', '&quot;')

key = '(function(){try{var CID=&quot;roofing&quot;'
if key not in s:
    print('roofing estimator not found in index.html'); sys.exit(1)
k = s.index(key)
a = s.rfind('srcdoc="', 0, k) + len('srcdoc="')
b = s.index('"></iframe>', k)
doc = s[a:b]

if BEGIN in doc:
    i = doc.index(BEGIN); j = doc.index(END) + len(END)
    doc = doc[:i] + esc + doc[j:]
    how = 'replaced'
elif '</body>' in doc:
    i = doc.rindex('</body>')
    doc = doc[:i] + esc + doc[i:]
    how = 'inserted'
else:
    doc = doc + esc
    how = 'appended'

s = s[:a] + doc + s[b:]
io.open(SRC, 'w', encoding='utf-8').write(s)
print('roof scan %s in the roofing estimator (%d bytes)' % (how, len(snip)))
