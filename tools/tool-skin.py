#!/usr/bin/env python3
"""Build the tool skins and the preview pages.

  embed/tool-skin-est.css   the new look for the cost calculators, from
                            tools/skins/est.tpl.css ("P" = a selector strong enough
                            to win over the calculators' own styles)
  embed/tool-skin-est.js    two layout touches CSS can't do (tags under labels)
  embed/tool-skin-ck.css    the same look for the damage and health checks (tools/skins/ck.tpl.css, "Q")
  embed/roofing-new.html    the roofing calculator with the skin, for preview
  embed/damage-roofing-new.html, embed/health-roofing-new.html   the checks, for preview
Run:  python3 tools/tool-skin.py
"""
import pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
P = 'html body #est-embed#est-embed#est-embed'
tpl = (ROOT / 'tools' / 'skins' / 'est.tpl.css').read_text(encoding='utf-8')
css = re.sub(r'(?<![A-Za-z-])P(?=[ {,.:>])', P, tpl)
(ROOT / 'embed' / 'tool-skin-est.css').write_text(css, encoding='utf-8')
Q = 'html body #est-embed#est-embed.ck'
ck = re.sub(r'(?<![A-Za-z-])Q(?=[ {,.:>])', Q, (ROOT / 'tools' / 'skins' / 'ck.tpl.css').read_text(encoding='utf-8'))
(ROOT / 'embed' / 'tool-skin-ck.css').write_text(ck, encoding='utf-8')

def preview(src, dst, link):
    h = (ROOT / 'embed' / src).read_text(encoding='utf-8')
    h = h.replace('</head>', '<meta name="robots" content="noindex">\n%s\n</head>' % link, 1)
    (ROOT / 'embed' / dst).write_text(h, encoding='utf-8')
preview('roofing.html', 'roofing-new.html', '<link rel="stylesheet" href="tool-skin-est.css?v=2">\n<script src="tool-skin-est.js?v=2" defer></script>')
for t in ('damage', 'health'):
    preview('%s-roofing.html' % t, '%s-roofing-new.html' % t, '<link rel="stylesheet" href="tool-skin-ck.css?v=1">')
print('skin and previews built')
