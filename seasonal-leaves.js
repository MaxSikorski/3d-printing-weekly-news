/* seasonal-leaves.js — autumn leaves on the HOMEPAGE (per-site file; loaded by config.js, engine untouched).
 *
 * Season: Sep 22 → Nov 20 (Eastern), or force any day with ?leaves in the URL. Off-season it does nothing.
 *   1. Two-second hush, then leaves (red / orange / yellow, Max's leaf SVG) tumble down.
 *   2. Leaves settle on the hero title's lines and on the top edge of every deck card, all at the same rate
 *      (one global accumulation level; each surface has its own fixed random arrangement, so the piles differ).
 *   3. A loose pile builds along the bottom of the window; the cursor or a finger sweeps it aside.
 *   4. 🍂 button bottom-left turns it off and remembers (localStorage "seasons"); reduce-motion users start off.
 * Seasonal colour is the sanctioned exception to the monochrome rule (Max, 2026-10-08). Plan: future features/seasonal-effects-plan.md
 */
(function () {
    'use strict';
    const LEAF_PATH = "M60.893,1.549c-0.136-0.269-0.386-0.462-0.679-0.525c-2.98-0.652-6.97-0.982-11.856-0.982 c-4.922,0-10.564,0.353-15.481,0.967C17.641,2.912,7,13.601,7,27v18.678L3.103,60.225c-0.428,1.598,0.523,3.244,2.122,3.674 c1.598,0.426,3.245-0.525,3.673-2.121L11.25,53H31c14.337,0,26-11.663,26-26c0-6.663,0-15.788,3.914-24.594 C61.036,2.132,61.028,1.816,60.893,1.549z M6.966,61.26c-0.143,0.532-0.691,0.849-1.224,0.707c-0.534-0.145-0.851-0.691-0.708-1.225 l2.552-9.686c0.405,0.672,0.998,1.212,1.712,1.55L6.966,61.26z M52.347,8.938c-0.073,0.027-6.014,2.301-14.545,9.321 c5.572-0.588,10.233,0.712,10.473,0.779c0.531,0.152,0.838,0.705,0.687,1.235C48.836,20.713,48.436,21,48,21 c-0.091,0-0.183-0.013-0.274-0.038c-0.064-0.019-6.464-1.784-12.916-0.135c-1.325,1.187-2.692,2.47-4.103,3.88 c-1.642,1.643-3.115,3.228-4.456,4.752c10.211-2.021,19.587,0.46,20.012,0.576c0.533,0.146,0.847,0.694,0.702,1.228 C46.844,31.708,46.44,32,46,32c-0.087,0-0.175-0.012-0.263-0.035c-0.107-0.029-10.88-2.889-21.475,0 c-0.051,0.014-0.103,0.016-0.154,0.021c-2.702,3.302-4.692,6.203-6.108,8.52c10.2-2.115,18.897,0.418,19.287,0.536 c0.529,0.159,0.829,0.716,0.671,1.244C37.828,42.72,37.431,43,37,43c-0.095,0-0.191-0.014-0.287-0.042 c-0.097-0.028-9.653-2.805-20.092-0.079c-1.184,2.166-1.671,3.434-1.684,3.468C14.788,46.75,14.406,47,14,47 c-0.115,0-0.232-0.021-0.347-0.062c-0.518-0.191-0.782-0.766-0.592-1.283c0.057-0.152,0.627-1.652,2.01-4.141 c1.837-9.547-0.028-18.21-0.048-18.297c-0.119-0.539,0.221-1.073,0.76-1.192c0.543-0.127,1.073,0.22,1.193,0.759 c0.069,0.312,1.422,6.557,0.713,14.457c1.414-2.121,3.204-4.565,5.464-7.261c1.693-10.294-0.111-18.677-0.13-18.763 c-0.119-0.539,0.221-1.073,0.76-1.193c0.539-0.116,1.073,0.221,1.193,0.76c0.073,0.33,1.569,7.275,0.571,16.458 c1.154-1.277,2.388-2.591,3.745-3.948c1.285-1.285,2.529-2.454,3.744-3.557v-0.008c1.873-6.556,0.052-11.312,0.033-11.359 c-0.202-0.513,0.049-1.094,0.562-1.297c0.51-0.206,1.092,0.044,1.297,0.557c0.075,0.188,1.599,4.106,0.657,9.863 C44.85,9.642,51.328,7.182,51.654,7.062c0.518-0.188,1.092,0.073,1.283,0.592C53.129,8.171,52.864,8.746,52.347,8.938z";                        // svg animations/leaf-svgrepo-com.svg (viewBox 0 0 64 64)
    const COLORS = ['#c0392b', '#d64533', '#e67e22', '#f0932b', '#e9b949', '#f1c40f'];
    const START_DELAY_MS = 2000, RAMP_MS = 18000, FILL_MS = 150000;   // accumulation: 0 → full over ~2.5 min
    const STORAGE_KEY = 'seasons';
    const forced = new URLSearchParams(location.search).has('leaves');
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isPhone = () => window.innerWidth < 700;

    function inSeason() {
        if (forced) return true;
        const now = new Date(), y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
        const md = m * 100 + d;
        return md >= 922 && md <= 1120;
    }
    if (!inSeason()) return;

    let enabled = (function () {
        try { const v = localStorage.getItem(STORAGE_KEY); if (v === 'off') return false; if (v === 'on') return true; } catch (e) { /* ignore */ }
        return !reduceMotion;
    })();

    const style = document.createElement('style');
    style.textContent = `
    .sl-fall, .sl-rest { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .sl-fall { z-index: 6; }
    .sl-rest { position: absolute; inset: auto; top: 0; left: 0; z-index: 5; }
    .sl-toggle { position: fixed; left: 14px; bottom: 14px; z-index: 60; width: 40px; height: 40px; border-radius: 50%;
        border: 1px solid var(--card-border); background: var(--card-bg); color: var(--text-color); font-size: 18px; line-height: 1;
        cursor: pointer; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; opacity: 0.8; }
    .sl-toggle:hover { opacity: 1; }
    .sl-toggle[aria-pressed="false"] { opacity: 0.45; }
    `;
    document.head.appendChild(style);

    // ── sprites: the leaf path pre-rendered per colour ──────────────────────
    const leafPath = new Path2D(LEAF_PATH);
    const SPRITE = 44;                                  // px, drawn at DPR
    let sprites = [];
    function makeSprites() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        sprites = COLORS.map(c => {
            const cv = document.createElement('canvas'); cv.width = cv.height = SPRITE * dpr;
            const x = cv.getContext('2d'); x.scale(dpr, dpr); x.scale(SPRITE / 64, SPRITE / 64);
            x.fillStyle = c; x.fill(leafPath);
            return cv;
        });
    }
    function drawLeaf(ctx, sprite, x, y, size, rot, alpha) {
        ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rot);
        ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalAlpha = 1;
    }

    // ── state ────────────────────────────────────────────────────────────────
    let fallCanvas, fallCtx, restCanvas, restCtx, toggleBtn;
    let W = 0, H = 0, DPR = 1, docH = 0;
    let leaves = [];                                    // falling
    let pile = [];                                      // settled along the window bottom: {x, y, size, rot, s, a}
    let targets = [];                                   // {el, line:{x,y,w} in page coords, slots:[{dx, size, rot, s, dy}]}
    let level = 0;                                      // global accumulation 0..1
    let rafId = 0, startedAt = 0, lastT = 0;
    let pointer = { x: -1, y: -1 };
    let restDirty = true;

    function build() {
        if (fallCanvas) return;
        fallCanvas = document.createElement('canvas'); fallCanvas.className = 'sl-fall';
        restCanvas = document.createElement('canvas'); restCanvas.className = 'sl-rest';
        document.body.appendChild(restCanvas); document.body.appendChild(fallCanvas);
        fallCtx = fallCanvas.getContext('2d'); restCtx = restCanvas.getContext('2d');
        makeSprites();
        resize();
        window.addEventListener('resize', onResize);
        document.addEventListener('pointermove', onPointerMove, { passive: true });
        document.addEventListener('visibilitychange', onVisibility);
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
        startedAt = performance.now(); lastT = startedAt;
        rafId = requestAnimationFrame(tick);
    }
    function teardown() {
        cancelAnimationFrame(rafId); rafId = 0;
        mo.disconnect();
        [fallCanvas, restCanvas].forEach(n => n && n.remove());
        fallCanvas = restCanvas = null; leaves = []; pile = []; targets = []; level = 0;
        window.removeEventListener('resize', onResize);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('visibilitychange', onVisibility);
    }
    function onVisibility() {
        if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
        else if (!rafId && fallCanvas) { lastT = performance.now(); rafId = requestAnimationFrame(tick); }
    }
    let resizeT = 0;
    function onResize() { clearTimeout(resizeT); resizeT = setTimeout(resize, 120); }
    function resize() {
        W = window.innerWidth; H = window.innerHeight; DPR = Math.min(window.devicePixelRatio || 1, 1.5);
        fallCanvas.width = W * DPR; fallCanvas.height = H * DPR; fallCanvas.style.width = W + 'px'; fallCanvas.style.height = H + 'px';
        fallCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
        makeSprites();
        measure();
    }

    // ── targets: hero title lines + deck card tops, measured in PAGE coords ──
    let measureT = 0;
    const mo = new MutationObserver(() => { clearTimeout(measureT); measureT = setTimeout(measure, 80); });
    function lineRects(el) {
        const r = document.createRange(); r.selectNodeContents(el);
        return [...r.getClientRects()].filter(b => b.width > 8 && b.height > 8);
    }
    function measure() {
        if (!restCanvas) return;
        const sx = window.scrollX, sy = window.scrollY;
        const old = new Map(targets.map(t => [t.key, t]));
        const next = [];
        const hero = document.querySelector('.hero-title');
        if (hero) lineRects(hero).forEach((b, i) => {
            const fs = parseFloat(getComputedStyle(hero).fontSize) || 48;
            next.push(mk('hero' + i, b.left + sx, b.top + sy + fs * 0.22, b.width, 0.9));
        });
        document.querySelectorAll('.archive-card').forEach((card, i) => {
            const b = card.getBoundingClientRect();
            if (b.width < 20 || b.height < 10 || card.closest('[hidden]')) return;
            const cs = getComputedStyle(card);
            const r = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, b.width / 2);
            next.push(mk('card' + i + ':' + (card.getAttribute('href') || ''), b.left + sx + r * 0.6, b.top + sy, b.width - r * 1.2, 1));
        });
        function mk(key, x, y, w, dens) {
            const prev = old.get(key);
            const t = { key, x, y, w };
            if (prev && Math.abs(prev.w - w) < 2) { t.slots = prev.slots; return t; }
            const n = Math.max(2, Math.round(w / 26 * dens));
            const slots = [];
            for (let k = 0; k < n; k++) slots.push({ dx: (k + 0.2 + Math.random() * 0.6) / n * w, size: 16 + Math.random() * 12,
                rot: (Math.random() - 0.5) * 1.6, s: Math.floor(Math.random() * sprites.length), dy: -Math.random() * 4, order: Math.random() });
            // fill order is fixed per target so the pile grows in the same way every frame
            slots.sort((a, b) => a.order - b.order);
            t.slots = slots; return t;
        }
        targets = next;
        const newDocH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        if (newDocH !== docH || restCanvas.width !== Math.round(W * DPR)) {
            docH = newDocH;
            restCanvas.width = Math.round(W * DPR); restCanvas.height = Math.round(docH * DPR);
            restCanvas.style.width = W + 'px'; restCanvas.style.height = docH + 'px';
            restCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
        }
        restDirty = true;
    }

    // ── falling leaves ───────────────────────────────────────────────────────
    function spawn() {
        const depth = Math.random();
        leaves.push({ x: Math.random() * (W + 60) - 30, y: -30, size: 14 + depth * 16, vy: 28 + depth * 40,
            drift: Math.random() * 6.28, sway: 0.5 + Math.random(), rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 2.5,
            s: Math.floor(Math.random() * sprites.length), a: 0.75 + depth * 0.25 });
    }
    const maxLeaves = () => Math.min(isPhone() ? 36 : 80, Math.round((W * H) / 16000));

    function tick(now) {
        rafId = requestAnimationFrame(tick);
        const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
        const age = now - startedAt;
        if (age < START_DELAY_MS) return;
        const ramp = Math.min(1, (age - START_DELAY_MS) / RAMP_MS);
        const want = maxLeaves() * (0.1 + 0.9 * ramp);
        for (let n = want * 0.25 * dt + Math.random(); n >= 1 && leaves.length < want; n--) spawn();
        const newLevel = Math.min(1, (age - START_DELAY_MS) / FILL_MS);
        if (newLevel !== level) { level = newLevel; restDirty = true; }

        const ctx = fallCtx; ctx.clearRect(0, 0, W, H);
        const wind = Math.sin(now / 3000) * 18;
        const pileCap = isPhone() ? 14 : 36;
        for (let i = leaves.length - 1; i >= 0; i--) {
            const f = leaves[i];
            f.drift += dt * f.sway; f.rot += f.spin * dt;
            f.x += (Math.sin(f.drift) * 22 + wind) * dt; f.y += f.vy * dt;
            if (f.x < -40) f.x = W + 30; else if (f.x > W + 40) f.x = -30;
            if (f.y > H - 6 - f.size * 0.3) {
                if (pile.length < pileCap * 4) pile.push({ x: f.x, y: H - 4 - Math.random() * 10, size: f.size, rot: (Math.random() - 0.5) * 0.8 + (Math.random() < 0.5 ? 0 : 3.14), s: f.s, a: 1 });
                leaves.splice(i, 1); continue;
            }
            drawLeaf(ctx, sprites[f.s], f.x, f.y, f.size, f.rot, f.a);
        }
        // the pile along the window bottom, swept by the pointer
        if (pointer.x >= 0 && pointer.y > H - 60) {
            for (const p of pile) { const d = p.x - pointer.x; if (Math.abs(d) < 70) { p.x += (d < 0 ? -1 : 1) * (70 - Math.abs(d)) * 4 * dt; p.rot += dt * 2; } }
        }
        for (const p of pile) { if (p.x < -20) p.x = -20; if (p.x > W + 20) p.x = W + 20; drawLeaf(ctx, sprites[p.s], p.x, p.y, p.size, p.rot, 1); }

        if (restDirty) drawRest();
    }

    // settled leaves on the title lines and card tops (page-anchored layer, redrawn only when something changes)
    function drawRest() {
        restDirty = false;
        const ctx = restCtx; ctx.clearRect(0, 0, W, docH);
        for (const t of targets) {
            const n = Math.round(t.slots.length * level);
            for (let k = 0; k < n; k++) {
                const s = t.slots[k];
                drawLeaf(ctx, sprites[s.s], t.x + s.dx, t.y + s.dy - s.size * 0.28, s.size, s.rot, 1);
            }
        }
    }

    function onPointerMove(e) { pointer.x = e.clientX; pointer.y = e.clientY; }

    // ── toggle ───────────────────────────────────────────────────────────────
    function buildToggle() {
        toggleBtn = document.createElement('button');
        toggleBtn.type = 'button'; toggleBtn.className = 'sl-toggle'; toggleBtn.textContent = '🍂';
        toggleBtn.title = 'Leaves on / off'; toggleBtn.setAttribute('aria-label', 'Toggle the falling leaves');
        toggleBtn.setAttribute('aria-pressed', String(enabled));
        toggleBtn.addEventListener('click', () => {
            enabled = !enabled; toggleBtn.setAttribute('aria-pressed', String(enabled));
            try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch (e) { /* ignore */ }
            if (enabled) { build(); startedAt = performance.now() - START_DELAY_MS; } else teardown();
        });
        document.body.appendChild(toggleBtn);
    }

    function init() { buildToggle(); if (enabled) build(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
