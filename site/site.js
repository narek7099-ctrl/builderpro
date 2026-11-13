/* ============================================================================
   ANIMATION LAYER — BuilderPro OS marketing site
   ----------------------------------------------------------------------------
     1. Setup: Lenis + GSAP, and the scroll-lock helper
     2. Preloader
     3. Masked line reveal for headings  <- the signature effect
     4. Hero scroll story (dark wash, the cube driven by scroll, step swaps, ring)
     5. Scroll-highlight text ("ink filling in")
     6. Trades accordion + media cross-fade
     7. How-it-works sticky/scroll pairing
     8. Fast-results timeline
     9. Menu + contact drawer
    10. Nav logo colour flip

   Storytelling motion is SCRUBBED (tied to scroll, ease "none").
   Feedback motion is TWEENED (fixed duration, expressive ease).
   ========================================================================= */
(function () {
  'use strict';
  var HAS_GSAP = typeof gsap !== 'undefined';
  var HAS_ST = HAS_GSAP && typeof ScrollTrigger !== 'undefined';
  var HAS_SPLIT = HAS_GSAP && typeof SplitText !== 'undefined';
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  if (HAS_ST) gsap.registerPlugin(ScrollTrigger);


  /* 1. SETUP --------------------------------------------------------------- */

  /* Lenis is driven by GSAP's ticker, not its own rAF, or it and ScrollTrigger
     disagree about the scroll position by a frame. It stands down while the
     loader, the menu, the drawer, the portal or a modal owns the screen, and
     leaves the portal, the chat, the estimator and the legal pages to scroll
     natively. */
  var lenis = null;
  if (!REDUCED && window.Lenis) {
    try {
      lenis = new Lenis({
        lerp: 0.1,
        prevent: function (node) { return !!(node.closest && node.closest('#bpx, .atlas-inline, .legal-page, .modal, .est-shell, .drawer, .calc, .menu_body, [data-lenis-prevent]')); },
      });
      if (HAS_GSAP) {
        if (HAS_ST) lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
        gsap.ticker.lagSmoothing(0);
      } else {
        (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
      }
    } catch (e) { lenis = null; }
  }

  var lockState = { loader: false, menu: false, drawer: false, calc: false };
  var extLocked = false;
  function updateLock() {
    var locked = lockState.loader || lockState.menu || lockState.drawer || lockState.calc || extLocked;
    /* A stopped Lenis does not scroll, and nothing on screen says so — no
       greyed scrollbar, no overlay, just a page that ignores you. So the
       stop is only ever as long as something is actually covering the
       screen, and the flags are re-read rather than remembered. */
    if (lenis) { locked ? lenis.stop() : lenis.start(); }
    document.body.classList.toggle('is-locked', lockState.loader || lockState.menu || lockState.drawer || lockState.calc);
  }
  /* If every overlay is gone the scroll comes back, whatever any flag thinks.
     This is the one that stops a missed start() from freezing the page for
     the rest of the visit. */
  function releaseIfClear() {
    if (document.querySelector('#bpx.open, .modal-ov.open')) return;
    if (document.body.classList.contains('is-locked')) return;
    if (lenis && lenis.isStopped) lenis.start();
  }
  window.addEventListener('pageshow', releaseIfClear);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) releaseIfClear(); });
  setInterval(releaseIfClear, 2000);
  /* the portal, the plan modal and the legal pages lock the page by setting
     body overflow hidden themselves; watch for that and stand Lenis down */
  new MutationObserver(function () {
    var v = document.body.style.overflow === 'hidden';
    if (v !== extLocked) { extLocked = v; updateLock(); }
  }).observe(document.body, { attributes: true, attributeFilter: ['style'] });

  /* always start at the top: a scroll-driven hero restored mid-scroll looks broken */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('beforeunload', function () { window.scrollTo(0, 0); });

  /* same-page links glide instead of jumping */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
    var id = a.getAttribute('href'); if (!id || id === '#' || id.length < 2) return;
    var el = document.getElementById(id.slice(1)); if (!el) return;
    e.preventDefault();
    closeMenu(); closeDrawer(); closeCalc();
    var nb = document.querySelector('.navbar_bar'), off = nb ? -(nb.getBoundingClientRect().bottom + 6) : -6;
    if (lenis) lenis.scrollTo(el, { offset: off, duration: 1.2 }); else el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
    if (history.pushState) history.pushState(null, '', id);
  });


  /* 2. PRELOADER ----------------------------------------------------------- */
  (function () {
    var pre = $('.dl-pre'); if (!pre) return;
    var seen = false; try { seen = sessionStorage.getItem('bpPre') === '1'; } catch (e) {}
    if (seen || REDUCED) { pre.classList.add('gone'); return; }
    lockState.loader = true; updateLock();
    requestAnimationFrame(function () { pre.classList.add('in'); });
    setTimeout(function () { pre.classList.add('out'); lockState.loader = false; updateLock(); }, 1150);
    setTimeout(function () { pre.classList.add('gone'); try { sessionStorage.setItem('bpPre', '1'); } catch (e) {} }, 2200);
  })();


  /* 3. MASKED LINE REVEAL ---------------------------------------------------
     Every heading is split into lines, each line wrapped in an overflow:hidden
     mask, and the lines slide up from below the mask. yPercent 110, not 100:
     descenders need the extra 10%. After the reveal we add .is-split-active
     to the parent, which grows the section pill (pure CSS). Text first, then
     the pill: that ordering is most of the polish.                          */
  var splitConfig = {
    lines: { duration: 0.8, stagger: 0.08 },
    words: { duration: 0.6, stagger: 0.06 },
    chars: { duration: 0.4, stagger: 0.01 },
  };
  function initHeadingReveal() {
    $$('[data-split="heading"]').forEach(function (heading) {
      var type = heading.dataset.splitReveal || 'lines';
      var delay = parseFloat(heading.dataset.splitDelay) || 0;
      var onLoad = heading.hasAttribute('data-split-load');
      var parent = heading.closest('[data-pill-parent]') || heading.parentElement;
      var activate = function () { setTimeout(function () { parent.classList.add('is-split-active'); }, delay * 1000); };

      if (REDUCED || !HAS_SPLIT || !HAS_ST) { activate(); return; }

      var types = type === 'lines' ? ['lines'] : type === 'words' ? ['lines', 'words'] : ['lines', 'words', 'chars'];
      SplitText.create(heading, {
        type: types.join(', '),
        mask: 'lines',
        autoSplit: true,
        linesClass: 'line',
        wordsClass: 'word',
        charsClass: 'letter',
        /* SplitText labels the element for screen readers, which is only
           allowed on headings; a split paragraph reads fine line by line */
        aria: /^H[1-6]$/.test(heading.tagName) ? 'auto' : 'none',
        onSplit: function (self) {
          var cfg = splitConfig[type];
          var anim = { yPercent: 110, duration: cfg.duration, stagger: cfg.stagger, delay: delay, ease: 'expo.out' };
          if (onLoad) { activate(); return gsap.from(self[type], anim); }
          anim.scrollTrigger = { trigger: heading, start: 'clamp(top 80%)', once: true, onEnter: activate };
          return gsap.from(self[type], anim);
        },
      });
    });
    /* a pill without a split heading beside it still grows when it comes into view */
    $$('[data-pill-parent]').forEach(function (p) {
      if (p.querySelector('[data-split="heading"]')) return;
      if (REDUCED || !HAS_ST) { p.classList.add('is-split-active'); return; }
      ScrollTrigger.create({ trigger: p, start: 'clamp(top 85%)', once: true, onEnter: function () { p.classList.add('is-split-active'); } });
    });
  }


  /* 4. HERO SCROLL STORY ----------------------------------------------------
     ONE sticky stage with invisible trigger blocks below it. As you scroll
     through those blocks: a dark wash fades over the whole stage, the glass
     caption cards fade in, the ring counter draws itself, the captions swap,
     and the cube in the right-hand card is driven through its states.
     The cube is site/hero3d.js: mount(canvas).setProgress(0..1).            */
  var heroApi = null;
  function mountCube() {
    var right = $('.hero_right'), canvas = $('.hero_right canvas');
    if (!right || !canvas || canvas._bpHero || canvas._bpQueued) return;
    if (!('WebGLRenderingContext' in window)) { right.classList.add('nogl'); return; }
    canvas._bpQueued = 1;
    /* after the page has shown (and the browser is idle), so the 3D code never
       holds up the first paint */
    var go = function () {
      import('./hero3d.js?v=20261113-cube4').then(function (m) { heroApi = m.mount(canvas); if (!heroApi) right.classList.add('nogl'); })
        .catch(function () { right.classList.add('nogl'); });
    };
    var later = function () { window.requestIdleCallback ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 300); };
    if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });
  }
  /* The resting hero: clip 1 plays once, then clip 2 takes over as a loop.
     The clips are the hero; the live cube only stands in when they cannot
     play at all. iPad and iPhone Safari ignore preload, so a clip that is
     only waited on never fires canplay and the cube took over after 8s. So
     each clip is asked to play straight away (that is what makes Safari
     fetch it), any sign of a decoded frame counts, and if the clips turn up
     late (slow network, Low Power Mode until the first tap) they still win
     over a cube that is already running. */
  function initHeroObject() {
    var right = $('.hero_right'), intro = $('#videoIntro'), loop = $('#videoLoop');
    if (!right || !intro || !loop) { mountCube(); return; }
    [intro, loop].forEach(function (v) { v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); });
    var shown = false, cube = false, dead = 0, refused = false;
    var show = function (v) {
      if (shown && v.classList.contains('is-on')) return;
      shown = true; right.classList.add('has-video');
      [intro, loop].forEach(function (o) { o.classList.toggle('is-on', o === v); });
    };
    var standIn = function () { if (cube || shown) return; cube = true; mountCube(); };
    var tryPlay = function (v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); return p; };
    /* the intro ends on the loop's first frame: keep it on screen until the loop is
       really playing, then swap (swapping first froze the cube for a moment) */
    var startLoop = function () {
      if (intro.ended && !loop.classList.contains('is-on')) {
        var go = function () { loop.removeEventListener('playing', go); show(loop); };
        loop.addEventListener('playing', go); tryPlay(loop); setTimeout(go, 700);
      } else { show(loop); tryPlay(loop); }
    };
    /* a decoded frame is enough to show a clip, playing or not */
    ['loadeddata', 'canplay', 'playing'].forEach(function (ev) {
      /* the intro always goes first, even if the loop file arrives sooner: a loop that
         is on but still parked on its first frame gives way to an intro that can play */
      intro.addEventListener(ev, function () { if (!refused && !intro.ended && (!loop.classList.contains('is-on') || (loop.paused && loop.currentTime < 0.05))) show(intro); });
      loop.addEventListener(ev, function () { if (!shown && (refused || dead)) show(loop); });
    });
    intro.addEventListener('ended', startLoop);
    var onErr = function () { dead++; if (dead >= 2) { right.classList.remove('has-video'); intro.remove(); loop.remove(); if (!cube) { cube = true; mountCube(); } } else if (this === intro) startLoop(); };
    intro.addEventListener('error', onErr); loop.addEventListener('error', onErr);
    if (intro.error) onErr.call(intro); if (loop.error) onErr.call(loop);
    if (REDUCED) { loop.removeAttribute('loop'); intro.addEventListener('loadeddata', function () { try { intro.currentTime = Math.max(0, (intro.duration || 0) - 0.05); } catch (e) {} }, { once: true }); intro.load(); return; }
    /* ask now: on iOS this is what loads the file */
    var p = tryPlay(intro);
    if (p && p.catch) p.catch(function () { /* autoplay refused (Low Power Mode): rest on the loop's first frame, it plays on the first tap */ refused = true; intro.classList.remove('is-on'); try { loop.load(); } catch (e) {} startLoop(); });
    /* first touch anywhere: Safari allows playback now */
    var kick = function () {
      if (refused || loop.classList.contains('is-on')) tryPlay(loop); else tryPlay(intro);
      ['pointerdown', 'touchstart', 'keydown', 'scroll'].forEach(function (ev) { document.removeEventListener(ev, kick); });
    };
    ['pointerdown', 'touchstart', 'keydown', 'scroll'].forEach(function (ev) { document.addEventListener(ev, kick, { passive: true }); });
    /* nothing at all after a while: let the cube hold the space until the clips arrive */
    setTimeout(standIn, 12000);
  }
  /* The scroll-story clip: its currentTime is driven by scroll. Seeking a
     plain MP4 is slow, so the file is encoded with every frame a keyframe and
     re-fetched as a blob so seeks are local. iOS will not seek until the
     video has been played once from a user gesture.                        */
  function initHeroScrub(triggers) {
    var scrub = $('#videoScrub'); if (!scrub) return;
    scrub.removeAttribute('controls');
    scrub.addEventListener('error', function () { scrub.remove(); }, { once: true });

    /* The clip runs by itself while the story is on screen, rather than
       being seeked a frame at a time. A seek per scroll frame means a
       decode from the nearest keyframe every frame, which stutters and
       forces a fat all-keyframe encode; plain playback is one smooth
       decode. The captions, the ring and the step swaps still follow the
       scroll, so the story is still yours to pace. */
    var want = false;
    function sync() {
      if (want && scrub.paused) { var p = scrub.play(); if (p && p.catch) p.catch(function () {}); }
      else if (!want && !scrub.paused) scrub.pause();
    }
    /* the clip is 2.7 MB and sits below the first screen: fetch it only
       when the story is a couple of screens away, not with the page */
    ScrollTrigger.create({
      trigger: triggers, start: 'top 300%', once: true,
      onEnter: function () { if (scrub.readyState === 0) { scrub.preload = 'auto'; try { scrub.load(); } catch (e) {} } },
    });
    ScrollTrigger.create({
      trigger: triggers, start: 'top bottom', end: 'bottom bottom',
      onToggle: function (self) { want = self.isActive; sync(); },
    });
    /* a browser that will not autoplay muted video starts it on the first
       gesture instead, whichever kind arrives */
    ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, sync, { passive: true });
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden) scrub.pause(); else sync(); });

    gsap.fromTo(scrub, { opacity: 0 }, {
      opacity: 1, ease: 'none',
      scrollTrigger: { trigger: triggers, start: 'top bottom', end: 'top 40%', scrub: true },
    });
  }
  function initHeroStory() {
    var stage = $('.hero_stage');
    if (!stage || window.innerWidth <= 767 || REDUCED || !HAS_ST) return;
    var dark = $('#heroDark'), story = $('#heroStory'), ring = $('#heroRing'), num = $('#heroNum');
    var triggers = $('.hero_triggers');
    var blocks = $$('[data-hero-step]');
    if (!blocks.length) return;

    gsap.fromTo([dark, story], { opacity: 0 }, {
      opacity: 1, ease: 'none',
      scrollTrigger: { trigger: blocks[0], start: 'top bottom', end: 'top 40%', scrub: true },
    });

    if (ring) {
      var r = ring.r.baseVal.value, c = 2 * Math.PI * r;
      ring.style.strokeDasharray = c; ring.style.strokeDashoffset = c;
      gsap.to(ring, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: triggers, start: 'top bottom', end: 'bottom bottom', scrub: true } });
    }

    var setStep = function (i) {
      $$('.hero_step-title, .hero_step-body').forEach(function (el) { el.classList.toggle('is-active', +el.dataset.step === i + 1); });
      if (num) num.textContent = i + 1;
    };
    setStep(0);
    blocks.forEach(function (block, i) {
      ScrollTrigger.create({ trigger: block, start: 'top bottom', end: 'bottom bottom', onToggle: function (self) { if (self.isActive) setStep(i); } });
    });

    initHeroScrub(triggers);
    /* the cube, when it is standing in for the clips, follows the same progress */
    ScrollTrigger.create({
      trigger: triggers, start: 'top bottom', end: 'bottom bottom', scrub: true,
      onUpdate: function (self) { if (heroApi) heroApi.setProgress(self.progress); },
    });
  }


  /* 5. SCROLL-HIGHLIGHT TEXT -------------------------------------------------
     Characters start grey and turn navy as the section scrolls through.
     Scrubbed and linear: it should feel like reading.                      */
  function initHighlightText() {
    if (REDUCED || !HAS_SPLIT || !HAS_ST) return;
    $$('[data-highlight-text]').forEach(function (el) {
      var from = el.dataset.highlightColorFrom || '#BAC0CA';
      var to = el.dataset.highlightColorTo || '#001530';
      var stag = parseFloat(el.dataset.highlightStagger) || 0.1;
      SplitText.create(el, {
        type: 'words, chars', autoSplit: true,
        onSplit: function (self) {
          gsap.set(self.chars, { color: from });
          return gsap.to(self.chars, {
            color: to, stagger: stag, ease: 'linear',
            scrollTrigger: {
              trigger: el.closest('section') || el,
              start: el.dataset.highlightScrollStart || 'top 90%',
              end: el.dataset.highlightScrollEnd || 'center 40%',
              scrub: true,
            },
          });
        },
      });
    });
  }


  /* 6. TRADES -----------------------------------------------------------------
     One open at a time. Height is tweened 0 <-> content height and then
     released to auto. Opening an item cross-fades the photo and stat cards. */
  function initCaseStudies() {
    var items = $$('.cs_item');
    if (!items.length) return;
    var showMedia = function (idx) {
      $$('.cs_photo').forEach(function (p) { p.classList.toggle('is-active', +p.dataset.cs === idx); });
      $$('.cs_stat').forEach(function (s) { s.classList.toggle('is-active', +s.dataset.cs === idx); });
      $$('.cs_stat').forEach(function (s) { $$('.cs_chart span', s).forEach(function (bar) { bar.style.height = s.classList.contains('is-active') ? (bar.dataset.h || 60) + '%' : '0%'; }); });
    };
    var open = function (item) {
      var body = $('.cs_item-body', item);
      item.classList.add('is-active');
      var h = body.firstElementChild.offsetHeight;
      if (!HAS_GSAP || REDUCED) { body.style.height = 'auto'; return; }
      gsap.fromTo(body, { height: 0 }, { height: h, duration: 0.6, ease: 'power2.inOut', onComplete: function () { body.style.height = 'auto'; } });
    };
    var close = function (item) {
      var body = $('.cs_item-body', item);
      item.classList.remove('is-active');
      if (!HAS_GSAP || REDUCED) { body.style.height = 0; return; }
      gsap.to(body, { height: 0, duration: 0.6, ease: 'power2.inOut' });
    };
    items.forEach(function (item) {
      $('.cs_item-head', item).addEventListener('click', function () {
        if (item.classList.contains('is-active')) { close(item); return; }
        items.forEach(function (o) { if (o !== item && o.classList.contains('is-active')) close(o); });
        open(item);
        showMedia(+item.dataset.cs);
        if (HAS_ST) setTimeout(function () { ScrollTrigger.refresh(); }, 650);
      });
    });
    var first = items.filter(function (i) { return i.classList.contains('is-active'); })[0] || items[0];
    first.classList.add('is-active');
    $('.cs_item-body', first).style.height = 'auto';
    showMedia(+first.dataset.cs);
    /* the first item's bars grow when the section arrives, not on load */
    if (HAS_ST && !REDUCED) {
      $$('.cs_chart span').forEach(function (bar) { bar.style.height = '0%'; });
      ScrollTrigger.create({ trigger: '.cs_body', start: 'top 75%', once: true, onEnter: function () { showMedia(+first.dataset.cs); } });
    }
  }


  /* 7. HOW IT WORKS -------------------------------------------------------------
     Each 100vh text block owns one illustration in the sticky column. The
     window is "top center" -> "bottom center" so the swap happens when the
     block is the one you are reading.                                        */
  function initSolutions() {
    var blocks = $$('[data-sol-block]'), imgs = $$('.sol_img');
    if (!blocks.length || !imgs.length) return;
    var activate = function (i) { imgs.forEach(function (img) { img.classList.toggle('is-active', +img.dataset.sol === i); }); };
    activate(0);
    if (window.innerWidth <= 767 || !HAS_ST) return;
    blocks.forEach(function (block, i) {
      ScrollTrigger.create({ trigger: block, start: 'top center', end: 'bottom center', onToggle: function (self) { if (self.isActive) activate(i); } });
    });
  }


  /* 8. FAST-RESULTS TIMELINE -----------------------------------------------------
     The BAR is scrubbed (it reports your scroll position); each DOT POP is a
     fixed tween with bounce.out (it is a thing happening).                    */
  function initTimeline() {
    var wrap = $('#hwwGraph'), bar = $('#hwwBar'), ticks = $$('.hww_tick');
    if (!wrap || !bar || !ticks.length) return;
    var isMobile = window.innerWidth < 768;
    if (REDUCED || !HAS_ST) { bar.style[isMobile ? 'height' : 'width'] = '100%'; ticks.forEach(function (t) { t.classList.add('is-active'); }); return; }
    var from = {}, to = {}; from[isMobile ? 'height' : 'width'] = '0%'; to[isMobile ? 'height' : 'width'] = '100%';
    to.ease = 'none'; to.scrollTrigger = { trigger: wrap, start: 'top 90%', end: 'top 10%', scrub: true };
    gsap.fromTo(bar, from, to);
    ticks.forEach(function (tick) {
      var pulse = $('.hww_pulse', tick);
      ScrollTrigger.create({
        trigger: wrap, start: 'top bottom', end: 'bottom top', scrub: true,
        onUpdate: function () {
          var b = bar.getBoundingClientRect(), d = tick.getBoundingClientRect();
          var barPos = isMobile ? b.bottom : b.right;
          var dotPos = isMobile ? d.top + d.height / 2 : d.left + d.width / 2;
          var passed = barPos >= dotPos;
          if (passed && !tick.classList.contains('is-active')) {
            tick.classList.add('is-active');
            gsap.fromTo(pulse, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'bounce.out', onComplete: function () { gsap.to(pulse, { opacity: 0, duration: 0.3, delay: 0.3 }); } });
          }
          if (!passed && tick.classList.contains('is-active')) { tick.classList.remove('is-active'); gsap.set(pulse, { opacity: 0, scale: 0.7 }); }
        },
      });
    });
  }


  /* 9. MENU + DRAWER ---------------------------------------------------------
     Both are timelines built once, paused, then played/reversed, so the close
     is exactly as smooth as the open. The off-screen position is set here
     with gsap.set, never with a CSS transform.                               */
  var menuTl = null, drawerTl = null;
  var menu = $('#menu'), menuOverlay = $('#menuOverlay'), drawer = $('#drawer'), drawerOverlay = $('#drawerOverlay');
  function openMenu() {
    if (!menu) return;
    menu.classList.add('is-open'); menuOverlay.classList.add('is-open');
    if (menuTl) menuTl.timeScale(1).play(); else menu.style.transform = 'none';
    lockState.menu = true; updateLock();
    $$('.js-open-menu').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
  }
  function closeMenu() {
    if (!menu || !menu.classList.contains('is-open')) return;
    menuOverlay.classList.remove('is-open');
    if (menuTl) { menuTl.timeScale(1.2).reverse(); menuTl.eventCallback('onReverseComplete', function () { menu.classList.remove('is-open'); }); }
    else { menu.style.transform = 'translateX(105%)'; menu.classList.remove('is-open'); }
    lockState.menu = false; updateLock();
    $$('.js-open-menu').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }
  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add('is-open'); drawerOverlay.classList.add('is-open');
    if (drawerTl) drawerTl.timeScale(1).play(); else drawer.style.transform = 'none';
    lockState.drawer = true; updateLock();
    var first = $('input', drawer); if (first) setTimeout(function () { first.focus(); }, 400);
  }
  function closeDrawer() {
    if (!drawer || !drawer.classList.contains('is-open')) return;
    drawerOverlay.classList.remove('is-open');
    if (drawerTl) { drawerTl.timeScale(1).reverse(); drawerTl.eventCallback('onReverseComplete', function () { drawer.classList.remove('is-open'); }); }
    else { drawer.style.transform = 'translateX(100%)'; drawer.classList.remove('is-open'); }
    lockState.drawer = false; updateLock();
  }
  function initPanels() {
    if (menu) {
      if (HAS_GSAP) { gsap.set(menu, { xPercent: 105 }); menuTl = gsap.timeline({ paused: true }).to(menu, { xPercent: 0, duration: 0.5, ease: 'power2.out' }); }
      else menu.style.transform = 'translateX(105%)';
      $$('.js-open-menu').forEach(function (b) { b.addEventListener('click', openMenu); });
      $$('.js-close-menu').forEach(function (b) { b.addEventListener('click', closeMenu); });
    }
    if (drawer) {
      if (HAS_GSAP) { gsap.set(drawer, { xPercent: 100 }); drawerTl = gsap.timeline({ paused: true }).to(drawer, { xPercent: 0, duration: 0.6, ease: 'power1.out' }); }
      else drawer.style.transform = 'translateX(100%)';
      $$('.js-open-drawer').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); closeMenu(); closeCalc(); openDrawer(); }); });
      $$('.js-close-drawer').forEach(function (b) { b.addEventListener('click', closeDrawer); });
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeMenu(); closeDrawer(); closeCalc(); } });
  }
  /* CALCULATORS PANEL. Same open/close as the drawer, wider. One iframe per
     trade + tool, made the first time it is asked for and kept, so a
     half-finished estimate is still there when you come back to it. */
  var calc = $('#calc'), calcOverlay = $('#calcOverlay'), calcTl = null;
  var CALC_TRADES = { roofing: 'Roofing', hvac: 'HVAC', plumbing: 'Plumbing', electrical: 'Electrical', painting: 'Painting',
    landscaping: 'Landscaping', concrete: 'Concrete', general: 'Remodeling', countertops: 'Countertops', pools: 'Pools',
    trim: 'Trim carpentry', flooring: 'Flooring' };
  var CALC_TOOLS = { cost: 'cost calculator', damage: 'damage check', health: 'health check' };
  /* the other trade ids the portal knows, mapped to the calculator that covers them */
  var CALC_ALIAS = { siding: 'roofing', gutters: 'roofing', remodel: 'general', remodeling: 'general', pool: 'pools', countertop: 'countertops' };
  var calcState = { trade: 'roofing', tool: 'cost' };
  function calcSrc(trade, tool) { return 'embed/' + (tool === 'cost' ? '' : tool + '-') + trade + '.html'; }
  function calcRender() {
    var frames = $('#calcFrames'); if (!frames) return;
    var key = calcState.tool + ':' + calcState.trade, cur = null;
    $$('.calc_frame', frames).forEach(function (f) { if (f.dataset.key === key) cur = f; });
    if (!cur) {
      cur = document.createElement('iframe');
      cur.className = 'calc_frame'; cur.dataset.key = key;
      cur.title = CALC_TRADES[calcState.trade] + ' ' + CALC_TOOLS[calcState.tool];
      cur.src = calcSrc(calcState.trade, calcState.tool);
      frames.appendChild(cur);
    }
    $$('.calc_frame', frames).forEach(function (f) { f.classList.toggle('is-on', f === cur); });
    $$('.calc_trade', calc).forEach(function (b) { var on = b.dataset.trade === calcState.trade; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on);
      if (on && b.parentNode.scrollWidth > b.parentNode.clientWidth) b.parentNode.scrollLeft = b.offsetLeft - b.parentNode.offsetLeft - 16; });
    $$('.calc_tool', calc).forEach(function (b) { var on = b.dataset.tool === calcState.tool; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
    var lab = $('#calcLabel'); if (lab) lab.textContent = CALC_TRADES[calcState.trade] + ', ' + CALC_TOOLS[calcState.tool];
  }
  function openCalc(trade, tool) {
    if (!calc) return;
    if (trade) { trade = CALC_ALIAS[trade] || trade; if (CALC_TRADES[trade]) calcState.trade = trade; }
    if (tool && CALC_TOOLS[tool]) calcState.tool = tool;
    closeMenu(); closeDrawer();
    calcRender();
    calc.classList.add('is-open'); calcOverlay.classList.add('is-open');
    if (calcTl) calcTl.timeScale(1).play(); else calc.style.transform = 'none';
    lockState.calc = true; updateLock();
    $$('.js-open-calc').forEach(function (b) { if (b.hasAttribute('aria-expanded')) b.setAttribute('aria-expanded', 'true'); });
  }
  function closeCalc() {
    if (!calc || !calc.classList.contains('is-open')) return;
    calcOverlay.classList.remove('is-open');
    if (calcTl) { calcTl.timeScale(1.15).reverse(); calcTl.eventCallback('onReverseComplete', function () { calc.classList.remove('is-open'); }); }
    else { calc.style.transform = 'translateX(100%)'; calc.classList.remove('is-open'); }
    lockState.calc = false; updateLock();
    $$('.js-open-calc').forEach(function (b) { if (b.hasAttribute('aria-expanded')) b.setAttribute('aria-expanded', 'false'); });
  }
  function initCalc() {
    if (!calc) return;
    if (HAS_GSAP) { gsap.set(calc, { xPercent: 100 }); calcTl = gsap.timeline({ paused: true }).to(calc, { xPercent: 0, duration: 0.6, ease: 'power2.out' }); }
    else calc.style.transform = 'translateX(100%)';
    $$('.js-open-calc').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); openCalc(); }); });
    $$('.js-close-calc').forEach(function (b) { b.addEventListener('click', closeCalc); });
    $$('.calc_trade', calc).forEach(function (b) { b.addEventListener('click', function () { calcState.trade = b.dataset.trade; calcRender(); }); });
    $$('.calc_tool', calc).forEach(function (b) { b.addEventListener('click', function () { calcState.tool = b.dataset.tool; calcRender(); }); });
    /* "Get started" inside the panel swaps it for the drawer */
    $$('.js-open-drawer', calc).forEach(function (b) { b.addEventListener('click', closeCalc); });
    /* arrow keys move along a row of tabs */
    $$('[role="tablist"]', calc).forEach(function (list) {
      list.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        var tabs = $$('[role="tab"]', list), i = tabs.indexOf(document.activeElement); if (i < 0) return;
        e.preventDefault();
        var n = tabs[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        n.focus(); n.click();
      });
    });
    /* a link to #calculators, or ?calc=hvac:health, opens it on load */
    var m = (location.search.match(/[?&]calc=([a-z]+)(?::([a-z]+))?/) || []);
    if (m[1] || location.hash === '#calculators') setTimeout(function () { openCalc(m[1], m[2]); }, 400);
  }
  window.bpCalcOpen = function (trade, tool) { openCalc(trade, tool); };
  window.bpCalcClose = closeCalc;

  window.dlMenu = function (force) { (force === false ? closeMenu : openMenu)(); };
  window.dlCalc = function (trade, tool) { openCalc(trade, tool); };
  window.dlDrawer = function (force) { (force === false ? closeDrawer : openDrawer)(); };

  /* the drawer form is the first step of sign-up (signup.html picks up the
     name, business, phone and email). index.html's old inline version said
     the same but ran first, so this one, loaded later, decided. */
  window.dlContactSend = function (btn) {
    var form = btn.closest('form'), msg = $('.drawer_msg', form);
    var get = function (id) { var el = $('#' + id, form); return el ? el.value.trim() : ''; };
    var name = get('dfName'), biz = get('dfBiz'), phone = get('dfPhone'), email = get('dfEmail'), text = get('dfMsg');
    $$('input,textarea', form).forEach(function (i) { i.classList.remove('is-bad'); });
    var bad = [];
    if (!name) bad.push($('#dfName', form));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad.push($('#dfEmail', form));
    if (bad.length) { bad.forEach(function (i) { i.classList.add('is-bad'); }); msg.textContent = 'Add your name and a valid email to start your trial.'; bad[0].focus(); return; }
    /* the drawer is the first step of sign-up: carry what they typed across */
    if (get('dfWeb')) return;   /* the hidden field only robots fill in */
    var q = new URLSearchParams({ plan: 'os' });
    [['name', name], ['business', biz], ['phone', phone], ['email', email]].forEach(function (x) { if (x[1]) q.set(x[0], x[1]); });
    msg.textContent = 'Opening sign-up\u2026';
    location.href = 'signup.html?' + q.toString();
  };


  /* 10. NAV LOGO FLIP ---------------------------------------------------------
     mix-blend-mode:difference goes muddy over the blue cards, so whenever an
     element tagged [navbar-logo-color-change] crosses a line 32px from the
     top, drop the blend mode and force plain white.                         */
  function initLogoFlip() {
    var logo = $('#logo'), targets = $$('[navbar-logo-color-change]');
    if (!logo || !targets.length) return;
    var LINE = 32, ticking = false;
    var update = function () {
      ticking = false;
      var active = targets.some(function (el) { var r = el.getBoundingClientRect(); return r.top <= LINE && r.bottom >= LINE; });
      logo.classList.toggle('is-white', active);
    };
    var onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    if (lenis) lenis.on('scroll', onScroll);
  }


  /* BOOT ------------------------------------------------------------------- */
  function boot() {
    initHeadingReveal();
    initHeroObject();
    initHeroStory();
    initHighlightText();
    initCaseStudies();
    initSolutions();
    initTimeline();
    initPanels();
    initCalc();
    initLogoFlip();
    $$('.dl-yr').forEach(function (e) { e.textContent = new Date().getFullYear(); });
    /* fonts change line breaks, which moves every mask SplitText created */
    if (HAS_ST) {
      if (document.fonts) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
      window.addEventListener('load', function () { ScrollTrigger.refresh(); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

/* ===========================================================================
   LIGHT RIBBONS (Nov 2026): the page's background. Three bundles of thin
   strands sweep across the screen in blue and mint, twisting slowly like
   silk, with a soft glow and a little floating dust. They drift on their own
   and turn a little as you scroll. Drawn on one fixed canvas behind every
   card (#dlRibbons, z-index -1). 30 frames a second at most, fewer strands
   on phones, paused while the tab is hidden or the app is open over the
   site, and one still frame for people who ask for less motion.
   ========================================================================= */
(function () {
  'use strict';
  if (!document.body || !document.body.classList.contains('dl') || document.getElementById('dlRibbons')) return;
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SMALL = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
  var cv = document.createElement('canvas'); cv.id = 'dlRibbons'; cv.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(cv, document.body.firstChild);
  var ctx = cv.getContext('2d'); if (!ctx) return;
  var W = 0, H = 0, DPR = 1;
  function size() {
    /* the ribbons are soft light, so a low-resolution canvas stretched to the
       screen looks the same and costs a fraction to draw */
    DPR = SMALL ? 0.75 : 0.6;
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  /* each bundle: four control points (fractions of the screen), how far the
     strands fan out, how many strands, and its colours (start → end) */
  var B = [
    { p: [[-0.15, 1.05], [0.25, 0.55], [0.55, 0.95], [1.15, 0.1]], spread: 0.16, n: SMALL ? 14 : 34, c0: [0, 111, 255], c1: [22, 199, 154], sp: 0.00011, ph: 0 },
    { p: [[-0.1, 0.35], [0.35, 0.05], [0.7, 0.75], [1.12, 0.45]], spread: 0.1, n: SMALL ? 10 : 26, c0: [22, 199, 154], c1: [0, 111, 255], sp: 0.00008, ph: 2.1 },
    { p: [[0.15, 1.12], [0.55, 0.7], [0.8, 0.55], [1.1, 0.85]], spread: 0.08, n: SMALL ? 8 : 20, c0: [77, 163, 255], c1: [63, 224, 182], sp: 0.00013, ph: 4.2 }
  ];
  var dust = []; for (var d = 0; d < (SMALL ? 26 : 50); d++) dust.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.4, s: 0.2 + Math.random() * 0.8, a: 0.15 + Math.random() * 0.35 });
  function bez(p, k, o) {
    var a = 1 - k, b0 = a * a * a, b1 = 3 * a * a * k, b2 = 3 * a * k * k, b3 = k * k * k;
    o[0] = b0 * p[0][0] + b1 * p[1][0] + b2 * p[2][0] + b3 * p[3][0];
    o[1] = b0 * p[0][1] + b1 * p[1][1] + b2 * p[2][1] + b3 * p[3][1];
  }
  var pt = [0, 0], pn = [0, 0], S = SMALL ? 26 : 46;
  function bundle(b, t) {
    /* the control points breathe a little, so the sweep is never still */
    var q = b.p.map(function (c, i) { return [(c[0] + Math.sin(t * b.sp * 6 + b.ph + i * 1.7) * 0.04) * W, (c[1] + Math.cos(t * b.sp * 5 + b.ph + i * 1.3) * 0.05) * H]; });
    var g = ctx.createLinearGradient(q[0][0], q[0][1], q[3][0], q[3][1]);
    g.addColorStop(0, 'rgba(' + b.c0 + ',0)'); g.addColorStop(0.25, 'rgba(' + b.c0 + ',1)'); g.addColorStop(0.7, 'rgba(' + b.c1 + ',1)'); g.addColorStop(1, 'rgba(' + b.c1 + ',0)');
    var sp = b.spread * Math.min(W, H) * (SMALL ? 1.4 : 1), ts = t * b.sp;
    /* the glow under the strands */
    ctx.strokeStyle = g; ctx.lineCap = 'round';
    for (var gl = 0; gl < 2; gl++) {
      ctx.globalAlpha = gl ? 0.07 : 0.045; ctx.lineWidth = sp * (gl ? 0.35 : 0.9);
      ctx.beginPath();
      for (var s = 0; s <= S; s++) { bez(q, s / S, pt); s ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]); }
      ctx.stroke();
    }
    ctx.lineWidth = SMALL ? 1 : 1.15;
    for (var i = 0; i < b.n; i++) {
      var u = i / (b.n - 1) - 0.5;
      ctx.globalAlpha = 0.16 + 0.42 * (1 - Math.abs(u) * 2);
      ctx.beginPath();
      for (var s2 = 0; s2 <= S; s2++) {
        var k = s2 / S;
        bez(q, k, pt); bez(q, Math.min(1, k + 0.01), pn);
        var dx = pn[0] - pt[0], dy = pn[1] - pt[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
        var w = sp * Math.pow(Math.sin(Math.PI * k), 0.8) * (1 + 0.35 * Math.sin(k * 6 + ts * 9 + i * 0.12));
        var off = u * w * Math.cos(k * 3.2 + ts * 7 + b.ph);
        var x = pt[0] - dy / L * off, y = pt[1] + dx / L * off;
        s2 ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    var st = (window.scrollY || 0) * 2.2;   /* scrolling turns the ribbons a little */
    for (var i = 0; i < B.length; i++) bundle(B[i], t + st);
    ctx.globalAlpha = 1;
    for (var d2 = 0; d2 < dust.length; d2++) {
      var p = dust[d2], y = ((p.y - t * 0.000006 * p.s - st * 0.00002) % 1 + 1) % 1;
      ctx.fillStyle = 'rgba(0,111,255,' + p.a + ')';
      ctx.beginPath(); ctx.arc(p.x * W, y * H, p.r, 0, 6.283); ctx.fill();
    }
  }
  var last = 0, raf = 0;
  function appOpen() { var a = document.getElementById('bpx'); return !!(a && a.classList.contains('open')); }
  /* at the top of the homepage the hero cards cover almost all of the ribbons, and the
     cube video needs the frames: hold the ribbons still until the visitor scrolls */
  function heroCovers() { var h = document.querySelector('.hero_stage'); return !!h && (window.scrollY || 0) < window.innerHeight * 0.35; }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < (SMALL ? 66 : 50) || document.hidden || appOpen() || heroCovers()) return;   /* 20 a second (15 on phones) is plenty for a slow drift */
    last = now; frame(now);
  }
  size(); frame(performance.now());
  window.addEventListener('resize', function () { size(); frame(performance.now()); }, { passive: true });
  if (!REDUCED) raf = requestAnimationFrame(loop);
  else window.addEventListener('scroll', function () { frame(0); }, { passive: true });
})();
