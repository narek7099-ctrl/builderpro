"""The homepage's nav, for the marketing and compare pages.

head()     the <link> and <script> tags (versioned by content)
nav(trade, local) the bar and the phone sheet. Tools open that trade's
           calculator, damage check and health check: on the page itself when
           it has the live calculator (local), else on the homepage
"""
import hashlib, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _v(p):
    return hashlib.md5(open(os.path.join(ROOT, p), 'rb').read()).hexdigest()[:8]


def head():
    return ('<link rel="stylesheet" href="/site/mkt-nav.css?v=%s">'
            '<script src="/site/mkt-nav.js?v=%s" defer></script>') % (_v('site/mkt-nav.css'), _v('site/mkt-nav.js'))


CHEV = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3"/></svg>'
LOGO = '<img src="/assets/brand/logo-mark-128.png" alt="" width="26" height="26"><span>Builder<b>Pro</b></span>'


def nav(trade='roofing', local=False):
    t = (lambda k: f'href="#try" data-tool="{k}"') if local else (lambda k: f'href="/?calc={trade}:{k}"')
    return f'''<div class="pnav" role="navigation" aria-label="Primary">
  <div class="pnav_bar">
    <a class="pnav_logo" href="/" aria-label="BuilderPro, home">{LOGO}</a>
    <div class="pnav_links">
      <div class="pnav_dd">
        <button type="button" class="pnav_link" aria-expanded="false" aria-haspopup="true">Product{CHEV}</button>
        <div class="pnav_panel" role="menu">
          <a href="/#simple" role="menuitem"><b>Why BuilderPro</b><small>Built to win the job, then run it</small></a>
          <a href="/#how" role="menuitem"><b>How it works</b><small>From first call to final payment</small></a>
          <a href="/#lisa" role="menuitem"><b>Lisa AI</b><small>Answers every call and text, 24/7</small></a>
          <a href="/#trades" role="menuitem"><b>Every trade</b><small>Roofing, HVAC, remodeling and more</small></a>
          <a href="/compare.html" role="menuitem"><b>Compare</b><small>vs Jobber, Housecall Pro, ServiceTitan</small></a>
        </div>
      </div>
      <div class="pnav_dd">
        <button type="button" class="pnav_link" aria-expanded="false" aria-haspopup="true">Tools{CHEV}</button>
        <div class="pnav_panel" role="menu">
          <a {t("cost")} role="menuitem"><b>Cost calculator</b><small>A real price range in under a minute</small></a>
          <a {t("damage")} role="menuitem"><b>Damage check</b><small>Snap a photo, get a damage report</small></a>
          <a {t("health")} role="menuitem"><b>Health check</b><small>Six taps to a health score</small></a>
        </div>
      </div>
      <a href="/#pricing" class="pnav_link">Pricing</a>
      <a href="/app.html#pros" class="pnav_link">Find a pro</a>
    </div>
    <div class="pnav_ctas">
      <a href="/app.html?portal=1" class="pnav_login">Log in</a>
      <a href="/signup.html" class="pnav_cta">Start free trial</a>
      <button class="pnav_burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="pnavSheet"><span></span><span></span></button>
    </div>
  </div>
  <div class="pnav_progress" aria-hidden="true"><i></i></div>
</div>
<div class="pnav_sheet" id="pnavSheet" aria-label="Site menu" hidden>
  <div class="pnav_sheet_top">
    <span class="pnav_logo">{LOGO}</span>
    <button type="button" class="pnav_close" aria-label="Close menu"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2l12 12M14 2L2 14"/></svg></button>
  </div>
  <div class="pnav_sheet_body">
    <span class="pnav_k">Product</span>
    <a href="/#simple">Why BuilderPro</a>
    <a href="/#how">How it works</a>
    <a href="/#lisa">Lisa AI</a>
    <a href="/#trades">Every trade</a>
    <a href="/#pricing">Pricing</a>
    <a href="/#faq">FAQ</a>
    <span class="pnav_k">Tools</span>
    <div class="pnav_tools">
      <a {t("cost")}><b>Cost calculator</b><small>Price range in a minute</small></a>
      <a {t("damage")}><b>Damage check</b><small>Photo to damage report</small></a>
      <a {t("health")}><b>Health check</b><small>Six taps to a score</small></a>
    </div>
    <a href="/app.html#pros">Find a pro</a>
    <a href="/compare.html">Compare</a>
  </div>
  <div class="pnav_sheet_foot">
    <a href="tel:+13503331230" class="pnav_call">Call Lisa, the live demo<small>(350) 333-1230</small></a>
    <div class="pnav_sheet_row">
      <a href="/app.html?portal=1" class="pnav_login">Log in</a>
      <a href="/signup.html" class="pnav_cta">Start free trial</a>
    </div>
  </div>
</div>
<div class="pnav_sp"></div>'''
