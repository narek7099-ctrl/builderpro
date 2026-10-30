"""Bring the 39 marketing pages (CRM software, lead generation, AI receptionist,
missed-call text-back, cost calculators) in line with the homepage:

  - the homepage's nav (tools/mkt_nav.py) in place of the old bar + nav
  - Lisa, not Ridge (her old name)
  - the trial and walkthrough links in place of the old "Book a Free Demo"
    and #booking / #estimator / #atlas spots that no longer exist
  - the trade's live calculator right on the page (#try)

Safe to run again: the nav and calculator sit between markers and are
rebuilt each time.   python3 tools/marketing-pages.py
"""
import glob, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mkt_nav

ROOT = mkt_nav.ROOT
PAGES = sorted(set(sum((glob.glob(os.path.join(ROOT, p)) for p in (
    'ai-receptionist-for-*.html', '*-crm-software.html', '*-lead-generation.html',
    'missed-call-text-back*.html', '*-cost-calculator.html', 'roof-estimator-tool.html')), [])))

# file-name word -> (embed trade, how the trade reads in a sentence)
TRADES = {
    'roof': ('roofing', 'roofing'), 'roofing': ('roofing', 'roofing'), 'roofers': ('roofing', 'roofing'),
    'hvac': ('hvac', 'HVAC'), 'painting': ('painting', 'painting'), 'plumbing': ('plumbing', 'plumbing'),
    'electrical': ('electrical', 'electrical'), 'landscaping': ('landscaping', 'landscaping'),
    'concrete': ('concrete', 'concrete'), 'remodeling': ('general', 'remodeling'),
    'countertop': ('countertops', 'countertop'), 'pool': ('pools', 'pool'), 'trim': ('trim', 'trim carpentry'),
}


def trade_of(name):
    for w in re.split(r'[-.]', name):
        if w in TRADES: return TRADES[w]
    return TRADES['roofing']   # missed-call-text-back.html is the roofing one


def calc_block(trade, word, homeowner):
    if homeowner:
        h2 = 'Your %s price, <em>right here.</em>' % word
        sub = 'Answer a few quick questions and see a real price range in under a minute. Free, and no one calls you unless you ask.'
    else:
        h2 = 'Try the %s calculator, <em>live.</em>' % word
        sub = ('This is the calculator your customers get on your website. They answer a few questions, see a real price range, '
               'and their details land in BuilderPro as a new lead.')
    return f'''<!--mk-try-->
<section class="blk mk-try" id="try">
  <div class="wrap center">
    <span class="ey">Try it</span>
    <h2>{h2}</h2>
    <p class="sub center">{sub}</p>
  </div>
  <div class="wrap">
    <div class="mk-tabs" role="tablist" aria-label="Tools">
      <button type="button" role="tab" aria-selected="true" data-tool="cost">Cost calculator</button>
      <button type="button" role="tab" aria-selected="false" data-tool="damage">Damage check</button>
      <button type="button" role="tab" aria-selected="false" data-tool="health">Health check</button>
    </div>
    <div class="mk-frame" data-trade="{trade}" data-word="{word}"><iframe src="/embed/{trade}.html" title="{word.capitalize()} cost calculator" loading="lazy"></iframe></div>
  </div>
</section>
<!--/mk-try-->'''


TEXT = [
    ('Ridge AI', 'Lisa'),
    (re.compile(r'\bRidge (?=answers|offers|schedules|texts|books|handles|<em>Picks)'), 'Lisa '),
    ('— done for you, live in 3–4 days', '— and you can start today, free for 14 days'),
    (' Book a free demo.', ' Start a free 14-day trial.'),
    # buttons
    (re.compile(r'href="https://builderpro-os\.com/#booking"([^>]*)>Book a Free Demo'), r'href="/signup.html"\1>Start free trial'),
    (re.compile(r'href="https://builderpro-os\.com/#estimator"([^>]*)>(?:See the Estimator|Try the Calculator|Try the [A-Za-z ]+ Estimator|Get My Estimate →)'),
     r'href="#try"\1>Try the calculator'),
]


def fix(path):
    name = os.path.basename(path)
    trade, word = trade_of(name)
    homeowner = name.endswith('-cost-calculator.html') or name == 'roof-estimator-tool.html'
    s = src = open(path, encoding='utf-8').read()

    # nav: the old announcement bar + <nav>, or a nav built on an earlier run
    s = re.sub(r'<!--mk-nav-->.*?<!--/mk-nav-->', '\0NAV', s, flags=re.S)
    s = re.sub(r'<div class="bar">.*?</div>\s*<nav>.*?</nav>', '\0NAV', s, count=1, flags=re.S)
    if '\0NAV' not in s: raise SystemExit('no nav found in ' + name)
    s = s.replace('\0NAV', '<!--mk-nav-->\n' + mkt_nav.nav(trade, True) + '\n<!--/mk-nav-->')
    s = re.sub(r'<!--mk-head-->.*?<!--/mk-head-->\n', '', s)
    s = s.replace('</head>', '<!--mk-head-->' + mkt_nav.head() + '<!--/mk-head-->\n</head>', 1)

    for a, b in TEXT:
        s = a.sub(b, s) if hasattr(a, 'sub') else s.replace(a, b)
    s = s.replace('<a href="https://builderpro-os.com/#booking">Book a Free Demo</a>',
                  '<a href="/#walkthrough">Book a free walkthrough</a>')

    # the live calculator: replaces the made-up "$14,200" box on the cost pages,
    # and sits just before the closing call-to-action everywhere else
    s = re.sub(r'<!--mk-try-->.*?<!--/mk-try-->\s*', '\0TRY', s, count=1, flags=re.S)
    block = calc_block(trade, word, homeowner) + '\n\n'
    est = re.search(r'<section class="blk"[^>]*>\s*<div class="wrap">\s*<div class="estbox">.*?</section>\s*', s, flags=re.S)
    if '\0TRY' in s:
        s = s.replace('\0TRY', block)
    elif est:
        s = s[:est.start()] + block + s[est.end():]
    else:
        i = s.rfind('<section class="blk">', 0, s.find('class="ctaband"'))
        if i < 0: raise SystemExit('no call-to-action band in ' + name)
        s = s[:i] + block + s[i:]

    left = [k for k in ('Ridge', '#booking', '#estimator', '#atlas', 'Book a Free Demo') if k in s]
    if left: print('  still in %s: %s' % (name, ', '.join(left)))
    if s != src: open(path, 'w', encoding='utf-8').write(s)
    return s != src


if __name__ == '__main__':
    n = sum(fix(p) for p in PAGES)
    print('%d pages, %d changed' % (len(PAGES), n))
