/* Task: Scrolled top bar — proportions + transition (see topbar.css).
   React mounts the cream bar when you scroll down and removes it when you scroll up.
   This script:
     1. tags the bar (.s8-bar) and plays the enter animation,
     2. copies the header's location + Login buttons into the bar's empty right spacer
        (clicks are forwarded to the real buttons),
     3. when React removes the bar, puts a non-interactive copy back for the exit animation. */
(() => {
  const MENU = '[aria-label="Open menu"]';

  const isBar = (n) =>
    n && n.nodeType === 1 && n.classList.contains("fixed") && n.querySelector(MENU);

  function headerActions() {
    const header = document.querySelector("header");
    if (!header) return null;
    // The header has two location+Login pairs: a hidden mobile one (compact, gap 8) and the
    // visible desktop one (gap 12). Copy the visible one so the copy lands on the same pixels.
    const locs = [...header.querySelectorAll('button[aria-label="Set location"]')];
    const loc = locs.find((b) => b.getBoundingClientRect().width > 0) || locs[locs.length - 1];
    return loc ? loc.parentElement : null;
  }

  function addActions(bar) {
    const row = bar.firstElementChild;
    const spacer = row && row.lastElementChild;
    const group = headerActions();
    if (!spacer || !group || spacer.querySelector(".s8-bar-actions")) return;

    const wrap = document.createElement("div");
    wrap.className = "s8-bar-actions";
    for (const original of group.children) {
      if (original.tagName !== "BUTTON" && original.tagName !== "A") continue;
      const copy = original.cloneNode(true);
      copy.removeAttribute("id");
      copy.addEventListener("click", (e) => {
        e.preventDefault();
        original.click();
      });
      wrap.appendChild(copy);
    }
    spacer.removeAttribute("aria-hidden");
    spacer.appendChild(wrap);
  }

  function enter(bar) {
    if (bar.classList.contains("s8-bar-leave")) return; // our own exit ghost
    bar.classList.add("s8-bar", "s8-bar-enter");
    addActions(bar);
    bar.addEventListener("animationend", (e) => {
      if (e.target === bar) bar.classList.remove("s8-bar-enter");
    });
  }

  function leave(bar, parent, next) {
    if (bar.classList.contains("s8-bar-leave") || !parent) return;
    bar.classList.remove("s8-bar-enter");
    bar.classList.add("s8-bar", "s8-bar-leave");
    bar.setAttribute("aria-hidden", "true");
    bar.inert = true;
    parent.insertBefore(bar, next && next.parentNode === parent ? next : null);
    const done = () => bar.remove();
    bar.addEventListener("animationend", (e) => { if (e.target === bar) done(); }, { once: true });
    setTimeout(done, 400); // safety net
  }

  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) if (isBar(n)) enter(n);
      for (const n of m.removedNodes) if (isBar(n)) leave(n, m.target, m.nextSibling);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Bar already present (page restored mid-scroll)
  document.querySelectorAll(".fixed").forEach((n) => { if (isBar(n)) enter(n); });

  /* ---------- Phone: keep content still when the header changes height ----------
     On phones the header swaps to the compact search header in place (145px -> 124px,
     with a brief taller frame). The site only corrects the scroll position for this on
     desktop, so on phones the page content jumped. Shift the scroll by the same amount
     in the same frame so the content stays where it is. */
  function holdContentOnPhone() {
    const header = document.querySelector("header.sticky");
    const main = header && header.parentElement.querySelector("main");
    if (!header || !main || typeof ResizeObserver === "undefined") return false;
    let last = header.offsetHeight;
    new ResizeObserver(() => {
      const h = header.offsetHeight;
      const d = h - last;
      last = h;
      if (!d || window.innerWidth >= 1024 || main.scrollTop <= 0) return;
      main.scrollTop += d;
    }).observe(header);
    return true;
  }
  /* ---------- Phone: hero search flies into the header search (Figma motion) ----------
     When the header switches to compact (tabs "out"), a copy of the hero search flies from
     where the hero search is to the header's search pill — following the pill's live
     position while its slot opens — and changes size, border, button and icon size on a
     spring. It then hands over to the real header pill. When the header switches back
     ("in"), the copy flies from the header pill back onto the hero search's live position.
     Phones only (< 768px), where the site shows the search inside the header. */
  const PHONE = () => window.innerWidth < 768;
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const heroBox = () => {
    const i = document.querySelector('input[aria-label="Product URL"]');
    return i && i.closest('[class*="rounded-[52px]"]');
  };
  const headerPill = () => {
    const f = document.querySelector("header.sticky form");
    const b = f && f.querySelector("button");
    if (!b) return null;
    let p = b.parentElement;
    while (p && p !== f && p.getBoundingClientRect().width < f.getBoundingClientRect().width * 0.8) p = p.parentElement;
    return p && p !== f ? p : b.parentElement;
  };
  const look = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    const btn = el.querySelector("button"), svg = el.querySelector("svg");
    return {
      r: { x: r.left, y: r.top, w: r.width, h: r.height },
      bw: parseFloat(s.borderTopWidth) || 0, bc: s.borderTopColor, bg: s.backgroundColor,
      pl: parseFloat(s.paddingLeft) || 0, pr: parseFloat(s.paddingRight) || 0,
      btn: btn ? btn.getBoundingClientRect().width : 36, ico: svg ? svg.getBoundingClientRect().width : 18,
      shadow: s.boxShadow,
    };
  };
  let lastPill = null;           // last known look of the header pill (it unmounts on switch back)
  const rememberPill = () => { const p = headerPill(); if (p && p.getBoundingClientRect().height > 20) lastPill = look(p); };
  document.addEventListener("scroll", () => { if (PHONE()) requestAnimationFrame(rememberPill); }, { capture: true, passive: true });

  const rgb = (c) => (c.match(/[\d.]+/g) || [0, 0, 0, 0]).map(Number).concat([1]).slice(0, 4).map((v, i) => (i < 3 ? v : (c.startsWith("rgba") ? v : 1)));
  const mixC = (a, b, t) => { const A = rgb(a), B = rgb(b); return `rgba(${A.map((v, i) => (i < 3 ? Math.round(v + (B[i] - v) * t) : (v + (B[i] - v) * t).toFixed(3))).join(",")})`; };
  const lerp = (a, b, t) => a + (b - a) * t;
  // damped spring 0 -> 1, a touch of overshoot, ~95% there by 0.24s
  const spring = (t) => { const w = 16, z = 0.78, wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t)); };
  const HAND = 0.24;   // s: start the cross-fade to the real search (copy has nearly arrived)
  const FADE = 0.16;   // s: cross-fade length; the copy keeps tracking the target meanwhile

  let flight = null;
  function fly(fromLook, getTo, onLand) {
    if (flight) flight.cancel();
    const src = heroBox();
    if (!src || !fromLook) return;
    const el = src.cloneNode(true);
    el.classList.add("s8-fly");
    el.setAttribute("aria-hidden", "true");
    el.inert = true;
    el.querySelectorAll("input").forEach((i) => { i.value = ""; i.removeAttribute("id"); });
    // the hero may already be hidden for the flight; the copy itself must always be visible
    Object.assign(el.style, { opacity: "1", visibility: "visible", transition: "none" });
    document.body.appendChild(el);
    const btn = el.querySelector("button"), svg = el.querySelector("svg");
    const t0 = performance.now();
    let raf = 0, done = false, handed = false;
    const frame = (now) => {
      const to = getTo();
      if (!to) { finish(); return; }
      const sec = (now - t0) / 1000, p = spring(sec), q = Math.min(1, Math.max(0, p));
      // hand over while still moving: the real search fades in under the copy, the copy fades out
      if (!handed && sec >= HAND) {
        handed = true;
        onLand && onLand();
        // real search fades in first; the copy fades out a beat later, so the bar stays solid
        el.style.transition = `opacity ${FADE - 0.04}s ease-in 0.06s`;
        el.style.opacity = "0";
      }
      if (sec >= HAND + FADE + 0.02) { finish(); return; }
      const r = { x: lerp(fromLook.r.x, to.r.x, p), y: lerp(fromLook.r.y, to.r.y, p), w: lerp(fromLook.r.w, to.r.w, p), h: Math.max(20, lerp(fromLook.r.h, to.r.h, p)) };
      Object.assign(el.style, {
        left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px",
        borderWidth: lerp(fromLook.bw, Math.max(to.bw, 1), q) + "px",
        borderColor: mixC(fromLook.bc, to.bw ? to.bc : "rgb(230,231,242)", q),
        paddingLeft: lerp(fromLook.pl, to.pl, q) + "px", paddingRight: lerp(fromLook.pr, to.pr, q) + "px",
      });
      const b = lerp(fromLook.btn, to.btn, p), ic = lerp(fromLook.ico, to.ico, p);
      if (btn) Object.assign(btn.style, { width: b + "px", height: b + "px" });
      if (svg) Object.assign(svg.style, { width: ic + "px", height: ic + "px" });
      raf = requestAnimationFrame(frame);
    };
    const finish = () => {
      if (done) return; done = true; cancelAnimationFrame(raf);
      if (!handed) { handed = true; onLand && onLand(); }
      el.remove();
      flight = null;
    };
    flight = { cancel: () => { if (!done) { done = true; cancelAnimationFrame(raf); el.remove(); flight = null; } } };
    raf = requestAnimationFrame(frame);
  }

  function dock() {           // header turned compact
    if (!PHONE() || reducedMotion()) return;
    const hero = heroBox(), header = document.querySelector("header.sticky");
    if (!hero || !header) return;
    const from = look(hero);
    header.classList.add("s8-docking");          // header pill invisible until the copy arrives
    hideNow(hero);
    fly(from, () => { const p = headerPill(); return p ? look(p) : lastPill; }, () => {
      header.classList.remove("s8-docking");     // pill fades in (CSS) under the fading copy
      rememberPill();                            // hero search stays hidden while docked (undock reveals it)
    });
  }
  // hide instantly (the copy sits exactly on top), reveal with a short fade
  function hideNow(el) { el.style.transition = "none"; el.style.opacity = "0"; }
  function showSoft(el) {
    el.style.transition = `opacity ${FADE}s ease-out`;
    el.style.opacity = "";
    setTimeout(() => { el.style.transition = ""; }, FADE * 1000 + 50);
  }
  function undock() {         // header turned back to full
    const hero = heroBox();
    if (!hero) return;
    // no fly-back possible (desktop width, reduced motion, nothing remembered): just show it
    if (!PHONE() || reducedMotion() || !lastPill) { restoreHero(); return; }
    hideNow(hero);
    fly(lastPill, () => look(heroBox()), () => showSoft(hero));
  }
  // Safety net: the hero search must never stay hidden outside a phone-docked header
  function restoreHero() {
    if (flight) flight.cancel();
    const hero = heroBox();
    if (hero && hero.style.opacity === "0") showSoft(hero);
    const header = document.querySelector("header.sticky");
    if (header) header.classList.remove("s8-docking");
  }
  window.addEventListener("resize", () => {
    const header = document.querySelector("header.sticky");
    if (!PHONE() || !header || header.getAttribute("data-s8-tabs") !== "out") restoreHero();
  }, { passive: true });
  setInterval(() => {
    const header = document.querySelector("header.sticky"), hero = heroBox();
    if (!flight && hero && hero.style.opacity === "0" && (!PHONE() || !header || header.getAttribute("data-s8-tabs") !== "out")) restoreHero();
  }, 1000);

  /* ---------- Save8 logo opens the task list ----------
     Local (serve.py): /tasks. GitHub Pages preview: /save8-ui-fixes/tasks.html.
     Clicks are caught before the site's own link handling; the href is updated too so
     hovering / opening in a new tab shows the right page. */
  const TASKS_URL = location.pathname.startsWith("/save8-ui-fixes") ? "/save8-ui-fixes/tasks.html" : "/tasks";
  // footer logos carry aria-label="Save8 home"; the header logo is an unlabelled <a href="/">
  // around the Save8 logo image, so match that image too
  const LOGO = 'a[aria-label="Save8 home"], a:has(img[src*="save8-logo"])';
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest && e.target.closest(LOGO);
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    location.href = TASKS_URL;
  }, true);
  const fixLogoLinks = () => document.querySelectorAll(LOGO).forEach((a) => {
    if (a.getAttribute("href") !== TASKS_URL) { a.setAttribute("href", TASKS_URL); a.title = "Open the task list"; }
  });
  fixLogoLinks();
  setInterval(fixLogoLinks, 1000);

  /* ---------- Phone: tell the CSS when the tab row leaves / returns ----------
     The site toggles opacity-0 on the tab row (header's 3rd child). Mirror that as
     header[data-s8-tabs="out"|"in"] so the tab/edge animations in topbar.css play only on
     a real switch, never on page load. */
  function watchTabs() {
    const header = document.querySelector("header.sticky");
    const row = header && header.children[2];
    if (!row) return false;
    let hidden = row.classList.contains("opacity-0");
    new MutationObserver(() => {
      const now = row.classList.contains("opacity-0");
      if (now === hidden) return;
      hidden = now;
      // ignore the site's own toggling while the page starts up or sits at the very top
      const main = header.parentElement.querySelector("main");
      if (performance.now() < 1500 || !main || main.scrollTop < 40) return;
      header.setAttribute("data-s8-tabs", now ? "out" : "in");
      if (now) dock(); else undock();
    }).observe(row, { attributes: true, attributeFilter: ["class"] });
    return true;
  }
  if (!watchTabs()) {
    const t2 = setInterval(() => { if (watchTabs()) clearInterval(t2); }, 200);
    setTimeout(() => clearInterval(t2), 10000);
  }

  if (!holdContentOnPhone()) {
    const t = setInterval(() => { if (holdContentOnPhone()) clearInterval(t); }, 200);
    setTimeout(() => clearInterval(t), 10000);
  }
})();
