#!/usr/bin/env python3
"""Build the Health checker and Damage checker pages for every trade.

    embed/health-<trade>.html   ~6 questions -> health score, gauge, next steps, cost
    embed/damage-<trade>.html   1-3 photos -> scan -> 4 questions -> damage report

Sources (edit these, never embed/):
    embed-src/checkers/engine.js     the shared engine (both tools)
    embed-src/checkers/trades.js     per-trade question sets and cost ranges
    embed-src/checkers/checker.css   layout
    embed-src/site-theme.html        the shared site theme (same as the calculators)
    tools/theme-applier.js           the owner's saved look, via ?u=<owner uuid>

Each page is self-contained so it can be embedded on its own by URL, exactly
like the calculators: embed/health-hvac.html?u=<owner uuid>. Leads go to the
same lead webhook the trade's calculator uses (read from embed/<trade>.html,
so run build-embeds.py first) and to roof_checks as calc_id '<tool>:<trade>'.

    python3 tools/build-embeds.py && python3 tools/build-checkers.py
"""
import io, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import og_meta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'embed-src', 'checkers')
OUT = os.path.join(ROOT, 'embed')
TRADES = ['roofing', 'hvac', 'countertops', 'trim', 'painting', 'pools', 'landscaping',
          'plumbing', 'electrical', 'general', 'concrete', 'flooring']

rd = lambda p: io.open(p, encoding='utf-8').read()
engine = rd(os.path.join(SRC, 'engine.js'))
trades = rd(os.path.join(SRC, 'trades.js'))
css = rd(os.path.join(SRC, 'checker.css'))
theme = rd(os.path.join(ROOT, 'embed-src', 'site-theme.html'))
applier = rd(os.path.join(ROOT, 'tools', 'theme-applier.js')).replace('__KIND__', 'calc')

names = dict(re.findall(r"^(\w+):\{name:'([^']+)'", trades, re.M))
for t in TRADES:
    if t not in names:
        print('no question set for', t, 'in trades.js'); sys.exit(1)

def webhook(t):
    p = os.path.join(OUT, t + '.html')
    if not os.path.exists(p):
        return ''
    m = re.search(r'webhookUrl:\s*"([^"]*)"', rd(p))
    return m.group(1) if m else ''

PAGE = '''<!doctype html><!-- built by tools/build-checkers.py from embed-src/checkers/; edit the source, not this file -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>%(title)s</title>%(og)s<meta name="robots" content="noindex">
<style>%(css)s</style></head>
<body><div id="est-embed" class="ck" data-tool="%(tool)s" data-trade="%(trade)s">
<div class="ck-top"><button class="ck-back" id="ck-back" onclick="ckBack()" aria-label="Back" hidden>&#8249;</button><div class="ck-bar"><i id="ck-bar"></i></div><span class="ck-cnt" id="ck-cnt"></span></div>
<div id="ck-stage" aria-live="polite"></div></div>
<script>var CK_TOOL=%(tool_js)s,CK_TRADE=%(trade_js)s,CK_WEBHOOK=%(hook_js)s;
%(trades)s</script>
<script>%(engine)s</script>
<!--ST-BEGIN-->%(theme)s<!--ST-END-->
<script id="bp-theme-applier">%(applier)s</script></body></html>
'''

n = 0
for t in TRADES:
    hook = webhook(t)
    for tool in ('health', 'damage'):
        title = '%s %s Check' % (names[t], 'Health' if tool == 'health' else 'Damage')
        doc = PAGE % dict(title=title, css=css, tool=tool, trade=t, tool_js=json.dumps(tool), trade_js=json.dumps(t),
                          hook_js=json.dumps(hook), og=og_meta.head(tool, t, names[t], '%s-%s.html' % (tool, t)), trades=trades, engine=engine, theme=theme, applier=applier)
        io.open(os.path.join(OUT, '%s-%s.html' % (tool, t)), 'w', encoding='utf-8').write(doc)
        n += 1
    print('%-12s health + damage  (webhook %s)' % (t, 'yes' if hook else 'none'))
print('%d checker pages in embed/' % n)

# Social-preview cards: tags in every embed page (the twelve calculators too,
# patched in place so this can run on its own) and a 1200x630 image per tool.
OG_DIR = os.path.join(OUT, 'og')
imgs = 0
for t in TRADES:
    p = os.path.join(OUT, t + '.html')
    if os.path.exists(p):
        doc = og_meta.inject(rd(p), og_meta.head('quote', t, names[t], t + '.html'))
        io.open(p, 'w', encoding='utf-8').write(doc)
    for tool in ('quote', 'health', 'damage'):
        imgs += og_meta.image(tool, t, names[t], OG_DIR)
print('social tags in %d pages, %s' % (n + len(TRADES), ('%d card images in embed/og/' % imgs) if imgs else 'no Pillow: kept existing embed/og/ images'))
