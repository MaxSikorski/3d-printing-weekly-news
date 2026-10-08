/* secret-santa-snow.js — seasonal dressing for secret-santa.html (per-site file, engine untouched).
 *
 * What it does, in order:
 *   1. Nothing for the first 2 s. Then snow starts, ramping up over ~20 s.
 *   2. Flakes (six-arm line-art, after Commons' CC0 Snow_flake.svg) fall on the title, the step tiles, the form cards and the buttons. Soft drifts
 *      grow on all of their top edges at the same rate (uneven shapes, following rounded corners; capped so nothing gets buried).
 *      Click the title or a tile to shake it off; it re-grows.
 *   3. Snow piles along the bottom of the window; the cursor plows through it.
 *   4. Once the pile is deep enough, two snowmen assemble themselves in the bottom corners. Click one: 1st = shiver + hat flip,
 *      2nd = nose falls off, 3rd = collapses into a mound and rebuilds itself about a minute later. Click one for the three-act gag (shiver + hat flip, nose off, collapse + 60 s rebuild).
 *   5. Christmas lights: one garland under the page title (black wire). Click a bulb to set it swinging.
 *   5b. Santa, his sleigh and four reindeer (Max's silhouette SVG) fly left-to-right, small and faint, far behind the page content at ~40 s, then every few minutes;
 *       each reindeer bounces out of phase. Click Santa for a loop. `?santa` in the URL triggers the flyby at 3 s.
 *
 * Layers: the drifts and the garland live in document-sized layers that scroll with the page (measured once, re-measured on
 * resize / layout change), so they never lag the scroll. Falling flakes, the bottom pile, frost, snowmen and Santa are window-fixed.
 *   6. A faint frost creeps in from the window edges; wiping with the cursor or a finger clears it, and it refrosts slowly.
 *   7. ❄ button (bottom-left) turns it all off and remembers the choice. "Reduce motion" users start with it off.
 *
 * Seasonal colour is the one sanctioned exception to the site's monochrome rule (Max, 2026-10-08).
 * Depends on gsap (already loaded by the page) for the snowmen and the swinging bulbs; degrades without it.
 */
(function () {
    'use strict';

    const START_DELAY_MS = 2000;
    const RAMP_MS = 20000;
    const STORAGE_KEY = 'ss-snow';
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isPhone = () => window.innerWidth < 700;
    const BULB_COLORS = ['#ff4b4b', '#39c66a', '#ffd34d', '#4da3ff', '#fff6e0', '#ff7ad9'];

    let enabled = (function () {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved === 'off') return false;
            if (saved === 'on') return true;
        } catch (e) { /* storage blocked: fall through */ }
        return !reduceMotion;
    })();

    // ── Styles (injected so the page needs only one <script> tag) ──────────────
    const css = `
    .ss-snow-canvas, .ss-frost-canvas, .ss-nav-canvas { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .ss-drift-canvas, .ss-lights { position: absolute; top: 0; left: 0; pointer-events: none; }   /* document-sized: scroll with the page */
    .ss-frost-canvas { z-index: 3; }
    .ss-snow-canvas, .ss-drift-canvas { z-index: 6; }
    .ss-nav-canvas { z-index: 101; }   /* drifts on fixed elements (the theme button): above the fixed nav (z 100) */
    .ss-lights { z-index: 7; overflow: visible; }
    body.ss-garland .content-section, body.ss-garland .footer { position: relative; z-index: 2; }   /* content above Santa (z 1) */
    .ss-lights .bulb-hit { pointer-events: auto; cursor: pointer; }
    body.ss-garland .rec-title { margin-bottom: 38px; }   /* room for the bulbs under the title */
    .ss-lights .bulb { animation: ss-twinkle var(--tw, 2.6s) ease-in-out var(--td, 0s) infinite alternate; }
    @keyframes ss-twinkle { from { opacity: 0.55; } to { opacity: 1; } }
    .ss-snowman { position: fixed; bottom: 0; z-index: 5; pointer-events: none; height: 150px; width: auto; opacity: 0; transition: opacity 0.6s; overflow: visible; }   /* the flipping hat leaves the viewBox */
    .ss-snowman.left { left: 2vw; } .ss-snowman.right { right: 2vw; transform: scaleX(-1); }   /* mirror via CSS, not the inner group */
    .ss-snowman.show { opacity: 1; }
    .ss-snowman.show .part { pointer-events: auto; cursor: pointer; }   /* click a snowman: hat flip */
    /* no transform-box/-origin on .part: GSAP writes SVG transforms in user space and fill-box would shift them (nose fell off-screen) */
    @media (max-width: 700px) { .ss-snowman { height: 96px; } .ss-snowman.right { display: none; } }
    .ss-santa { position: fixed; top: 90px; left: 0; z-index: 1; width: 300px; height: auto; pointer-events: none; opacity: 0; filter: blur(0.4px); will-change: transform; }   /* far off in the distance */
    .ss-santa .hit { pointer-events: auto; cursor: pointer; }
    .ss-santa .nose { animation: ss-nose 0.9s ease-in-out infinite alternate; }
    @keyframes ss-nose { from { opacity: 0.55; } to { opacity: 1; } }
    .ss-santa .spark { animation: ss-twinkle 0.7s ease-in-out infinite alternate; }
    @media (max-width: 700px) { .ss-santa { width: 180px; top: 70px; } }
    .ss-snow-toggle { position: fixed; left: 14px; bottom: 14px; z-index: 60; width: 40px; height: 40px; border-radius: 50%;
        border: 1px solid var(--card-border); background: var(--card-bg); color: var(--text-color); font-size: 18px; line-height: 1;
        cursor: pointer; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; opacity: 0.8; }
    .ss-snow-toggle:hover { opacity: 1; }
    .ss-snow-toggle[aria-pressed="false"] { opacity: 0.45; text-decoration: line-through; }
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    // ── State ──────────────────────────────────────────────────────────────────
    let snowCanvas, snowCtx, frostCanvas, frostCtx, lightsSvg, toggleBtn;
    let driftCanvas, driftCtx;     // document-sized layer for the drifts (scrolls with the page)
    let navCanvas, navCtx;         // window-fixed layer above the nav for drifts on fixed elements
    let flakes = [];
    let rafId = 0;
    let startedAt = 0;
    let lastT = 0;
    let W = 0, H = 0, DPR = 1;
    let docW = 0, docH = 0;        // document size the drift canvas and lights SVG cover
    let pile = [];                 // bottom pile heights per column
    const COL = 6;                 // px per column
    let targets = [];              // {el, key, x, y, w, cap, drop, capA, since, ...}: x/y = left/top surface, document coords (viewport if fixed)
    // Drifts on the title, tiles, cards and buttons all grow together from one global snowfall clock (like real snow):
    // depth(x) = level × cap × profile(x), where the per-surface profile is fixed smooth noise × the corner taper.
    const STEP = 2;                // px per drift sample
    const FILL_S = 30;             // snowfall-seconds (at full intensity) for every surface to reach full depth
    let snowTime = 0;              // integrated snowfall since the hush ended
    const levelOf = t => Math.min(1, Math.max(0, (snowTime - t.since) / FILL_S));   // since = snowTime when last shaken off
    let ro = null, measureT = 0;
    let pointer = { x: -1, y: -1, down: false };
    let snowmen = [];
    let snowmenBuilt = false;
    let frostTimer = 0;
    const strings = [];            // light strings: {el, g, path, bulbs:[{g, hit}]}
    let santa = null, santaTimer = 0, santaFlying = false;

    const theme = () => document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const flakeColor = () => theme() === 'light' ? '150,200,235' : '222,240,255';

    // ── Setup / teardown ───────────────────────────────────────────────────────
    function build() {
        if (snowCanvas) return;
        frostCanvas = document.createElement('canvas'); frostCanvas.className = 'ss-frost-canvas';
        snowCanvas = document.createElement('canvas'); snowCanvas.className = 'ss-snow-canvas';
        driftCanvas = document.createElement('canvas'); driftCanvas.className = 'ss-drift-canvas';
        navCanvas = document.createElement('canvas'); navCanvas.className = 'ss-nav-canvas';
        document.body.appendChild(frostCanvas);
        document.body.appendChild(driftCanvas);
        document.body.appendChild(snowCanvas);
        document.body.appendChild(navCanvas);
        snowCtx = snowCanvas.getContext('2d');
        navCtx = navCanvas.getContext('2d');
        frostCtx = frostCanvas.getContext('2d');
        driftCtx = driftCanvas.getContext('2d');
        document.body.classList.add('ss-garland');
        buildLights();
        buildSnowmen();
        buildSanta();
        resize();
        window.addEventListener('resize', onResize);
        // re-measure whenever the layout moves (form shown, fonts loaded, textarea resized, error text …)
        if (window.ResizeObserver) {
            ro = new ResizeObserver(scheduleMeasure);
            ro.observe(document.body);
            document.querySelectorAll('.rec-title, .ss-steps, .ss-form').forEach(n => ro.observe(n));
        }
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (snowCanvas) scheduleMeasure(); });
        document.addEventListener('pointermove', onPointerMove, { passive: true });
        document.addEventListener('pointerdown', onPointerDown, { passive: true });
        document.addEventListener('pointerup', () => { pointer.down = false; }, { passive: true });
        document.addEventListener('visibilitychange', onVisibility);
        startedAt = performance.now();
        lastT = startedAt;
        rafId = requestAnimationFrame(tick);
        frostTimer = setInterval(refrost, 500);
    }

    function teardown() {
        cancelAnimationFrame(rafId); rafId = 0;
        clearInterval(frostTimer);
        document.body.classList.remove('ss-garland');
        clearTimeout(santaTimer); if (window.gsap && santa) { stopGallop(); if (santa._tl) santa._tl.kill(); gsap.killTweensOf(santa); }   // kill the flight timeline itself, or its onComplete fires on a null Santa and reschedules
        if (window.gsap) snowmen.forEach(s => gsap.killTweensOf(s.querySelectorAll('.part, .mound')));
        if (ro) { ro.disconnect(); ro = null; }
        clearTimeout(measureT); clearTimeout(resizeT);
        [snowCanvas, frostCanvas, driftCanvas, navCanvas, lightsSvg, santa].forEach(n => n && n.remove());
        santa = null; santaFlying = false;
        snowmen.forEach(s => { clearTimeout(s._rebuildT); s.remove(); });
        snowCanvas = frostCanvas = driftCanvas = navCanvas = lightsSvg = null;
        snowCtx = frostCtx = driftCtx = navCtx = null;
        frostBase = frostMask = maskCtx = null;   // offscreen frost layers: let them go
        snowmen = []; flakes = []; targets = []; pile = []; strings.length = 0; snowmenBuilt = false; snowTime = 0;
        window.removeEventListener('resize', onResize);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('visibilitychange', onVisibility);
    }

    function onVisibility() {
        if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
        else if (!rafId && snowCanvas) { lastT = performance.now(); rafId = requestAnimationFrame(tick); }
    }

    let resizeT = 0;
    function onResize() { clearTimeout(resizeT); resizeT = setTimeout(resize, 120); }

    function resize() {
        W = window.innerWidth; H = window.innerHeight; DPR = Math.min(window.devicePixelRatio || 1, 2);
        [snowCanvas, frostCanvas, navCanvas].forEach(c => { c.width = W * DPR; c.height = H * DPR; c.style.width = W + 'px'; c.style.height = H + 'px'; });
        snowCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
        navCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
        frostCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
        const cols = Math.ceil(W / COL) + 1;
        const old = pile; pile = new Float32Array(cols);
        for (let i = 0; i < Math.min(cols, old.length); i++) pile[i] = old[i];
        measure();
        paintFrostBase();
    }

    // ── Document layers: measured once, re-measured only when the layout changes ──
    function scheduleMeasure() { clearTimeout(measureT); measureT = setTimeout(() => { if (snowCanvas) measure(); }, 60); }

    function measure() {
        if (!driftCanvas) return;
        // size the document layers to the page (collapse them first so they don't count toward the height they measure)
        driftCanvas.style.height = lightsSvg.style.height = '0px';
        docW = document.documentElement.clientWidth;
        docH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
        const s = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(12e6 / (docW * docH)));   // keep the big canvas within mobile limits
        driftCanvas.width = Math.round(docW * s); driftCanvas.height = Math.round(docH * s);
        driftCanvas.style.width = docW + 'px'; driftCanvas.style.height = docH + 'px';
        driftCtx.setTransform(s, 0, 0, s, 0, 0);
        lightsSvg.setAttribute('width', docW); lightsSvg.setAttribute('height', docH);
        lightsSvg.style.width = docW + 'px'; lightsSvg.style.height = docH + 'px';
        navCtx.clearRect(0, 0, W, H);   // fixed drifts redraw at their re-measured spots
        collectTargets();
        layoutLights();
    }

    // ── Accumulation targets ───────────────────────────────────────────────────
    const isFixed = el => { for (let n = el; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true; return false; };

    // Distance from the top of a text box to the cap line, so title snow rests on the letters.
    function capOffset(el) {
        const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize) || 16;
        try {
            const c = document.createElement('canvas').getContext('2d');
            c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
            const m = c.measureText('H');
            if (m.fontBoundingBoxAscent > 0 && m.actualBoundingBoxAscent > 0) return m.fontBoundingBoxAscent - m.actualBoundingBoxAscent;
        } catch (e) { /* old browser: fall back */ }
        return 0.24 * fs;
    }

    // One rect per line of the title's text (so the drift spans the words, not the whole h1 block)
    function lineRects(el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = [];
        for (const r of range.getClientRects()) {
            if (r.width < 2 || r.height < 2) continue;
            const l = lines.find(q => Math.abs(q.top - r.top) < 2);
            if (l) { l.left = Math.min(l.left, r.left); l.right = Math.max(l.right, r.right); }
            else lines.push({ top: r.top, left: r.left, right: r.right });
        }
        return lines;
    }

    function collectTargets() {
        const sel = '.rec-title, .ss-step, .ss-card, .ss-notice, #ss-submit';   // not the nav bar or its theme button (Max, 2026-10-08)
        const seen = new Map(targets.map(t => [t.key, t]));
        const sx = window.scrollX, sy = window.scrollY;
        targets = [];
        const add = (el, key, left, top, width, cap, fixed, rl, rr) => {
            const prev = seen.get(key);
            const t = { el, key, x: left + (fixed ? 0 : sx), y: top + (fixed ? 0 : sy), w: width, cap, fixed, rl, rr,
                since: prev ? prev.since : 0, drawn: -1, dirty: true };
            shapeTarget(t, prev);
            targets.push(t);
        };
        document.querySelectorAll(sel).forEach(el => {
            if (el.closest('[hidden]')) return;
            if (el.classList.contains('rec-title')) {
                const off = capOffset(el) + 1.5;   // + a hair, so the snow sinks onto the letter tops instead of hovering
                lineRects(el).forEach((l, i) => add(el, 'title' + i, l.left, l.top + off, l.right - l.left, 9, false, 0, 0));
                return;
            }
            const cap = el.classList.contains('ss-step') ? 11 : el.tagName === 'BUTTON' ? 6 : 14;
            const box = el.id === 'theme-toggle' && el.querySelector('svg') || el;   // the theme button is a bare icon: rest on the icon, not its padding
            const r = box.getBoundingClientRect();
            const fixed = isFixed(el);   // e.g. the theme button in the fixed nav: its drift goes on the window-fixed nav canvas
            const [rl, rr] = cornerRadii(box, r);
            add(el, el, r.left, r.top, r.width, cap, fixed, rl, rr);
        });
    }

    // Top-left / top-right corner radii as drawn (a pill button's 30px clamps to half its height).
    function cornerRadii(el, r) {
        const cs = getComputedStyle(el);
        const rad = v => {
            const first = String(v).split(' ')[0], n = parseFloat(first) || 0;
            return Math.max(0, Math.min(/%$/.test(first) ? n / 100 * r.width : n, r.height / 2, r.width / 2));
        };
        return [rad(cs.borderTopLeftRadius), rad(cs.borderTopRightRadius)];
    }

    // Per-surface shape, sampled every STEP px: drop = how far the real top edge falls below the box top (the corner arc),
    // capA = full-depth snow height (cap × smooth noise × taper). On a rounded corner the snow thins as the arc steepens
    // and is gone well before the vertical tangent; square ends (the title lines) just thin out toward the edge.
    const KNOT = 36;
    function shapeTarget(t, prev) {
        const n = Math.floor(t.w / STEP) + 2;
        const need = Math.ceil(t.w / KNOT) + 2;
        const knots = prev && prev.knots ? prev.knots.slice() : [];
        while (knots.length < need) knots.push(0.55 + Math.random() * 0.45);
        t.knots = knots;
        t.drop = new Float32Array(n); t.capA = new Float32Array(n);
        const C0 = Math.cos(55 * Math.PI / 180);           // no snow where the arc is steeper than 55°
        const corner = (d, r) => {                          // d = distance in from that side
            if (r <= 0) return { drop: 0, k: 0.35 + 0.65 * Math.min(1, d / 24) };
            if (d >= r) return { drop: 0, k: 0.5 + 0.5 * Math.min(1, d / (r + 18)) };
            const u = (r - d) / r, c = Math.sqrt(1 - u * u);
            return { drop: r * (1 - c), k: Math.max(0, (c - C0) / (1 - C0)) * (0.5 + 0.5 * d / (r + 18)) };
        };
        let maxDrop = 0;
        for (let j = 0; j < n; j++) {
            const x = Math.min(t.w, j * STEP);
            const kk = x / KNOT, k0 = Math.floor(kk), f = (1 - Math.cos((kk - k0) * Math.PI)) / 2;
            const prof = knots[k0] * (1 - f) + knots[k0 + 1] * f;
            const L = corner(x, t.rl), R = corner(t.w - x, t.rr);
            t.drop[j] = Math.max(L.drop, R.drop);
            t.capA[j] = t.cap * prof * Math.min(L.k, R.k);
            if (t.capA[j] > 0.05) maxDrop = Math.max(maxDrop, t.drop[j]);
        }
        t.maxDrop = maxDrop;
    }

    function shakeOff(t) {
        const ox = t.fixed ? 0 : window.scrollX, oy = t.fixed ? 0 : window.scrollY;   // flakes live in viewport coords
        const lv = levelOf(t);
        for (let j = 0; j < t.capA.length; j += 3) {
            const d = lv * t.capA[j];
            if (d > 1.5 && Math.random() < 0.35) spawnFlake(t.x - ox + j * STEP, t.y - oy + t.drop[j] - d, true);
        }
        t.since = snowTime;                                 // bare again; re-grows on the same snowfall clock
        t.dirty = true;
    }

    // ── Flakes ─────────────────────────────────────────────────────────────────
    function spawnFlake(x, y, loose) {
        const depth = Math.random();                        // 0 far … 1 near
        flakes.push({
            x: x !== undefined ? x : Math.random() * (W + 40) - 20,
            y: y !== undefined ? y : -10,
            r: 1 + depth * 2.4,
            vy: 18 + depth * 42,                            // px/s
            drift: Math.random() * Math.PI * 2,
            sway: 0.4 + Math.random() * 0.9,
            a: 0.45 + depth * 0.5,
            loose: !!loose,
            vx: loose ? (Math.random() - 0.5) * 60 : 0,
            rot: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 1.2
        });
    }

    function maxFlakes() { return Math.min(isPhone() ? 90 : 240, Math.round((W * H) / 7000)); }

    function tick(now) {
        rafId = requestAnimationFrame(tick);
        const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
        const age = now - startedAt;
        if (age < START_DELAY_MS) return;                   // the two-second hush
        const ramp = Math.min(1, (age - START_DELAY_MS) / RAMP_MS);
        snowTime += dt * (0.08 + 0.92 * ramp);              // accumulation follows the snowfall ramp
        const want = maxFlakes() * (0.08 + 0.92 * ramp);
        const rate = want * 0.35 * dt;                      // flakes/second ≈ 35% of population
        for (let n = rate + Math.random(); n >= 1 && flakes.length < want; n--) spawnFlake();

        const wind = Math.sin(now / 4000) * 12;
        const ctx = snowCtx;
        ctx.clearRect(0, 0, W, H);

        // target surfaces in viewport coords for the landing test (no layout reads: positions were measured up front)
        const sx = window.scrollX, sy = window.scrollY;
        const rects = targets.map(t => {
            const left = t.x - (t.fixed ? 0 : sx), top = t.y - (t.fixed ? 0 : sy);
            return { left, right: left + t.w, top };
        });
        const pileCols = pile.length;

        ctx.strokeStyle = 'rgba(' + flakeColor() + ',1)';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineCap = 'round';
        for (let i = flakes.length - 1; i >= 0; i--) {
            const f = flakes[i];
            f.drift += dt * f.sway;
            f.rot += f.spin * dt;
            f.x += (Math.sin(f.drift) * 10 + wind) * dt * (0.5 + f.r / 3) + f.vx * dt;
            f.vx *= 0.98;
            f.y += f.vy * dt;
            if (f.x < -30) f.x = W + 20; else if (f.x > W + 30) f.x = -20;

            // land on a target top edge?
            let landed = false;
            if (!f.loose || f.vy > 0) {
                for (let k = 0; k < targets.length && !landed; k++) {
                    const r = rects[k];
                    if (f.x < r.left || f.x > r.right || r.top < 0 || r.top > H) continue;
                    const t = targets[k];
                    const j = Math.min(t.drop.length - 1, Math.max(0, Math.round((f.x - r.left) / STEP)));
                    const surface = r.top + t.drop[j] - levelOf(t) * t.capA[j];
                    if (f.y >= surface - 1 && f.y <= surface + f.vy * dt + 2) landed = true;   // it joins the drift (depth comes from the clock)
                }
            }
            // bottom pile
            if (!landed) {
                const c = Math.min(pileCols - 1, Math.max(0, Math.round(f.x / COL)));
                const capPile = isPhone() ? 26 : 44;
                if (f.y >= H - pile[c]) {
                    if (pile[c] < capPile) {
                        pile[c] = Math.min(capPile, pile[c] + 0.6 * f.r);
                        if (c > 0) pile[c - 1] = Math.min(capPile, pile[c - 1] + 0.25 * f.r);
                        if (c < pileCols - 1) pile[c + 1] = Math.min(capPile, pile[c + 1] + 0.25 * f.r);
                    }
                    landed = true;
                }
            }
            if (landed) { flakes.splice(i, 1); continue; }

            ctx.globalAlpha = f.a;
            drawFlake(ctx, f);
        }
        ctx.globalAlpha = 1;

        // cursor plows the pile
        if (pointer.y > H - 70 && pointer.x >= 0) {
            const c0 = Math.round(pointer.x / COL);
            for (let d = -5; d <= 5; d++) {
                const c = c0 + d; if (c < 0 || c >= pileCols) continue;
                const push = Math.max(0, 1 - Math.abs(d) / 6) * 60 * dt;
                const taken = Math.min(pile[c], push);
                pile[c] -= taken;
                const side = d < 0 ? c - 6 : c + 6;
                if (side >= 0 && side < pileCols) pile[side] = Math.min(60, pile[side] + taken * 0.8);
            }
        }

        drawDrifts();
        drawPile(ctx);
        maybeBuildSnowmen(now);
    }

    function snowFill(ctx, x0, y0, x1, y1) {
        const g = ctx.createLinearGradient(0, y0, 0, y1);
        const light = theme() === 'light';
        g.addColorStop(0, light ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.98)');
        g.addColorStop(1, light ? 'rgba(165,205,235,0.95)' : 'rgba(222,240,255,0.85)');
        return g;
    }
    // light theme: a soft blue underline so white snow reads on the light-grey page
    function snowEdge(ctx) {
        if (theme() !== 'light') return;
        ctx.strokeStyle = 'rgba(120,170,215,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    }

    // Each drift redraws only when its depth moved, clipped to its own box (so redrawing one never touches its neighbours):
    // document targets on the document-sized drift canvas, fixed targets (the theme button) on the window-fixed nav canvas.
    function drawDrifts() {
        for (let k = 0; k < targets.length; k++) {
            const t = targets[k];
            const lv = levelOf(t);
            if (!t.dirty && Math.abs(lv - t.drawn) * t.cap < 0.15) continue;
            const ctx = t.fixed ? navCtx : driftCtx;
            const top = t.y, left = t.x;
            t.dirty = false; t.drawn = lv;
            const y0 = top - t.cap - 4, h = t.cap + 4 + t.maxDrop + 3;
            ctx.save();
            ctx.beginPath(); ctx.rect(left - 1, y0, t.w + 2, h); ctx.clip();
            ctx.clearRect(left - 1, y0, t.w + 2, h);
            if (lv * t.cap > 0.5) {
                // top: the snow surface; bottom: the element's real (rounded) top edge, sunk ≤1px into it, never below the outline
                const n = t.drop.length;
                ctx.beginPath();
                for (let j = 0; j < n; j++) {
                    const x = left + Math.min(t.w, j * STEP), y = top + t.drop[j] - lv * t.capA[j];
                    if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                for (let j = n - 1; j >= 0; j--) ctx.lineTo(left + Math.min(t.w, j * STEP), top + t.drop[j] + Math.min(1, lv * t.capA[j]));
                ctx.closePath();
                ctx.fillStyle = snowFill(ctx, 0, top - t.cap, 0, top + 1);
                ctx.fill();
                snowEdge(ctx);
            }
            ctx.restore();
        }
    }

    function drawPile(ctx) {
        ctx.beginPath();
        ctx.moveTo(0, H + 2);
        for (let i = 0; i < pile.length; i++) {
            const x = i * COL, h = pile[i];
            const nh = pile[Math.min(i + 1, pile.length - 1)];
            ctx.quadraticCurveTo(x, H - h, x + COL / 2, H - (h + nh) / 2);
        }
        ctx.lineTo(W, H + 2);
        ctx.closePath();
        ctx.fillStyle = snowFill(ctx, 0, H - 50, 0, H);
        ctx.fill();
        snowEdge(ctx);
    }

    function onPointerMove(e) {
        pointer.x = e.clientX; pointer.y = e.clientY;
        wipeFrost(e.clientX, e.clientY);
    }
    function onPointerDown(e) {
        pointer.down = true;
        targets.filter(t => (t.el.classList.contains('rec-title') || t.el.classList.contains('ss-step')) && t.el.contains(e.target)).forEach(shakeOff);
    }

    // Six-arm line-art flake (after Commons' CC0 Snow_flake.svg): a stem with a V branch near the tip.
    function drawFlake(ctx, f) {
        const R = f.r * 2.6;                                // visual radius
        if (R < 5) { ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.9, 0, Math.PI * 2); ctx.fill(); return; }
        ctx.lineWidth = Math.max(0.8, R / 9);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
            const a = f.rot + k * Math.PI / 3;
            const ca = Math.cos(a), sa = Math.sin(a);
            const px = -sa, py = ca;                         // perpendicular
            // stem
            ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + ca * R, f.y + sa * R);
            // V branch at 62% out, each side angled 60° back toward the centre
            const bx = f.x + ca * R * 0.62, by = f.y + sa * R * 0.62, bl = R * 0.34;
            const b1x = ca * 0.5 + px * 0.866, b1y = sa * 0.5 + py * 0.866;
            const b2x = ca * 0.5 - px * 0.866, b2y = sa * 0.5 - py * 0.866;
            ctx.moveTo(bx, by); ctx.lineTo(bx + b1x * bl, by + b1y * bl);
            ctx.moveTo(bx, by); ctx.lineTo(bx + b2x * bl, by + b2y * bl);
        }
        ctx.stroke();
    }

    // ── Santa flyby ────────────────────────────────────────────────────────────
    // Santa, sleigh and four reindeer: "Santas-Sleigh-And-Reindeer-Silhouette.svg" (Max's pick, 2026-10-08), one outline path.
    // The legs aren't separate shapes, so the outline is clipped into five regions (sleigh + 4 reindeer) that bounce out of phase.
    const SANTA_VB = [2601.09, 734.135];
    const SANTA_PATH = "M2393.544,37.651c3.766-5.459,8.62-12.731,16.307-11.401c-0.259,4.336-0.846,8.689-2.453,12.749 c-20.49,26.559-18.219,61.024-1.986,76.959c-1.607-7.774-5.545-15.081-5.718-23.096c6.245-24.746,20.589-25.144,49.388-36.07 c14.91-5.722,14.241-6.588,22.25-6.098c-0.017,1.088-0.034,3.282-0.052,4.371c-17.932,20.099-40.158,11.417-51.047,26.655 c-8.067,10.538-2.401,24.34-0.363,35.966c2.85-7.428,4.042-15.703,8.62-22.354c7.978-5.765,26.142-9.438,35.517-12.541 c3.351-3.092,6.253-6.633,9.294-10.019c2.384-1.434,5.131-1.831,7.877-2.315c0.916,8.223-2.764,16.169-9.933,20.419 c4.129,1.399,11.643,4.837,8.136,10.365c-12.085-0.826-16.256-11.378-39.3-1.365c-8.965,4.958-8.844,16.653-11.47,25.359 c9.817-9.914,18.59-24.73,23.304-11.885c-8.154,3.783-13.699,12.317-15.15,20.902c3.369,6.115,11.419,7.376,17.568,9.432 c12.771,3.763,11.661,1.934,19.417,16.29c9.484,0.674,18.657-1.987,27.64-4.716c8.948-0.656,16.722,7.48,25.584,4.353 c11.629-3.588,26.036-20.89,24.392,3.887c-1.382,6.53,2.954,12.213,3.783,18.536c-5.373,2.919-11.401,3.576-17.378,3.714 c-17.786,16.077-17.685,10.722-15.564,19.469c2.184,6.553,8.075,17.466,15.737,26.223c9.144,10.629,13.519,10.876,15.461,41.027 c-2.038-3.351-3.99-6.754-5.891-10.158c1.002,11.194,1.987,22.924-2.85,33.461c-1.192-2.608-2.177-5.217-3.282-7.808 c-0.623,15.7-5.28,23.235-6.53,25.567c-0.19-1.969-0.587-5.908-0.777-7.877c-5.182,11.056-10.227,23.839-22.82,28.279 c1.417-3.127,3.109-6.184,4.681-9.259c-2.159,1.555-4.319,3.109-6.426,4.664c2.315,9.518,8.983,16.895,14.252,24.876 c12.203,3.569,13.086,3.824,23.044,5.649c22.619,3.979,10.545,14.963,33.738,45.484c-0.225,2.021-0.345,4.042-0.484,6.081 c-9.076,11.42-14.926,7.883-22.647,14.925c-9.158,22.502,0.509,23.008-19.365,35.966c-18.119,11.29-20.834,30.125-62.137,47.195 c2.09-8.603,1.365-17.413,1.175-26.154c-0.242-7.014,7.825-7.514,12.852-8.81c6.288-2.488,13.992,1.987,19.106-3.61 c36.466-31.909,26.483-19.631,31.734-35.707c-10.624,5.925-21.3,11.73-32.062,17.344c-10.199,6.612-23.076,19.254-39.991,17.793 c4.06-10.071,3.852-21.092,6.409-31.509c1.486-2.073,3.196-4.422,6.184-3.559c33.976,3.157,27.372,3.006,42.582-4.561 c6.616-3.576,13.491-6.927,19.296-11.833c1.979-7.325-2.648-5.597-30.922-39.697c-89.847-5.229-82.022,0.271-82.089-20.125 c-88.159,14.663-106.968-22.098-125.104-24.997c-10.296,3.766-15.582,14.908-25.48,19.607 c-28.585,15.038-66.694-8.929-90.398,18.864c-28.003,31.553-60.738,38.445-53.776,48.991c2.764,7.014,8.465,12.179,13.267,17.793 c3.386,3.645,3.213,8.879,3.87,13.492c-9.208,3.127-18.968,3.783-28.573,4.405c-17.156-37.574-17.256-33.895-10.486-58.769 c3.956,0.95,7.825,2.522,11.989,2.591c3.541-1.572,6.53-4.129,9.795-6.219c9.799-5.812,17.29-5.735,26.378-23.494 c11.054-21.656,11.884-38.52,15.167-48.818c42.665,1.132,51.506-13.782,59.304-32.425c-94.812,9.205-106.094,42.9-239.22,155.542 c-4.664,2.522-5.942,7.324-6.046,12.265c-1.382-1.779-2.764-3.524-4.111-5.286c0.553,8.672,0.259,17.378-1.036,25.964 c-1.192-3.006-2.315-6.012-3.42-9.035c-1.606,11.885-4.301,25.325-15.271,32.235c0.674-3.334,1.624-6.616,2.453-9.916 c-1.883,2.28-3.749,4.56-5.58,6.841c4.82,7.756,11.781,13.837,18.743,19.624c10.126,5.346,34.46-4.029,41.39,7.325 c9.044,14.78,22.29,27.47,27.363,33.375c-1.054,11.194-12.161,16.048-19.572,22.699c-0.57,8.43-0.276,16.877-0.795,25.29 c-1.658,8.879-10.278,13.595-14.96,20.695c-20.155,29.955-13.956,29.776-45.208,53.863c-0.151-21.045-9.245-28.712-1.883-33.202 c6.392-3.524,13.111-8.292,20.833-6.927c10.555-10.762,17.948-24.167,27.881-35.5c0-3.714,0-7.428,0.017-11.142 c-8.637,7.566-17.137,15.288-26.033,22.544c-10.52,10.918-19.97,25.117-36.242,27.45c0.915-9-0.052-18-0.656-26.966 c0.514-14.028-0.031-7.809,33.945-14.545c10.227-7.549,19.762-16.065,28.521-25.29c-1.382-3.058-2.609-6.53-5.873-8.05 c-11.868-6.858-22.267-15.91-33.737-23.321c0,0-31.861,6.051-76.527,12.023c-6.72-0.518-6.564-9.19-7.946-14.113 c-17.828,7.808-37.003,12.058-56.177,14.874c-42.383,5.965-65.836-18.792-74.575-9.156c-7.463,8.689-12.092,20.194-22.353,26.24 c-27.719,15.975-64.466,3.943-80.535,37.21c-21.03,36.644-39.969,38.636-41.235,54.484c3.766,7.912,11.971,11.902,18.449,17.206 c3.87,2.937,4.958,7.86,6.305,12.265c-8.447,4.578-17.603,7.549-26.741,10.365c-17.575-22.07-26.994-31.478-22.785-54.985 c3.887-0.311,7.946,0.743,11.764-0.38c5.407-4.474,9.622-10.261,15.444-14.303c7.1-4.854,10.589-13.077,12.887-21.041 c9.702-34.993-1.184-52.015,7.739-53.12c61.546-15.671,41.432-42.737,51.22-79.792c-29.067-8.074,20.064,6.568-125.708-64.884 c13.347,30.811,25.109,24.015-8.914,42.168c-2.453,7.635-3.956,15.513-6.253,23.165c-2.678,7.376-10.814,10.002-16.342,14.735 c-23.577,20.464-15.691,23.394-54.968,41.995c3.841-20.799-1.835-26.633,4.042-30.645c7.083-2.85,14.874-4.422,22.492-3.092 c4.528-2.264,31.026-25.52,32.373-26.931c1.676-3.04,1.676-6.685,2.453-10.019c-9.95,5.96-20.35,11.09-30.49,16.705 c-11.332,7.774-22.751,17.879-37.538,16.636c5.718-15.546,3.197-34.392,10.745-33.444c9.328,1.002,18.795,0.674,28.072,2.384 c11.211-5.234,22.302-10.866,32.476-17.948c-0.795-2.833-0.933-6.133-3.351-8.154c-9.864-9.294-18.19-20.021-27.415-29.92 c-24.634,0.553-49.198-1.987-73.677-4.267c-5.2-2.539-3.248-9.587-3.49-14.252c-28.34,4.389-62.962,4.925-88.827-7.705 c-18.276-8.905-27.192-20.174-34.308-14.321c-8.291,6.315-9.44,10.533-21.853,17.879c-28.186,11.553-54.883-7.51-81.329,13.958 c-1.166,1.166-19.68,22.324-38.626,31.993c-5.874,3.559-12.87,7.083-15.599,13.785c0.691,9.259,9.121,15.236,14.39,22.146 c2.235,6.651,1.895,6.343,2.108,11.229c-5.809,2.324-13.044,3.017-26.69,4.336c-17.341-33.021-15.612-37.456-9.95-56.212 c3.282,1.054,6.582,2.108,9.898,3.144c6.772-3.697,13.06-8.24,20.091-11.47c14.027-6.522,22.566-32.087,26.171-47.022 c1.441-6.257,1.029-17.213,6.91-16.566c14.545,0.276,29.954-2.056,41.684-11.384c-102.798,3.829-140.223,33.334-211.702,68.719 c-7.243,3.574-7.188,3.598-9.639,5.079c-4.095,5.828-3.422,6.937-11.436,13.198c0.587-3.127,1.365-6.184,2.073-9.259 c-1.762,2.056-3.541,4.111-5.252,6.202c4.457,7.411,10.9,13.25,17.413,18.829c4.685,5.068,27.624,0.715,38.972,4.457 c5.605,5.562,13.617,21.535,30.024,35.931c1.173,11.14-7.924,15.365-17.223,22.543l-1.157,1.537 c-3.248,11.695,2.868,26.344-7.203,35.603c-21.88,19.474-13.06,32.605-54.744,63.847c-1.617-23.642-7.402-25.74-3.369-31.889 c5.027-3.576,10.797-5.994,16.497-8.275c1.952,0.052,3.921,0.121,5.891,0.207c6.444-5.399,15.286-19.836,25.584-32.131 c3.887-3.749,2.401-9.363,2.677-14.131c-9.691,8.292-19.555,16.428-28.952,25.066c-10.584,11.235-18.059,22.019-33.496,24.236 c1.399-10.555-1.434-21.075-0.536-31.578c0.104-10.08,28.616-4.499,36.812-11.591c9.069-7.186,18.052-14.58,25.774-23.252 c-4.994-9.533,3.118-0.364-39.732-31.872c-23.605,5.177-60.487,10.467-78.756,12.472c-3.628-4.042-4.647-9.397-5.459-14.563 c-16.672,7.529-42.635,13.424-60.738,14.943c-41.858,3.759-62.367-20.504-70.636-9.311c-18.213,21.579-8.977,27.51-64.297,36.709 c-35.81,5.347-32.891,26.329-62.016,56.281c-7.342,6.426-14.977,13.025-18.812,22.284c4.008,7.687,11.108,12.731,18.052,17.534 c4.509,2.868,5.943,8.223,7.549,12.973c-8.344,5.061-17.793,7.704-27.052,10.52c-19.241-25.409-25.583-29.19-22.336-55.797 c13.482,1.832,10.155,1.758,18.259-5.873c9.059-10.326,28.95-11.778,26.379-77.892c0.173-4.699,6.34-4.457,9.639-5.614 c51.153-11.83,39.59-48.622,43.066-69.859c-58.285-24.133-115.499-50.84-174.406-73.452c-19.002-7.428-38.816-12.403-57.922-19.538 c-65.559-23.303-117.354-51.756-155.87-18.156c3.887,2.712,7.411,5.96,9.536,10.296c-9.013,11.82-4.577,6.896-20.125,8.568 c-3.282,8.845-2.557,18.467-2.608,27.726c-0.233,24.902,13.328,36.897,21.732,46.486c3.61,3.87-2.902,10.14-6.824,6.772 c-27.433-21.005-25.305-52.954-25.377-68.356c-7.774,3.161-16.463,1.036-24.271,3.956c-8.05,2.868-15.806,6.478-23.856,9.363 c0.397,3.956-1.831,11.125,4.042,11.695c7.048-0.38,13.129-6.547,20.591-4.388c3.939,0.225,3.68,4.664,4.301,7.515 c7.843,2.038,18.968,4.025,20.246,13.802c0.622,12.075-4.699,23.39-6.668,35.137c-2.781,16.1-3.973,32.459-4.854,48.767 c58.83-12.501,41.73-68.66,75.456-103.787c11.16-12.04,30.438-15.236,44.862-7.394c25.878,14.264,18.619,56.365-5.338,57.611 c-15.782,0.829-18.479-30.687,2.332-21.179c-1.572-3.61-2.47-9.294-7.376-9.587c-16.64,0.847-26.123,16.311-0.484,46.4 c15.857,19.16,6.168,63.293-24.772,75.56c1.192,2.66,2.988,5.355,2.505,8.43c-1.52,8.603-14.874,12.282-20.125,5.079 c-2.66-2.868,0.294-6.098,1.192-9c-4.526-2.868-9.847-2.315-13.371,1.831c7.463,15.064,14.062,31.112,26.793,42.669 c8.185,9.687,47.238,13.681,58.458-6.34c6.202-9.501-3.99-23.131-14.701-21.334c-3.075,0.518-5.977,3.351-5.787,6.616 c3.075,2.349,8.154,2.66,9.553,6.772c-0.104,4.267-3.99,6.219-7.255,7.964c-3.524-1.917-7.394-3.559-10.037-6.668 c-7.411-8.378,0.587-21.801,9.968-24.392c10.382-0.484,20.471,6.167,25.549,15.063c4.215,7.895,1.106,17.05-1.14,25.083 c62.982-34.368,59.562-93.194,32.131-107.017c1.503,10.33,2.747,22.544-4.82,30.956c-8.672,8.741-23.148,9.812-34.152,5.303 c-23.062-10.676-22.958-49.423,0.294-59.892c19.175-8.102,43.066-0.069,55.141,16.515c19.141,25.178,19.09,72.125-8.896,100.556 c-44.072,45.361-107.525,38.193-124.585,38.592c-282.477-6.252-288.257,11.765-311.308-27.415 c-13.743-24.013-0.757-42.307,16.117-41.874c29.439-0.388,26.291,51.459-9.069,28.918c17.658,32.25,25.491,27.445,43.308,28.244 c-18.898-16.12-14.951-44.469,10.624-46.745c6.236-0.363,10.227,5.683,12.611,10.641c5.927,12.482-17.365,23.852-17.24,9.449 c1.624-3.489,6.133-3.628,9.156-5.303c-1.313-1.727-1.779-4.198-3.68-5.39c-9.881-4.232-21.369,9.225-15.064,18.208 c4.491,7.065,13.509,13.595,22.112,10.693c15.772-11.868,24.202-30.369,32.615-47.661c-1.969-1.347-3.973-2.678-5.96-3.99 c-1.797,0.777-3.593,1.555-5.39,2.332c0.605,2.574,2.747,5.493,0.674,7.964c-4.871,6.996-18.432,2.349-17.741-6.253 c-0.328-3.87,3.438-5.839,5.718-8.275c-31.734,0.872-63.723-1.108-77.684-29.834c-16.442-35.027-12.701-69.539,18.467-94.614 c18.628-14.603,13.373-58.226-8.586-60.323c-8.534-0.743-18.277,2.246-23.062,9.76c-3.887,6.133-2.246,13.664-1.123,20.367 c1.779-5.113,2.539-10.918,6.392-15.012c8.351-9.041,31.343-8.701,31.837,10.451c0.492,17.903-12.033,38.205-36.571,29.643 c-39.976-12.102-36.165-85.99,13.353-91.694c-1.831-5.113-2.608-12.075-9.311-12.801c0.881-0.916,1.745-1.814,2.608-2.712 c-3.092-1.227-6.15-2.505-9.225-3.766c8.033-7.117,19.279-4.751,28.797-7.653c-0.639-1.727-1.278-3.455-1.917-5.182 c6.875-1.9,14.269-0.328,21.006-2.021c6.253-6.875,15.945-2.608,22.181,1.987c-4.267,1.486-8.499,3.23-12.04,6.098 c1.347,0.415,4.06,1.244,5.424,1.658c-0.104,1.33-0.294,3.973-0.397,5.286c36.944,18.08,49.281,32.026,41.39,82.884 c9.156,11.056,18.553,21.904,27.795,32.891c25.194-27.234,9.033-59.919,13.63-85.234c-8.603,2.557-16.066-4.111-17.983-12.11 c4.595-0.95,7.445,2.833,10.969,4.941c3.299,0.311,5.2-3.42,5.908-6.133c-1.762-5.476-5.666-10.192-5.528-16.221 c-10.721,0.835-6.5,0.096-10.641-6.115c1.365-1.313,2.729-2.608,4.094-3.904c-0.017-2.574,0-5.148,0.052-7.722 c-6.305,10.313-14.804,19.175-25.135,25.497c-0.38,3.593,0.898,8.81-3.369,10.52c-10.399,3.731-22.077-9.259-15.219-18.847 c3.524-5.96,10.831-2.937,15.046,0.432c22.525-41.716,19.502-68.06,70.947-58.751c7.791,2.228,9.467,11.401,11.833,18.035 c2.66-0.777,5.321-1.555,7.981-2.367c4.716,4.094,8.534,9.95,8.43,16.376c-1.434,3.731-4.474,6.53-6.944,9.57 c2.729,1.33,5.442,2.678,8.136,4.06c-0.967,2.626-1.935,5.234-2.919,7.843c12.194,4.728,9.971,2.367,16.152,15.858 c2.522,6.426,6.996,12.351,7.014,19.52c0.501,4.785-0.397,9.967,1.866,14.407c3.714,4.44,9.726,0.622,12.904-2.505 c2.988-4.319-1.883-8.05-4.129-11.332c2.885,1.486,6.443,2.159,8.62,4.751c-0.363,1.313-1.088,3.921-1.451,5.234 c0.38,0.812,0.76,1.641,1.14,2.453c4.716-2.902,9.311,0.311,13.509,2.315c11.793-11.489,14.368-9.936,29.937-6.564 c45.579-46.501,119.963-1.38,192.855,21.438c24.331,7.121,55.798,17.947,192.13,78.134c0.104-2.194,0.224-4.371,0.363-6.547 c2.47,1.244,4.958,2.522,7.428,3.8c-3.904-6.893-4.647-14.753-3.075-22.423c1.918,3.714,4.215,7.255,6.789,10.572 c-0.57-6.875-3.766-15.945,3.8-20.211c0.104,2.125,0.294,6.374,0.397,8.482c4.077-4.319,7.273-9.795,12.887-12.351 c0.846,7.618-7.221,11.401-7.463,18.57c-0.57,6.944-1.658,15.392,3.939,20.712c6.703-1.278,11.902-6.323,17.879-9.346 c15.146-7.781,45.856-14.682,77.339-6.115c11.002,2.812,49.146,6.748,64.97-0.138c17.314-6.691,17.976-10.154,24.15-14.079 c12.025-6.979,25.903,1.469,28.538-54.951c-30.563-12.539-32.049-17.98-37.78-32.77c-29.521,11.971-25.049,12.931-37.279,12.593 c15.566-26.529,25.013-22.678,41.356-22.077c-2.056-3.369-3.351-9.138-8.395-8.672c-45.911-3.073-46.857,1.433-66.404-12.611 c-12.144-15.35-43.279-13.04-47.419-33.496c-1.9-9.674-3.852-20.056-0.639-29.661c7.204,6.927,4.371,17.914,9.328,26.016 c4.146,9.432,15.703,9.622,23.511,14.494c-9.378-27.758-11.536-64.426,9.553-81.347c6.806,8.465-0.363,18.553-2.591,27.26 c-5.182,22.008,0.017,49.095,19.659,62.517c-3.144-7.014-8.015-13.267-10.296-20.661c-0.951-27.062,17.983-31.234,41.701-47.713 c5.355-3.697,10.71-7.463,16.653-10.227c0.846,0.639,2.574,1.917,3.42,2.574c-1.093,6.221-8.008,12.491-13.854,17.344 c-10.227,6.841-24.582,9.225-30.3,21.317c-5.994,12.127,2.539,24.703,7.134,35.759c3.236-26.076-2.967-23.429,30.663-40.751 c10.837-4.661,9.034-18.169,19.486-18.225c2.246,7.67,0.294,16.083-5.735,21.49c3.783,1.209,9.916,1.347,10.572,6.392 c1.422,5.307-10.956,1.495-16.376,0.484c-33.069,3.722-28.266,22.832-28.21,35.88c13.153-20.606,10.624-24.231,20.16-16.618 c-7.739,5.476-9.743,14.977-11.47,23.684c8.43,6.996,19.918,4.871,29.954,6.443c5.839,1.624,9.173,7.273,13.198,11.367 c5.674-1.718,9.671-2.556,16.895-6.34c3.213-1.693,6.236-3.835,9.76-4.906c6.668-1.399,13.336,1.607,20.021,0.916 c10.759-2.831,15.635-14.164,23.407-15.582c3.351,1.607,4.491,5.321,5.908,8.465c-1.244,7.186,3.179,12.766,6.789,18.398 c0.259,7.514-9.864,7.618-14.96,10.14c-4.163,4.474-7.532,9.657-11.643,14.2c-9.227,8.405,32.012,38.149,33.012,39.127 c4.237,4.623,6.835,10.65,12.68,27.847c-2.781-2.66-5.562-5.355-8.309-8.015c4.7,15.875,5.639,14.408,4.837,32.235 c-2.297-1.866-3.956-4.353-5.632-6.754c1.192,6.167,1.261,12.455,1.106,18.709c-1.244,1.123-2.453,2.228-3.662,3.351l-1.036-3.282 c-0.276,1.486-0.829,4.491-1.088,5.977c0,0,65.536-33.459,65.54-33.461c50.654-25.327,104.031-37.451,159.843-37.365 c9.477-16.923,1.868-11.822,15.599-42.375c-4.565-1.419-5.667-1.432-11.211-5.442c-2.263-3.524-2.47-7.653-1.313-11.591 c2.349,1.727,4.681,3.507,7.013,5.286c-3.213-6.824-1.606-14.131,0.795-20.902c1.486,3.576,3.006,7.152,4.595,10.693 c0.777-6.34-0.466-16.256,7.808-17.828c-0.656,2.781-1.261,5.58-1.917,8.361c3.731-3.023,7.463-6.046,11.349-8.862l3.507-0.363 c-1.313,2.488-2.038,5.476-4.336,7.307c-7.895,5.96-10.106,17.327-8.309,26.603c2.349,3.369,6.253,0.708,9.311,0.069 c23.019-9.548,53.898-6.224,73.245,1.227c15.202,8.776,32.114,13.923,49.25,17.482c15.098,3.68,31.371,0.777,44.984-6.461 c20.178-7.63,20.978,8.856,39.386-45.64c-23.794-17.927-24.995-18.813-28.417-38.402c-35.422,6.658-28.219,6.782-37.21,3.472 c20.216-18.292,22.511-16.775,43.152-11.453c-1.555-3.472-1.779-9.173-6.582-9.726c-40.664-11.74-48.074-8.716-63.381-32.096 c-10.365-9.968-27.225-14.476-31.976-29.453c-1.071-10.693-0.604-22.664,5.182-32.027c4.785,8.015,0.069,17.378,3.006,25.843 c1.935,9.726,12.818,12.213,18.899,18.709c-1.658-15.858-1.572-32.494,4.751-47.402c4.267-10.417,9.657-22.077,20.885-26.413 c5.148,10.054-5.442,17.724-8.776,26.309c-8.499,18.985-9.259,44.621,6.305,60.22c-5.459-20.037-9.657-19.927,1.589-36.795 c6.547-9.847,19.261-11.056,29.315-15.461c10.572-3.127,20.281-9.708,31.544-10.088c-0.225,2.021-0.57,4.008-1.019,5.994 c-6.875,6.392-15.478,11.056-24.737,12.766c-34.177,6.947-27.387,24.193-22.82,45.64c2.332-7.359,3.438-15.478,8.085-21.818 c9.104-5.476,19.745-7.549,29.868-10.451c7.673-1.646,14.303-16.922,19.97-12.006c1.399,7.428-3.179,14.355-9.207,18.277 c3.749,1.935,10.002,3.887,8.119,9.467c-5.891,1.866-10.952-3.835-16.774-4.319c-28.374-2.354-28.764,12.398-31.423,27.225 c5.148-5.787,10.071-11.816,15.962-16.895c2.142,1.745,4.06,3.731,5.839,5.873c-8.378,3.541-12.127,12.075-15.53,19.866 c6.374,7.204,16.238,8.447,24.893,11.246c6.133,1.831,8.447,8.482,11.177,13.595c8.205,0.397,16.186-1.676,23.943-4.129 c7.653-2.488,14.494,3.645,21.904,4.336c11.259-0.328,20.881-13.331,26.258-8.396c4.388,6.167-0.829,13.993,2.798,20.367 c0.691,2.729,3.248,6.063,1.071,8.689c-4.198,3.68-10.278,2.522-15.323,3.783c-5.372,4.094-10.313,8.758-15.91,12.559 c6.428,27.223,23.972,34.12,27.329,45.726c2.142,7.635,3.006,15.547,3.973,23.407c-2.177-2.989-4.301-5.994-6.392-9 c1.987,10.589,1.866,21.628-2.246,31.734c-1.106-2.574-2.142-5.131-3.161-7.705c-0.259,8.672-2.505,17.137-6.063,25.014 c-0.397-2.678-0.777-5.338-1.123-8.015c-4.509,10.762-9.881,22.233-21.386,27.069c1.002-2.367,3.023-7.083,4.025-9.449 c-1.296,1.175-3.904,3.507-5.217,4.664c0.38,6.53,4.595,12.334,8.914,16.981c110.784,55.031-75.215-43.171,158.427,79.74 c-0.449-5.096-0.656-10.209-0.484-15.323c2.488,3.144,4.889,6.374,7.342,9.57c-1.123-7.031-3.576-15.893,3.576-20.643 c0.207,2.989,0.397,5.977,0.553,8.983c3.749-4.612,7.324-9.501,12.248-12.973c1.019,5.718-2.643,9.967-5.718,14.234 c-2.298,8.655-2.902,18.916,3.006,26.344c7.202-3.607,37.439-27.466,85.423-19.469c18.052,5.718,37.193,6.34,55.987,5.96 c24.228,0.12,40.461-18.568,48.369-20.453c6.443-1.797,13.008-5.303,15.616-11.85c4.634-11.454,6.495-28.687,6.547-41.148 c-25.06-8.95-31.986-16.269-37.641-32.304c-31.697,13.515-27.034,13.617-37.434,12.213c17.06-23.228,18.075-22.587,41.442-21.801 c-1.606-2.971-3.438-5.822-5.372-8.568c-14.528-0.311-29.022-1.658-43.55-1.831c-10.348-0.017-19.918-5.321-27.484-12.023 c-17.355-18.641-54.166-4.54-47.782-60.6c2.056,1.537,4.785,2.954,5.165,5.822c6.807,34.228,11.145,23.12,28.693,33.928 c-14.454-42.106-2.289-79.99,11.056-80.466c4.543,11.419-4.958,21.334-5.442,32.528c-2.781,20.488,3.196,44.793,21.714,56.333 c-4.422-9.069-13.699-17.707-10.589-28.624c1.969-8.396,5.372-17.447,13.181-22.06c45.862-29.307,38.36-26.835,47.212-27.83 c-0.328,2.626,0.397,5.718-1.624,7.825c-21.771,28.852-61.276,15.469-33.979,68.512c0.812-7.774,0.155-16.014,3.161-23.355 c8.793-9.069,21.179-13.302,31.561-20.16c4.785-5.372,6.409-13.699,14.01-16.273c3.438,7.86,1.227,16.947-5.01,22.664 c3.213,0.916,7.342,0.605,9.743,3.438c1.175,1.71,0.449,3.973,0.691,5.925c-6.935-0.852-26.039-7.594-41.286,8.983 c-4.215,7.152-2.764,16.014-2.85,23.926c12.795-19.495,10.129-23.787,19.261-17.603c-0.276,3.179-3.248,4.992-4.889,7.394 c-2.902,5.252-4.871,11.557-4.958,17.689c8.724,7.929,21.697,3.662,32.079,7.152c4.336,2.349,7.134,6.599,10.296,10.278 c8.188-1.883,15.927-5.269,23.062-9.726c7.843-4.906,16.998,1.019,25.307-1.192c8.309-3.075,13.008-11.367,20.712-15.478 c4.116,2.058,2.837,1.385,4.716,2.418c2.108,4.958,2.315,10.382,3.645,15.547c4.508,8.82,8.924,8.838,2.298,15.202 c-15.739,6.046-7.007-1.562-25.377,21.162c6.913,13.004,16.647,22.826,29.039,30.905c11.539,6.737,14.856,20.747,18.864,32.511 c-2.816-2.539-5.476-5.113-8.154-7.722c1.486,4.267,2.92,8.551,4.267,12.887c125.243-105.583,145.722-149.758,247.702-158.185 c2.795-9.935,5.232-15.256,9.553-24.081c-16.686-6.034-14.258-10.88-13.664-17.275c0.812,0.155,2.47,0.449,3.3,0.605 c1.468,1.451,3.023,2.902,4.595,4.319c-4.655-12.2,0.241-20.348,1.175-22.388c1.175,3.749,2.436,7.497,3.904,11.177 c0.656-4.042,1.192-8.119,1.952-12.144c0.881-1.797,1.866-3.559,2.971-5.251c0.881-0.207,2.66-0.622,3.541-0.829 c-0.536,2.816-1.019,5.632-1.451,8.465c3.869-3.23,7.739-6.495,11.816-9.518c0.829,0.19,2.488,0.553,3.317,0.726 c-3.54,8.596-7.158,7.365-10.503,13.63c-2.47,7.653-5.7,16.48-0.812,23.891c9.484-2.919,18.743-6.772,28.624-8.154 c23.287-1.9,48.128,0.743,68.46,13.042c45.199,19.343,69.185,15.024,86.218,5.804c6.823-3.593,15.461-1.002,21.853-5.873 c9.948-7.376,14.53-24.417,20.661-42.427c-26.346-19.547-26.696-21.34-30.023-40.457c-31.649,5.238-29.22,7.942-39.179,3.714 c21.082-19.111,23.952-18.09,45.501-12.11c-4.073-9.278,5.048-9.05-44.569-20.453c-20.053-4.497-25.909-22.75-33.479-27.45 c-28.124-19.459-34.102-18.082-27.121-55.866c0.881-1.779,2.211-3.109,4.042-3.99c3.783,8.845-0.95,18.674,2.85,27.57 c2.436,9.432,13.371,11.419,19.261,18.121C2378.886,77.528,2380.317,59.677,2393.544,37.651 M286.183,315.947 c-1.33,9-9.587,15.616-18.639,13.371c0.656,1.313,0.622,3.213,2.263,3.8c6.478-2.194,12.593-5.269,18.829-8.067 C287.997,321.976,287.479,318.849,286.183,315.947 M213.128,427.68c18.881,16.895,38.402,34.014,61.636,44.69 c0.207-17.171,2.246-34.204,3.749-51.271C256.695,423.31,235.309,431.515,213.128,427.68z";
    const SANTA_CUTS = [0, 600, 1150, 1625, 2080, 2601.09];          // x ranges: sleigh, deer 1..4
    const SANTA_NOSE = [2500, 200];                                  // lead reindeer's muzzle (viewBox coords)
    const santaOpacity = () => theme() === 'light' ? 0.82 : 0.55;   // far off; darker on the light page (Max, 2026-10-08)

    function buildSanta() {
        santa = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        santa.setAttribute('viewBox', '-60 -40 ' + (SANTA_VB[0] + 120) + ' ' + (SANTA_VB[1] + 80));
        santa.setAttribute('class', 'ss-santa');
        santa.setAttribute('aria-hidden', 'true');
        let defs = '<defs><path id="ss-santa-path" d="' + SANTA_PATH + '"/>';
        let segs = '';
        for (let i = 0; i < SANTA_CUTS.length - 1; i++) {
            const x0 = SANTA_CUTS[i], x1 = SANTA_CUTS[i + 1];
            defs += '<clipPath id="ss-santa-clip' + i + '"><rect x="' + x0 + '" y="-60" width="' + (x1 - x0) + '" height="' + (SANTA_VB[1] + 120) + '"/></clipPath>';
            segs += '<g class="seg" data-cx="' + ((x0 + x1) / 2) + '" clip-path="url(#ss-santa-clip' + i + ')"><use href="#ss-santa-path"/></g>';
        }
        defs += '</defs>';
        santa.innerHTML = defs +
            '<g class="hit ink">' + segs + '</g>' +
            '<circle class="nose" cx="' + SANTA_NOSE[0] + '" cy="' + SANTA_NOSE[1] + '" r="11" fill="#ff3b3b"/>' +
            '<circle cx="' + SANTA_NOSE[0] + '" cy="' + SANTA_NOSE[1] + '" r="17" fill="#ff3b3b" opacity="0.2"/>' +
            '<g fill="#ffd34d">' +
            '<circle class="spark" cx="-20" cy="470" r="7" style="animation-delay:-0.2s"/>' +
            '<circle class="spark" cx="-48" cy="520" r="5" style="animation-delay:-0.5s"/>' +
            '<circle class="spark" cx="-10" cy="560" r="6" style="animation-delay:-0.1s"/>' +
            '<circle class="spark" cx="-40" cy="600" r="4.5" style="animation-delay:-0.4s"/>' +
            '</g>';
        document.body.appendChild(santa);
        santa.querySelector('.hit').addEventListener('click', santaLoop);
        scheduleSanta(new URLSearchParams(location.search).has('santa') ? 3000 : 40000);   // ?santa = demo flyby right away
    }

    function inkSanta() {
        const light = theme() === 'light';
        const g = santa.querySelector('.ink');
        g.setAttribute('fill', light ? '#101a26' : '#dfe9f7');
    }

    function scheduleSanta(ms) {
        clearTimeout(santaTimer);
        santaTimer = setTimeout(flySanta, ms);
    }

    let gallop = [];
    function startGallop() {
        stopGallop();
        santa.querySelectorAll('.seg').forEach((seg, i) => {
            const cx = +seg.dataset.cx;
            gsap.set(seg, { svgOrigin: cx + ' 420' });
            if (i === 0) {   // the sleigh: a gentler, slower sway
                gallop.push(gsap.fromTo(seg, { y: -4, rotation: -1 }, { y: 4, rotation: 1, duration: 0.84, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
            } else {         // each reindeer: a gallop bounce, out of phase with its neighbours
                gallop.push(gsap.fromTo(seg, { y: -9, rotation: -2.5 }, { y: 9, rotation: 2.5, duration: 0.42, yoyo: true, repeat: -1, ease: 'sine.inOut' }).progress((i * 0.23) % 1));
            }
        });
    }
    function stopGallop() { gallop.forEach(t => t.kill()); gallop = []; }

    function flySanta() {
        if (!santa || santaFlying) return;
        if (!window.gsap) { scheduleSanta(180000); return; }
        santaFlying = true;
        inkSanta();
        const w = santa.getBoundingClientRect().width || 620;
        gsap.set(santa, { x: -w - 40, y: 0, rotation: 0, opacity: santaOpacity() });
        startGallop();
        const tl = gsap.timeline({ onComplete: () => { santaFlying = false; stopGallop(); gsap.set(santa, { opacity: 0 }); scheduleSanta(150000 + Math.random() * 90000); } });
        const cross = isPhone() ? 20 : 26;                   // slow: he's far away
        tl.to(santa, { x: W + 60, duration: cross, ease: 'none' }, 0)
          .to(santa, { y: 8, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: Math.round(cross / 2.6) - 1 }, 0);
        santa._tl = tl;
    }

    function santaLoop() {
        if (!window.gsap || !santa || !santaFlying) return;
        if (santa._looping) return;
        santa._looping = true;
        gsap.to(santa, { rotation: '+=360', duration: 1.4, ease: 'power1.inOut', onComplete: () => { santa._looping = false; } });
    }

    // ── Snowmen ────────────────────────────────────────────────────────────────
    function snowmanSvg(side) {
        const flip = '';   // the right snowman is mirrored with CSS on the <svg>, so GSAP can own the inner group's transform
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 120 150');
        svg.setAttribute('class', 'ss-snowman ' + side);
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML =
            '<g' + flip + '>' +
            '<ellipse class="part ball b1" cx="60" cy="118" rx="40" ry="32" fill="#f7fbff" stroke="#c9e3f5" stroke-width="2"/>' +
            '<ellipse class="part ball b2" cx="60" cy="70" rx="29" ry="25" fill="#f7fbff" stroke="#c9e3f5" stroke-width="2"/>' +
            '<circle class="part ball b3" cx="60" cy="32" r="20" fill="#f7fbff" stroke="#c9e3f5" stroke-width="2"/>' +
            '<g class="part face" opacity="0">' +
            '  <circle cx="53" cy="27" r="2.2" fill="#222"/><circle cx="66" cy="27" r="2.2" fill="#222"/>' +
            '  <circle cx="52" cy="40" r="1.3" fill="#222"/><circle cx="56" cy="43" r="1.3" fill="#222"/><circle cx="61" cy="44" r="1.3" fill="#222"/><circle cx="66" cy="43" r="1.3" fill="#222"/>' +
            '  <circle cx="60" cy="62" r="2.4" fill="#222"/><circle cx="60" cy="74" r="2.4" fill="#222"/><circle cx="60" cy="86" r="2.4" fill="#222"/>' +
            '</g>' +
            '<path class="part nose" d="M60 32 l16 3 l-16 3 z" fill="#ff8c2a" opacity="0"/>' +
            '<g class="part scarf" opacity="0">' +
            '  <path d="M38 50 q22 12 44 0 q2 8 -4 10 q-18 8 -36 0 q-6 -2 -4 -10z" fill="#d93636"/>' +
            '  <path d="M72 56 l10 24 l-8 2 l-8 -22z" fill="#d93636"/>' +
            '</g>' +
            '<g class="part arms" opacity="0" stroke="#7a4a1e" stroke-width="3" stroke-linecap="round" fill="none">' +
            '  <path d="M32 66 l-22 -14 m8 2 l-8 -2 l2 8"/><path d="M88 66 l22 -14 m-8 2 l8 -2 l-2 8"/>' +
            '</g>' +
            '<g class="part hat" opacity="0"><rect x="42" y="12" width="36" height="4" rx="2" fill="#222"/><rect x="48" y="-4" width="24" height="18" rx="2" fill="#222"/><rect x="48" y="9" width="24" height="4" fill="#d93636"/></g>' +
            '<ellipse class="mound" cx="60" cy="140" rx="52" ry="12" fill="#f7fbff" stroke="#c9e3f5" stroke-width="2" opacity="0"/>' +
            '</g>';
        return svg;
    }

    function buildSnowmen() {
        snowmen = [snowmanSvg('left'), snowmanSvg('right')];
        snowmen.forEach(s => { s._stage = 0; document.body.appendChild(s); s.addEventListener('click', () => snowmanClick(s)); });
    }

    // Three acts per snowman (Max, 2026-10-08): 1st click = shiver + hat flip · 2nd = the carrot nose falls off ·
    // 3rd = collapse into a mound, then ~60 s later it rebuilds itself and the count starts over.
    function snowmanClick(s) {
        if (!window.gsap || s._busy || s._hatBusy || !s.classList.contains('show')) return;   // the act-1 hat flip counts as busy too
        if (+gsap.getProperty(s.querySelector('.hat'), 'opacity') < 1) return;     // not assembled yet
        const stage = s._stage || 0;
        if (stage === 0) { s._stage = 1; shiverThenHat(s); }
        else if (stage === 1) { s._stage = 2; noseFalls(s); }
        else { s._stage = 3; collapse(s); }
    }

    function shiverThenHat(s) {
        const body = s.querySelector('g');
        s._busy = true;
        gsap.timeline({ onComplete: () => { gsap.set(body, { x: 0, rotation: 0 }); s._busy = false; hatFlip(s); } })
            .to(body, { x: -3, rotation: -2, duration: 0.07, transformOrigin: '50% 100%' })
            .to(body, { x: 3, rotation: 2, duration: 0.07, repeat: 7, yoyo: true })
            .to(body, { x: 0, rotation: 0, duration: 0.12 });
    }

    function noseFalls(s) {
        const nose = s.querySelector('.nose');
        s._busy = true;
        gsap.timeline({ onComplete: () => { s._busy = false; } })
            .to(nose, { rotation: 60, y: 6, duration: 0.25, ease: 'power1.in', transformOrigin: '0% 50%' })
            .to(nose, { y: 104, rotation: 150, duration: 0.6, ease: 'power2.in' })
            .to(nose, { y: 98, duration: 0.12, ease: 'power1.out' })
            .to(nose, { y: 104, duration: 0.14, ease: 'power1.in' })
            .to(nose, { opacity: 0, duration: 0.8, delay: 1.2 });               // sinks into the snow
    }

    function collapse(s) {
        const q = sel => s.querySelector(sel);
        s._busy = true;
        gsap.timeline({ onComplete: () => { s._busy = false; s._rebuildT = setTimeout(() => rebuildSnowman(s), 60000); } })
            .to(q('.hat'), { y: -30, rotation: -40, duration: 0.3, ease: 'power2.out' }, 0)
            .to(q('.hat'), { y: 60, rotation: -140, duration: 0.6, ease: 'power2.in' }, 0.3)
            .to(q('.b3'), { y: 20, scaleY: 0.6, duration: 0.5, ease: 'power2.in', transformOrigin: '50% 100%' }, 0.1)
            .to(q('.face'), { y: 20, opacity: 0, duration: 0.4 }, 0.1)
            .to([q('.b2'), q('.b3')], { y: '+=48', scaleY: 0.35, scaleX: 1.25, duration: 0.5, ease: 'power3.in' }, 0.45)
            .to([q('.scarf'), q('.arms')], { y: 50, opacity: 0, duration: 0.4 }, 0.45)
            .to(q('.b1'), { scaleY: 0.3, scaleX: 1.3, duration: 0.45, ease: 'power3.in', transformOrigin: '50% 100%' }, 0.8)
            .to([q('.b1'), q('.b2'), q('.b3'), q('.hat')], { opacity: 0, duration: 0.5 }, 1.2)
            .to(q('.mound'), { opacity: 1, duration: 0.5 }, 1.1);
    }

    function rebuildSnowman(s) {
        if (!snowCanvas || !s.isConnected) return;   // switched off (or off and on again) since the collapse
        const q = sel => s.querySelector(sel);
        gsap.killTweensOf(s.querySelectorAll('.part, .mound'));
        s.querySelectorAll('.part').forEach(p => gsap.set(p, { clearProps: 'all' }));
        gsap.set(['.b1', '.b2', '.b3'].map(q), { scale: 0, opacity: 1, transformOrigin: '50% 100%' });
        gsap.set(['.face', '.nose', '.scarf', '.arms', '.hat'].map(q), { opacity: 0 });
        s._stage = 0;
        gsap.timeline({ onStart: () => { s._busy = true; }, onComplete: () => { s._busy = false; } })
            .to(q('.mound'), { opacity: 0, duration: 0.8 })
            .add(assembleTimeline(s), '-=0.4');
    }

    // Click a snowman: the hat jumps off, does a full flip in the air, lands back on the head and settles.
    function hatFlip(s) {
        if (!window.gsap || s._hatBusy) return;
        const hat = s.querySelector('.hat');
        if (+gsap.getProperty(hat, 'opacity') < 1) return;     // not assembled yet
        s._hatBusy = true;
        gsap.set(hat, { transformOrigin: '50% 50%', rotation: 0, y: 0 });
        gsap.timeline({ onComplete: () => { gsap.set(hat, { rotation: 0 }); s._hatBusy = false; } })
            .to(hat, { y: -48, duration: 0.42, ease: 'power2.out' }, 0)
            .to(hat, { rotation: 360, duration: 0.8, ease: 'power1.inOut' }, 0.04)
            .to(hat, { y: 0, duration: 0.4, ease: 'power2.in' }, 0.44)
            .to(hat, { y: -6, rotation: 372, duration: 0.14, ease: 'power1.out' })
            .to(hat, { y: 0, duration: 0.36, ease: 'bounce.out' })
            .to(hat, { rotation: 360, duration: 0.7, ease: 'elastic.out(1, 0.3)' }, '<');
    }

    function assembleTimeline(s) {
        const q = sel => s.querySelector(sel);
        return gsap.timeline()
            .to(q('.b1'), { scale: 1, duration: 1.4, ease: 'elastic.out(1, 0.6)' })
            .to(q('.b2'), { scale: 1, duration: 1.2, ease: 'elastic.out(1, 0.6)' }, '-=0.6')
            .to(q('.b3'), { scale: 1, duration: 1.0, ease: 'elastic.out(1, 0.6)' }, '-=0.5')
            .to([q('.face'), q('.nose')], { opacity: 1, duration: 0.6 })
            .to(q('.scarf'), { opacity: 1, duration: 0.6 }, '-=0.3')
            .to(q('.arms'), { opacity: 1, duration: 0.6 }, '-=0.3')
            .to(q('.hat'), { opacity: 1, duration: 0.6 }, '-=0.2');
    }

    function maybeBuildSnowmen(now) {
        if (snowmenBuilt) return;
        let sum = 0; for (let i = 0; i < pile.length; i++) sum += pile[i];
        const avg = sum / Math.max(1, pile.length);
        if (avg < (isPhone() ? 4 : 6) && now - startedAt < 60000) return;
        snowmenBuilt = true;
        snowmen.forEach((s, idx) => {
            s.classList.add('show');
            const q = (sel) => s.querySelector(sel);
            if (window.gsap) {
                gsap.set([q('.b1'), q('.b2'), q('.b3')], { scale: 0, transformOrigin: '50% 100%' });   // balls grow up from the snow
                gsap.timeline({ delay: idx * 1.6 }).add(assembleTimeline(s));
            } else {
                s.querySelectorAll('.part').forEach(p => p.setAttribute('opacity', '1'));
            }
        });
    }

    // ── Lights ─────────────────────────────────────────────────────────────────
    function buildLights() {
        lightsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        lightsSvg.setAttribute('class', 'ss-lights');
        lightsSvg.setAttribute('aria-hidden', 'true');
        lightsSvg.innerHTML = '<defs><filter id="ss-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>';
        document.body.appendChild(lightsSvg);
        layoutLights();
    }

    const WIRE = '#111';           // wire and sockets: black in both themes (Max)
    function bulbMarkup(x, y, color) {
        const tw = (1.8 + Math.random() * 2.2).toFixed(2), td = (-Math.random() * 3).toFixed(2);
        return '<g transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')">' +
            '<g class="swing" style="transform-box: fill-box; transform-origin: 50% 0%;">' +
            '<rect x="-2" y="0" width="4" height="4" rx="1" fill="' + WIRE + '"/>' +
            '<ellipse class="bulb" cx="0" cy="10" rx="5.5" ry="7.5" fill="' + color + '" opacity="0.45" style="--tw:' + tw + 's;--td:' + td + 's"/>' +
            '<ellipse class="bulb" cx="0" cy="10" rx="3.2" ry="5" fill="' + color + '" style="--tw:' + tw + 's;--td:' + td + 's"/>' +
            '<ellipse cx="-1" cy="8" rx="0.9" ry="1.6" fill="#fff" opacity="0.7"/>' +
            '<circle class="bulb-hit" cx="0" cy="9" r="9" fill="transparent"/>' +
            '</g></g>';
    }

    function wireBulbs(g, points, wireD, colorOffset) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', wireD);
        path.setAttribute('fill', 'none'); path.setAttribute('stroke', WIRE); path.setAttribute('stroke-width', '1.6');
        g.appendChild(path);
        g.insertAdjacentHTML('beforeend', points.map((pt, i) => bulbMarkup(pt[0], pt[1], BULB_COLORS[(i + colorOffset) % BULB_COLORS.length])).join(''));
    }

    function layoutLights() {
        if (!lightsSvg) return;
        strings.forEach(s => s.g.remove());
        strings.length = 0;
        const mk = () => document.createElementNS('http://www.w3.org/2000/svg', 'g');

        // the one garland, under the page title. The SVG is document-sized and scrolls with the page,
        // so the string is placed once in document coords: wire just under the last line, spanning only that line's
        // words (never past the last letter), bulbs below it.
        const title = document.querySelector('.rec-title');
        const lines = title && !title.closest('[hidden]') ? lineRects(title) : [];
        if (lines.length) {
            const r = title.getBoundingClientRect(), last = lines[lines.length - 1];
            const width = last.right - last.left;
            const n = Math.max(3, Math.min(14, Math.round(width / 50)));
            const sag = Math.min(10, width / 40);
            const pts = [];
            for (let i = 1; i <= n; i++) { const t = i / (n + 1); pts.push([width * t, 2 * (1 - t) * t * (sag * 2)]); }
            const g = mk();
            wireBulbs(g, pts, 'M0 0 Q ' + (width / 2) + ' ' + (sag * 2) + ' ' + width + ' 0', 0);
            g.setAttribute('class', 'ss-garland-title');
            g.setAttribute('transform', 'translate(' + (last.left + window.scrollX).toFixed(1) + ' ' + (r.bottom - 1 + window.scrollY).toFixed(1) + ')');
            lightsSvg.appendChild(g);
            strings.push({ el: title, g, width, kind: 'title' });
        }

        lightsSvg.querySelectorAll('.bulb-hit').forEach(hit => {
            const swing = hit.closest('.swing');
            hit.addEventListener('click', () => {
                if (!window.gsap) return;
                gsap.killTweensOf(swing);
                gsap.fromTo(swing, { rotation: 0 }, { rotation: (Math.random() < 0.5 ? -1 : 1) * 42, duration: 0.18, ease: 'power2.out',
                    onComplete: () => gsap.to(swing, { rotation: 0, duration: 2.4, ease: 'elastic.out(1, 0.18)' }) });
            });
        });
    }

    // ── Frost ──────────────────────────────────────────────────────────────────
    // What shows = the base vignette minus a wipe mask. A wipe cuts both at once; refrosting fades the mask, so wiped
    // patches grow back to the base (never past it) in steps big enough to register in the canvas's 8-bit alpha.
    let frostBase = null, frostMask = null, maskCtx = null;
    function paintFrostBase() {
        if (!frostCtx) return;
        if (!frostBase) { frostBase = document.createElement('canvas'); frostMask = document.createElement('canvas'); maskCtx = frostMask.getContext('2d'); }
        [frostBase, frostMask].forEach(c => { c.width = frostCanvas.width; c.height = frostCanvas.height; });   // resizing clears both
        maskCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
        const ctx = frostBase.getContext('2d');
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        const tint = theme() === 'light' ? '170,210,240' : '210,232,250';
        const maxA = theme() === 'light' ? 0.34 : 0.26;
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
        g.addColorStop(0, 'rgba(' + tint + ',0)');
        g.addColorStop(1, 'rgba(' + tint + ',' + maxA + ')');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // crystalline texture along the edges
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        const n = Math.round((W + H) / 6);
        for (let i = 0; i < n; i++) {
            const edge = Math.random();
            const d = Math.pow(Math.random(), 2.2) * Math.min(W, H) * 0.22;
            let x, y;
            if (edge < 0.25) { x = Math.random() * W; y = d; }
            else if (edge < 0.5) { x = Math.random() * W; y = H - d; }
            else if (edge < 0.75) { x = d; y = Math.random() * H; }
            else { x = W - d; y = Math.random() * H; }
            ctx.beginPath(); ctx.arc(x, y, 1 + Math.random() * 2.5, 0, Math.PI * 2); ctx.fill();
        }
        composeFrost();
    }

    function composeFrost() {
        const ctx = frostCtx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'copy'; ctx.drawImage(frostBase, 0, 0);
        ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(frostMask, 0, 0);
        ctx.restore();
    }

    function refrost() {                                    // every 0.5 s: wipes fade ~5%, so a patch is back in ~30 s
        if (!frostCtx || !maskCtx) return;
        maskCtx.globalCompositeOperation = 'destination-out';
        maskCtx.fillStyle = 'rgba(0,0,0,0.05)';
        maskCtx.fillRect(0, 0, W, H);
        maskCtx.globalCompositeOperation = 'source-over';
        composeFrost();
    }

    function wipeFrost(x, y) {
        if (!frostCtx || !maskCtx) return;
        const g = frostCtx.createRadialGradient(x, y, 4, x, y, 46);
        g.addColorStop(0, 'rgba(0,0,0,0.9)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        frostCtx.globalCompositeOperation = 'destination-out';   // immediate feedback
        frostCtx.fillStyle = g;
        frostCtx.fillRect(x - 46, y - 46, 92, 92);
        frostCtx.globalCompositeOperation = 'source-over';
        maskCtx.fillStyle = g;                                   // and remembered, so refrosting knows what to give back
        maskCtx.fillRect(x - 46, y - 46, 92, 92);
    }

    // ── Toggle ─────────────────────────────────────────────────────────────────
    function buildToggle() {
        toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'ss-snow-toggle';
        toggleBtn.textContent = '❄';
        toggleBtn.title = 'Snow on / off';
        toggleBtn.setAttribute('aria-label', 'Toggle the snow');
        toggleBtn.setAttribute('aria-pressed', String(enabled));
        toggleBtn.addEventListener('click', () => {
            enabled = !enabled;
            toggleBtn.setAttribute('aria-pressed', String(enabled));
            try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch (e) { /* ignore */ }
            if (enabled) { build(); startedAt = performance.now() - START_DELAY_MS; } else teardown();
        });
        document.body.appendChild(toggleBtn);
    }

    // theme flips repaint the frost so the tint matches (and re-ink Santa if he's mid-flight)
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', () => setTimeout(() => {
        paintFrostBase(); targets.forEach(t => { t.dirty = true; });
        if (santaFlying) { inkSanta(); gsap.set(santa, { opacity: santaOpacity() }); }
    }, 50));

    // the form shows/hides after the gate check; re-measure the page (layer height, targets, lights) then
    const mo = new MutationObserver(() => { if (snowCanvas) measure(); });
    const form = document.getElementById('ss-form'), status = document.getElementById('ss-status');
    [form, status].forEach(n => n && mo.observe(n, { attributes: true, attributeFilter: ['hidden'] }));

    function init() {
        buildToggle();
        if (enabled) build();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
