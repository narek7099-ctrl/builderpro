#!/usr/bin/env python3
"""Build the tool skins, the new look of every calculator and check.

  embed/tool-skin-est.css   the new look for the cost calculators, from
                            tools/skins/est.tpl.css ("P" = a selector strong enough
                            to win over the calculators' own styles)
  embed/tool-skin-est.js    two layout touches CSS can't do (tags under labels)
  embed/tool-skin-ck.css    the same look for the damage and health checks (tools/skins/ck.tpl.css, "Q")
Every tool page links them (tools/build-embeds.py, tools/build-checkers.py).
Run:  python3 tools/tool-skin.py && python3 tools/build-embeds.py
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

print('skins built; now run: python3 tools/build-embeds.py')
