/* ============================================================
   Presenter Engine — Slide navigation, timer, QR, TOC
   ============================================================ */

(function () {
    'use strict';

    // === State ===
    let weekData = null;
    let slides = [];
    let currentSlide = 0;
    let timerInterval = null;
    let timerSeconds = 20 * 60; // countdown from 20:00
    let timerRunning = false;
    let timerStarted = false;
    let qrVisible = false;
    let tocOpen = false;
    let overviewSlideIndex = 1; // index of the overview slide

    // === DOM Elements ===
    const presentation = document.getElementById('presentation');
    const loadingState = document.getElementById('loading-state');
    const progressBar = document.getElementById('progress-bar');
    const slideCounter = document.getElementById('slide-counter');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const timerDisplay = document.getElementById('timer-display');
    const tocOverlay = document.getElementById('toc-overlay');
    const tocSidebar = document.getElementById('toc-sidebar');
    const tocList = document.getElementById('toc-list');
    const tocClose = document.getElementById('toc-close');
    const tocToggleBtn = document.getElementById('toc-toggle-btn');
    const qrOverlay = document.getElementById('qr-overlay');
    const qrCanvas = document.getElementById('qr-canvas');
    const qrLabel = document.getElementById('qr-label');
    const qrToggleBtn = document.getElementById('qr-toggle-btn');
    const presenterControls = document.getElementById('presenter-controls');
    const keyboardHints = document.getElementById('keyboard-hints');
    const slideCreditContact = document.getElementById('slide-credit-contact');

    // === Branding / contact (Max Sikorski) ===
    // Email is assembled at runtime so plain-text scrapers don't harvest it off the page.
    const CONTACT_EMAIL = ['3dmax.ow6p08', 'bumpmail.io'].join('@');
    const LINKS = {
        youtube: 'https://www.youtube.com/@maxwellsikorski4926',
        meetup: 'https://www.meetup.com/3d-printing-club/',
        github: 'https://github.com/MaxSikorski',
        discord: 'https://discord.gg/pnFyeAZJsk',
        buzz: 'https://buzz.xyz/'
    };
    function contactMailto(topicTitle) {
        const subject = topicTitle
            ? `3D Printing Weekly — interested in: ${topicTitle}`
            : '3D Printing Weekly — getting in touch';
        const body = topicTitle
            ? `Hi Max,\n\nI was going through this week's 3D Printing Weekly and I'm interested in "${topicTitle}".\n\n`
            : 'Hi Max,\n\nI came across 3D Printing Weekly and wanted to get in touch.\n\n';
        return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }
    const WORK_WITH_MAILTO = (() => {
        const subject = '3D Printing Weekly — Work With You (print farm / R&D / CAD)';
        const body = "Hi Max,\n\nI'd like to talk about working together — print farm / R&D / manufacturing / CAD classes.\n\n";
        return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    })();

    // === Utility: Extract YouTube embed URL ===
    function getYouTubeEmbedUrl(url) {
        if (!url) return null;
        let videoId = null;
        let startTime = '';

        // Handle youtu.be short URLs
        const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
        if (shortMatch) {
            videoId = shortMatch[1];
        }

        // Handle youtube.com URLs
        const longMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (longMatch) {
            videoId = longMatch[1];
        }

        if (!videoId) return null;

        // Extract timestamp
        const timeMatch = url.match(/[?&]t=(\d+)/);
        if (timeMatch) {
            startTime = `&start=${timeMatch[1]}`;
        }

        return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1${startTime}`;
    }

    // === Utility: Simple QR Code Generator ===
    // Minimal QR code generator (alphanumeric, for URLs)
    // Using a canvas-based approach with the QR algorithm
    function generateQR(text, canvas, size) {
        if (!canvas || !text) return;

        // Use a simple encoding: render as a visual code-like pattern
        // For a real QR code, we'll use a lightweight inline implementation
        const ctx = canvas.getContext('2d');
        canvas.width = size;
        canvas.height = size;

        // Generate QR matrix using the embedded micro-library
        const qr = QREncoder.encode(text);
        const modules = qr.modules;
        const moduleCount = qr.moduleCount;
        const cellSize = size / moduleCount;

        // Background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        // Modules
        ctx.fillStyle = '#000000';
        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                if (modules[row][col]) {
                    ctx.fillRect(
                        Math.round(col * cellSize),
                        Math.round(row * cellSize),
                        Math.ceil(cellSize),
                        Math.ceil(cellSize)
                    );
                }
            }
        }
    }

    // === Minimal QR Code Encoder ===
    // Embedded lightweight QR code encoder (Mode: Byte, EC Level: L)
    const QREncoder = (function () {
        // QR Code generator adapted for minimal size
        // Supports up to ~150 chars at EC level L

        const MODE_BYTE = 4;
        const EC_LEVEL_L = 1;

        // Pre-computed for versions 1-10
        const VERSION_CAPACITY = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
        const VERSION_SIZE = [0, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57];
        const EC_CODEWORDS = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
        const NUM_EC_BLOCKS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];

        // Galois field tables
        const GF_EXP = new Array(256);
        const GF_LOG = new Array(256);

        (function initGF() {
            let x = 1;
            for (let i = 0; i < 255; i++) {
                GF_EXP[i] = x;
                GF_LOG[x] = i;
                x = x * 2;
                if (x >= 256) x ^= 0x11d;
            }
            GF_EXP[255] = GF_EXP[0];
        })();

        function gfMul(a, b) {
            if (a === 0 || b === 0) return 0;
            return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
        }

        function polyMul(p1, p2) {
            const result = new Array(p1.length + p2.length - 1).fill(0);
            for (let i = 0; i < p1.length; i++) {
                for (let j = 0; j < p2.length; j++) {
                    result[i + j] ^= gfMul(p1[i], p2[j]);
                }
            }
            return result;
        }

        function getGeneratorPoly(degree) {
            let gen = [1];
            for (let i = 0; i < degree; i++) {
                gen = polyMul(gen, [1, GF_EXP[i]]);
            }
            return gen;
        }

        function rsEncode(data, ecLength) {
            const gen = getGeneratorPoly(ecLength);
            const padded = new Array(data.length + ecLength).fill(0);
            for (let i = 0; i < data.length; i++) padded[i] = data[i];

            for (let i = 0; i < data.length; i++) {
                const coef = padded[i];
                if (coef !== 0) {
                    for (let j = 0; j < gen.length; j++) {
                        padded[i + j] ^= gfMul(gen[j], coef);
                    }
                }
            }

            return padded.slice(data.length);
        }

        function getVersion(dataLength) {
            for (let v = 1; v <= 10; v++) {
                const capacity = VERSION_CAPACITY[v] - EC_CODEWORDS[v] * NUM_EC_BLOCKS[v];
                if (dataLength + 3 <= capacity) return v; // +3 for mode and length indicators
            }
            return 10; // max supported
        }

        function encode(text) {
            const data = [];
            for (let i = 0; i < text.length; i++) {
                data.push(text.charCodeAt(i));
            }

            const version = getVersion(data.length);
            const size = VERSION_SIZE[version];
            const ecPerBlock = EC_CODEWORDS[version];
            const numBlocks = NUM_EC_BLOCKS[version];
            const totalDataCW = VERSION_CAPACITY[version] - ecPerBlock * numBlocks;

            // Build data stream
            const bitStream = [];

            // Mode indicator (byte mode = 0100)
            bitStream.push(0, 1, 0, 0);

            // Character count (8 bits for versions 1-9, 16 for 10+)
            const countBits = version <= 9 ? 8 : 16;
            for (let i = countBits - 1; i >= 0; i--) {
                bitStream.push((data.length >> i) & 1);
            }

            // Data
            for (let i = 0; i < data.length; i++) {
                for (let b = 7; b >= 0; b--) {
                    bitStream.push((data[i] >> b) & 1);
                }
            }

            // Terminator
            const maxBits = totalDataCW * 8;
            for (let i = 0; i < 4 && bitStream.length < maxBits; i++) {
                bitStream.push(0);
            }

            // Pad to byte boundary
            while (bitStream.length % 8 !== 0 && bitStream.length < maxBits) {
                bitStream.push(0);
            }

            // Pad codewords
            const padBytes = [0xEC, 0x11];
            let padIdx = 0;
            while (bitStream.length < maxBits) {
                for (let b = 7; b >= 0; b--) {
                    bitStream.push((padBytes[padIdx] >> b) & 1);
                }
                padIdx = (padIdx + 1) % 2;
            }

            // Convert to bytes
            const dataCodewords = [];
            for (let i = 0; i < bitStream.length; i += 8) {
                let byte = 0;
                for (let b = 0; b < 8; b++) {
                    byte = (byte << 1) | (bitStream[i + b] || 0);
                }
                dataCodewords.push(byte);
            }

            // RS error correction
            const blockSize = Math.floor(totalDataCW / numBlocks);
            const allCodewords = [];

            for (let b = 0; b < numBlocks; b++) {
                const start = b * blockSize;
                const blockData = dataCodewords.slice(start, start + blockSize);
                const ec = rsEncode(blockData, ecPerBlock);
                allCodewords.push({ data: blockData, ec: ec });
            }

            // Interleave
            const finalData = [];
            const maxDataLen = Math.max(...allCodewords.map(b => b.data.length));
            for (let i = 0; i < maxDataLen; i++) {
                for (let b = 0; b < numBlocks; b++) {
                    if (i < allCodewords[b].data.length) finalData.push(allCodewords[b].data[i]);
                }
            }
            for (let i = 0; i < ecPerBlock; i++) {
                for (let b = 0; b < numBlocks; b++) {
                    finalData.push(allCodewords[b].ec[i]);
                }
            }

            // Create module matrix
            const modules = Array.from({ length: size }, () => new Array(size).fill(null));
            const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

            // Place finder patterns
            function placeFinder(row, col) {
                for (let r = -1; r <= 7; r++) {
                    for (let c = -1; c <= 7; c++) {
                        const mr = row + r, mc = col + c;
                        if (mr < 0 || mr >= size || mc < 0 || mc >= size) continue;
                        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
                            const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
                            const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
                            modules[mr][mc] = isOuter || isInner;
                        } else {
                            modules[mr][mc] = false;
                        }
                        reserved[mr][mc] = true;
                    }
                }
            }

            placeFinder(0, 0);
            placeFinder(0, size - 7);
            placeFinder(size - 7, 0);

            // Timing patterns
            for (let i = 8; i < size - 8; i++) {
                if (!reserved[6][i]) {
                    modules[6][i] = i % 2 === 0;
                    reserved[6][i] = true;
                }
                if (!reserved[i][6]) {
                    modules[i][6] = i % 2 === 0;
                    reserved[i][6] = true;
                }
            }

            // Dark module
            modules[size - 8][8] = true;
            reserved[size - 8][8] = true;

            // Reserve format info areas
            for (let i = 0; i < 9; i++) {
                if (i < size) { reserved[8][i] = true; reserved[i][8] = true; }
            }
            for (let i = 0; i < 8; i++) {
                reserved[8][size - 1 - i] = true;
                reserved[size - 1 - i][8] = true;
            }

            // Alignment pattern (for version >= 2)
            if (version >= 2) {
                const alignPos = size - 7; // simplified for small versions
                for (let r = -2; r <= 2; r++) {
                    for (let c = -2; c <= 2; c++) {
                        const mr = alignPos + r, mc = alignPos + c;
                        if (mr >= 0 && mr < size && mc >= 0 && mc < size && !reserved[mr][mc]) {
                            const isOuter = Math.abs(r) === 2 || Math.abs(c) === 2;
                            const isCenter = r === 0 && c === 0;
                            modules[mr][mc] = isOuter || isCenter;
                            reserved[mr][mc] = true;
                        }
                    }
                }
            }

            // Place data
            const finalBits = [];
            for (let i = 0; i < finalData.length; i++) {
                for (let b = 7; b >= 0; b--) {
                    finalBits.push((finalData[i] >> b) & 1);
                }
            }

            let bitIndex = 0;
            let upward = true;

            for (let col = size - 1; col >= 0; col -= 2) {
                if (col === 6) col = 5; // skip timing column
                const rows = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);

                for (const row of rows) {
                    for (let c = 0; c < 2; c++) {
                        const actualCol = col - c;
                        if (actualCol < 0 || reserved[row][actualCol]) continue;
                        modules[row][actualCol] = bitIndex < finalBits.length ? finalBits[bitIndex++] === 1 : false;
                    }
                }
                upward = !upward;
            }

            // Apply mask (pattern 0: (row + col) % 2 === 0)
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    if (!reserved[r][c]) {
                        if ((r + c) % 2 === 0) {
                            modules[r][c] = !modules[r][c];
                        }
                    }
                }
            }

            // Place format info (mask 0, EC level L)
            // Pre-computed format string for EC-L, mask 0: 111011111000100
            const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];

            // Around top-left finder
            for (let i = 0; i < 6; i++) modules[8][i] = formatBits[i] === 1;
            modules[8][7] = formatBits[6] === 1;
            modules[8][8] = formatBits[7] === 1;
            modules[7][8] = formatBits[8] === 1;
            for (let i = 0; i < 6; i++) modules[5 - i][8] = formatBits[9 + i] === 1;

            // Around other finders
            for (let i = 0; i < 7; i++) modules[size - 1 - i][8] = formatBits[i] === 1;
            for (let i = 0; i < 8; i++) modules[8][size - 8 + i] = formatBits[7 + i] === 1;

            return { modules, moduleCount: size };
        }

        return { encode };
    })();

    // === Build Slides from JSON ===
    function buildSlides(data) {
        slides = [];
        const container = presentation;
        container.innerHTML = '';

        // Slide 0: Hero
        const heroSlide = createSlide('hero');
        const dateObj = new Date(data.date + 'T12:00:00');
        const formattedDate = dateObj.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        heroSlide.innerHTML = `
            <div class="slide-content" style="text-align: center;">
                <p class="slide-topic-badge">${formattedDate}</p>
                <h1 class="slide-heading" style="font-size: clamp(2.5rem, 5vw, 4rem); margin-bottom: 16px;">${data.title}</h1>
                <p class="slide-body" style="max-width: 480px; margin: 0 auto 40px;">${data.subtitle || 'Weekly 3D printing news and discussion'}</p>
                <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                    <button class="btn primary-btn" id="start-btn">Start Presentation</button>
                    <span class="btn secondary-btn" style="cursor: default; opacity: 0.5; pointer-events: none;">${data.topics.length} Topics</span>
                </div>
            </div>
        `;
        container.appendChild(heroSlide);
        slides.push({ type: 'hero', el: heroSlide, topicId: null, url: null });

        // Slide 1: Topic Overview
        const overviewSlide = createSlide('overview');
        let overviewHTML = `
            <div class="slide-content">
                <p class="slide-topic-badge">Overview</p>
                <h2 class="slide-heading" style="margin-bottom: 32px;">Today's Topics</h2>
                <div class="overview-grid">
        `;

        data.topics.forEach((topic, i) => {
            const typeIcons = {
                video: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
                tool: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
                discussion: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>'
            };

            overviewHTML += `
                <button class="topic-card" data-topic-index="${i}" onclick="window.Presenter.goToTopic(${i})">
                    <div class="topic-card-info">
                        <p class="topic-card-number">Topic ${i + 1}</p>
                        <h3 class="topic-card-title">${topic.title}</h3>
                        <p class="topic-card-desc">${topic.description}</p>
                    </div>
                    <svg class="topic-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 18l6-6-6-6"/>
                    </svg>
                </button>
            `;
        });

        overviewHTML += '</div></div>';
        overviewSlide.innerHTML = overviewHTML;
        container.appendChild(overviewSlide);
        slides.push({ type: 'overview', el: overviewSlide, topicId: null, url: null });
        overviewSlideIndex = 1;

        // Topic slides
        data.topics.forEach((topic, topicIndex) => {
            topic.slides.forEach((slideData, slideIndex) => {
                const slide = createSlide('topic');
                let slideHTML = `<div class="slide-content">`;
                slideHTML += `<p class="slide-topic-badge">Topic ${topicIndex + 1}${topic.slides.length > 1 ? ` — ${slideIndex + 1} of ${topic.slides.length}` : ''}</p>`;
                slideHTML += `<h2 class="slide-heading">${slideData.heading}</h2>`;

                if (slideData.body) {
                    slideHTML += `<p class="slide-body">${slideData.body}</p>`;
                }

                if (slideData.videoUrl) {
                    const embedUrl = getYouTubeEmbedUrl(slideData.videoUrl);
                    if (embedUrl) {
                        slideHTML += `
                            <div class="video-container">
                                <iframe 
                                    src="${embedUrl}"
                                    data-embed="${embedUrl}"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                    allowfullscreen
                                    loading="lazy"
                                    title="${slideData.videoTitle || slideData.heading}">
                                </iframe>
                            </div>
                        `;
                    }
                }

                if (slideData.imageUrl) {
                    slideHTML += `
                        <div class="slide-image-container">
                            <img src="${slideData.imageUrl}" alt="${slideData.heading}" loading="lazy">
                        </div>
                    `;
                }

                if (slideData.imageUrls && Array.isArray(slideData.imageUrls)) {
                    slideHTML += `<div class="slide-gallery-container">`;
                    slideData.imageUrls.forEach(url => {
                        slideHTML += `
                            <div class="slide-gallery-item">
                                <img src="${url}" alt="${slideData.heading}" loading="lazy">
                            </div>
                        `;
                    });
                    slideHTML += `</div>`;
                }

                if (slideData.bullets) {
                    slideHTML += '<ul class="slide-bullets">';
                    slideData.bullets.forEach(bullet => {
                        slideHTML += `<li>${bullet}</li>`;
                    });
                    slideHTML += '</ul>';
                }

                if (slideData.link) {
                    slideHTML += `
                        <a href="${slideData.link}" target="_blank" rel="noopener noreferrer" class="slide-link">
                            ${slideData.linkLabel || 'Open Link'}
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M7 17L17 7M17 7H7M17 7v10"/>
                            </svg>
                        </a>
                    `;
                }

                if (slideData.links && Array.isArray(slideData.links)) {
                    slideHTML += `<div class="slide-links-row">`;
                    slideData.links.forEach(lnk => {
                        slideHTML += `
                            <a href="${lnk.url}" target="_blank" rel="noopener noreferrer" class="slide-link">
                                ${lnk.label || 'Open Link'}
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M7 17L17 7M17 7H7M17 7v10"/>
                                </svg>
                            </a>
                        `;
                    });
                    slideHTML += `</div>`;
                }

                // Affiliate buttons (per-topic) + shop link — data from recommendations.js
                const affIds = slideData.products || (slideData.product ? [slideData.product] : []);
                let affHTML = '';
                if (affIds.length && Array.isArray(window.PRODUCTS)) {
                    affIds.forEach(pid => {
                        const p = window.PRODUCTS.find(x => x.id === pid);
                        if (p && p.amazonUrl) {
                            affHTML += `
                                <a href="${p.amazonUrl}" target="_blank" rel="noopener noreferrer sponsored" class="slide-affiliate">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                                    </svg>
                                    Buy on Amazon${p.name ? ' — ' + p.name : ''}
                                </a>`;
                        }
                    });
                }
                if (slideData.shop) {
                    const shopCat = (typeof slideData.shop === 'string') ? slideData.shop : '';
                    const shopHref = 'recommendations.html' + (shopCat ? ('#' + encodeURIComponent(shopCat)) : '');
                    affHTML += `
                        <a href="${shopHref}" class="slide-affiliate slide-affiliate-shop">
                            Shop my picks
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M5 12h14M13 6l6 6-6 6"/>
                            </svg>
                        </a>`;
                }
                if (affHTML) {
                    slideHTML += `<div class="slide-affiliate-group">${affHTML}<span class="affiliate-note">${window.AFFILIATE_DISCLOSURE || 'Some links may be affiliate links.'}</span></div>`;
                }

                // Share (engine-level, 2026-08-13 — community request, GitHub issue #6):
                // every topic's FIRST slide carries a quiet share affordance; S opens the sheet.
                if (slideIndex === 0) {
                    slideHTML += `
                        <button type="button" class="slide-share-btn" data-topic-id="${topic.id}" aria-label="Share this topic" title="Share this topic (S)">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                                <line x1="8.59" y1="10.49" x2="15.42" y2="6.51"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                            </svg>
                            <span>Share</span>
                        </button>
                    `;
                }

                slideHTML += '</div>';
                slide.innerHTML = slideHTML;

                // Curtain Reveal (opt-in): hide this slide behind a glass curtain until clicked
                if (slideData.reveal) {
                    slide.classList.add('reveal-armed');
                    slide.dataset.revealConfig = JSON.stringify(slideData.reveal === true ? {} : slideData.reveal);
                    slide.insertAdjacentHTML('beforeend', revealCurtainHTML(slideData.reveal));
                }

                container.appendChild(slide);

                // Determine URL for QR code
                const qrUrl = slideData.link || slideData.videoUrl || (slideData.links && slideData.links[0] && slideData.links[0].url) || topic.url || null;
                slides.push({
                    type: 'topic',
                    el: slide,
                    topicId: topic.id,
                    topicIndex: topicIndex,
                    topicTitle: topic.title,
                    url: qrUrl
                });
            });
        });

        // === Closing slide: Connect with Max (engine-level — appears on every deck) ===
        const connectSlide = createSlide('connect');
        connectSlide.innerHTML = `
            <div class="slide-content" style="text-align: center;">
                <p class="slide-topic-badge">Connect</p>
                <h2 class="slide-heading">Connect with Max Sikorski</h2>
                <p class="slide-body" style="max-width: 580px; margin: 0 auto 32px;">3D Printing Weekly — print farm · R&amp;D &amp; manufacturing · CAD classes. Subscribe, say hi, or reach out about a project.</p>
                <div class="connect-links">
                    <a class="connect-link" href="${LINKS.youtube}" target="_blank" rel="noopener noreferrer">YouTube</a>
                    <a class="connect-link" href="${LINKS.meetup}" target="_blank" rel="noopener noreferrer">Meetup</a>
                    <a class="connect-link" href="${LINKS.github}" target="_blank" rel="noopener noreferrer">GitHub</a>
                    <a class="connect-link" href="${LINKS.discord}" target="_blank" rel="noopener noreferrer">Discord</a>
                    <a class="connect-link" href="${LINKS.buzz}" target="_blank" rel="noopener noreferrer">Buzz</a>
                    <a class="connect-link" href="${WORK_WITH_MAILTO}">Work With Us</a>
                </div>
            </div>
        `;
        container.appendChild(connectSlide);
        slides.push({ type: 'connect', el: connectSlide, topicId: null, topicIndex: null, topicTitle: null, url: LINKS.youtube });

        return slides;
    }

    function createSlide(type) {
        const slide = document.createElement('div');
        slide.className = 'slide';
        slide.dataset.type = type;
        return slide;
    }

    // === Video control: halt playback when leaving a slide ===
    function stopSlideVideos(slideEl) {
        if (!slideEl) return;
        slideEl.querySelectorAll('iframe[data-embed]').forEach(f => {
            f.src = 'about:blank'; // blanking the source stops audio/video immediately
        });
    }

    function restoreSlideVideos(slideEl) {
        if (!slideEl) return;
        slideEl.querySelectorAll('iframe[data-embed]').forEach(f => {
            if (f.src.indexOf(f.dataset.embed) === -1) {
                f.src = f.dataset.embed; // reload the player so it's ready to play again
            }
        });
    }

    // === Curtain Reveal — opt-in per slide via a "reveal" key (true | {kicker, label, confetti}) ===
    // A one-shot theatrical unveil: the slide hides behind a glass curtain with a single
    // button; clicking parts the curtain and staggers the content in. Reloading re-arms it.
    // Added 2026-07-16 for the W29 Curve Cut spotlight; dormant unless a slide opts in.
    function revealCurtainHTML(reveal) {
        const cfg = (typeof reveal === 'object' && reveal !== null) ? reveal : {};
        const kicker = cfg.kicker || 'Builder Spotlight';
        const label = cfg.label || 'Unveil';
        return `
            <div class="slide-reveal-curtain">
                <div class="slide-reveal-panel slide-reveal-panel-left"></div>
                <div class="slide-reveal-panel slide-reveal-panel-right"></div>
                <div class="slide-reveal-seam"></div>
                <div class="slide-reveal-center">
                    <p class="slide-reveal-kicker">${kicker}</p>
                    <button type="button" class="slide-reveal-btn">${label}</button>
                </div>
            </div>
        `;
    }

    function playReveal(slideEl) {
        if (!slideEl || slideEl.dataset.revealed === 'true') return;
        slideEl.dataset.revealed = 'true';
        const curtain = slideEl.querySelector('.slide-reveal-curtain');
        const content = slideEl.querySelector('.slide-content');
        if (!curtain || !content) return;

        let cfg = {};
        try { cfg = JSON.parse(slideEl.dataset.revealConfig || '{}'); } catch (e) { /* defaults */ }

        const left = curtain.querySelector('.slide-reveal-panel-left');
        const right = curtain.querySelector('.slide-reveal-panel-right');
        const seam = curtain.querySelector('.slide-reveal-seam');
        const center = curtain.querySelector('.slide-reveal-center');
        const heading = content.querySelector('.slide-heading');
        const inner = content.querySelectorAll('.slide-topic-badge, .slide-heading, .slide-body, .slide-bullets li, .slide-link, .video-container, .slide-image-container, .slide-affiliate-group');

        // Light sweep: sits under the parting panels, over the content
        const sweep = document.createElement('div');
        sweep.className = 'slide-reveal-sweep';
        slideEl.appendChild(sweep);

        gsap.set(inner, { opacity: 0, y: 26 });
        slideEl.classList.remove('reveal-armed'); // content column back; children start hidden

        const tl = gsap.timeline({
            onComplete: () => { curtain.remove(); sweep.remove(); }
        });
        tl.to(center, { opacity: 0, y: -14, duration: 0.35, ease: 'power2.in' }, 0)
          .to(seam, { opacity: 0.5, duration: 0.25, ease: 'power2.out' }, 0.1)
          .to(seam, { opacity: 0, duration: 0.6, ease: 'power2.out' }, 0.45)
          .to(left, { xPercent: -103, duration: 1.15, ease: 'power4.inOut' }, 0.3)
          .to(right, { xPercent: 103, duration: 1.15, ease: 'power4.inOut' }, 0.3)
          .fromTo(sweep, { xPercent: -120 }, { xPercent: 120, duration: 1.0, ease: 'power2.out' }, 0.85)
          .to(inner, { opacity: 1, y: 0, duration: 0.9, ease: 'power4.out', stagger: 0.1 }, 0.9);
        // The heading lands with a pop, not just a fade
        if (heading) {
            tl.fromTo(heading, { scale: 0.92 }, { scale: 1, duration: 0.8, ease: 'back.out(1.7)', clearProps: 'scale' }, 1.0);
        }
        // Settle body copy at the engine's resting opacity
        content.querySelectorAll('.slide-body, .slide-bullets li').forEach(el => {
            tl.to(el, { opacity: 0.85, duration: 0.5, ease: 'power2.out' }, 1.9);
        });
        // Celebration extra — opt-in via the reveal config
        if (cfg.confetti) tl.add(() => spawnRevealConfetti(slideEl), 1.05);
    }

    // Multicolor confetti burst — the ONE sanctioned color exception (Max's call, 2026-07-16):
    // everything else stays monochrome; the confetti alone gets party colors.
    const REVEAL_CONFETTI_COLORS = [
        '#ff3b30', // red
        '#ff9500', // orange
        '#ffcc00', // yellow
        '#34c759', // green
        '#14b8a6', // teal
        '#007aff', // blue
        '#af52de', // purple
        '#ff2d55'  // pink
    ];

    function spawnRevealConfetti(slideEl) {
        const box = document.createElement('div');
        box.className = 'slide-reveal-confetti';
        slideEl.appendChild(box);
        const W = slideEl.clientWidth, H = slideEl.clientHeight;
        const COUNT = 80;
        for (let i = 0; i < COUNT; i++) {
            const p = document.createElement('div');
            p.className = 'slide-reveal-confetti-piece';
            const strip = Math.random() < 0.5;
            const s = 5 + Math.random() * 6;
            p.style.width = s + 'px';
            p.style.height = (strip ? s * 2.4 : s) + 'px';
            p.style.background = REVEAL_CONFETTI_COLORS[Math.floor(Math.random() * REVEAL_CONFETTI_COLORS.length)];
            p.style.opacity = String(0.85 + Math.random() * 0.15); // full color, slight depth
            box.appendChild(p);
            const x0 = W / 2, y0 = H * 0.62;
            const drift = (Math.random() - 0.5) * W * 0.9;
            const rise = H * (0.25 + Math.random() * 0.45);
            const d1 = 0.55 + Math.random() * 0.35;
            const d2 = 0.9 + Math.random() * 0.6;
            gsap.set(p, { x: x0, y: y0, rotation: Math.random() * 360 });
            gsap.timeline({ onComplete: () => p.remove() })
                .to(p, { x: x0 + drift * 0.6, y: y0 - rise, rotation: '+=' + (180 + Math.random() * 360), duration: d1, ease: 'power2.out' })
                .to(p, { x: x0 + drift, y: y0 + H * 0.25, rotation: '+=' + (180 + Math.random() * 360), duration: d2, ease: 'power1.in' })
                .to(p, { opacity: 0, duration: 0.35 }, '-=0.35');
        }
        gsap.delayedCall(3.2, () => box.remove());
    }

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.slide-reveal-btn');
        if (btn) playReveal(btn.closest('.slide'));
    });

    // === Navigation ===
    function goToSlide(index, direction) {
        if (index < 0 || index >= slides.length || index === currentSlide) return;

        const prevSlideEl = slides[currentSlide].el;
        const nextSlideEl = slides[index].el;
        const dir = direction || (index > currentSlide ? 1 : -1);

        // Stop any video on the slide we're leaving; ready the one we're entering
        stopSlideVideos(prevSlideEl);
        restoreSlideVideos(nextSlideEl);

        // Start timer on first navigation away from hero
        if (!timerStarted && currentSlide === 0 && index > 0) {
            startTimer();
            timerStarted = true;
        }

        // Animate out
        gsap.to(prevSlideEl, {
            opacity: 0,
            y: dir * -30,
            duration: 0.4,
            ease: 'power4.out',
            onComplete: () => {
                prevSlideEl.classList.remove('active');
                prevSlideEl.style.transform = '';
            }
        });

        // Animate in
        gsap.set(nextSlideEl, { opacity: 0, y: dir * 30 });
        nextSlideEl.classList.add('active');
        gsap.to(nextSlideEl, {
            opacity: 1,
            y: 0,
            duration: 0.6,
            ease: 'power4.out',
            delay: 0.1
        });

        // Animate inner elements stagger
        const innerElements = nextSlideEl.querySelectorAll('.slide-topic-badge, .slide-heading, .slide-body, .slide-bullets li, .slide-link, .video-container, .topic-card, .connect-links, .slide-share-btn');
        if (innerElements.length > 0) {
            gsap.set(innerElements, { opacity: 0, y: 15 });
            gsap.to(innerElements, {
                opacity: 1,
                y: 0,
                duration: 0.6,
                ease: 'power4.out',
                stagger: 0.06,
                delay: 0.2
            });

            // Fix opacity for specific elements after animation
            nextSlideEl.querySelectorAll('.slide-body').forEach(el => {
                gsap.to(el, { opacity: 0.85, duration: 0.6, ease: 'power4.out', delay: 0.3 });
            });
            nextSlideEl.querySelectorAll('.slide-bullets li').forEach(el => {
                gsap.to(el, { opacity: 0.85, duration: 0.6, ease: 'power4.out', delay: 0.3 });
            });
            nextSlideEl.querySelectorAll('.slide-share-btn').forEach(el => {
                gsap.to(el, { opacity: 0.35, duration: 0.6, ease: 'power4.out', delay: 0.3 });
            });
        }

        currentSlide = index;
        updateControls();
        updateQR();
        updateTOCHighlight();
        updateSlideCredit();
    }

    function nextSlide() {
        if (currentSlide < slides.length - 1) {
            goToSlide(currentSlide + 1, 1);
        }
    }

    function prevSlide() {
        if (currentSlide > 0) {
            goToSlide(currentSlide - 1, -1);
        }
    }

    function goToOverview() {
        goToSlide(overviewSlideIndex);
    }

    function goToTopic(topicIndex) {
        // Find the first slide for this topic
        const slideIdx = slides.findIndex(s => s.topicIndex === topicIndex);
        if (slideIdx >= 0) {
            goToSlide(slideIdx, 1);
        }
    }

    function updateControls() {
        // Slide counter
        slideCounter.textContent = `${currentSlide + 1} / ${slides.length}`;

        // Nav buttons
        prevBtn.disabled = currentSlide === 0;
        nextBtn.disabled = currentSlide === slides.length - 1;

        // Progress bar
        const progress = slides.length > 1 ? (currentSlide / (slides.length - 1)) * 100 : 0;
        progressBar.style.width = `${progress}%`;
    }

    // === Slide credit: per-topic contact link (byline is static in week.html) ===
    function updateSlideCredit() {
        if (!slideCreditContact) return;
        const s = slides[currentSlide];
        slideCreditContact.href = contactMailto(s && s.topicTitle ? s.topicTitle : null);
    }

    // === Timer ===
    function startTimer() {
        if (timerRunning) return;
        timerRunning = true;
        timerInterval = setInterval(() => {
            timerSeconds--;
            if (timerSeconds <= 0) {
                timerSeconds = 0;
                clearInterval(timerInterval);
                timerRunning = false;
            }
            updateTimerDisplay();
        }, 1000);
    }

    function pauseTimer() {
        clearInterval(timerInterval);
        timerRunning = false;
    }

    function resetTimer() {
        pauseTimer();
        timerSeconds = (weekData && weekData.timerMinutes ? weekData.timerMinutes : 20) * 60;
        timerStarted = false;
        updateTimerDisplay();
    }

    function updateTimerDisplay() {
        const mins = Math.floor(timerSeconds / 60);
        const secs = timerSeconds % 60;
        timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        // Visual warnings
        timerDisplay.classList.remove('warning', 'critical');
        if (timerSeconds <= 0) {
            timerDisplay.classList.add('critical');
        } else if (timerSeconds <= 5 * 60) { // Last 5 minutes
            timerDisplay.classList.add('warning');
        }
    }

    // === QR Code ===
    function updateQR() {
        if (!qrVisible) return;
        const slideData = slides[currentSlide];
        if (slideData && slideData.url) {
            generateQR(slideData.url, qrCanvas, 140);
            qrLabel.textContent = 'Scan to open';
            qrOverlay.classList.add('visible');
        } else {
            qrOverlay.classList.remove('visible');
        }
    }

    function toggleQR() {
        qrVisible = !qrVisible;
        if (qrVisible) {
            qrToggleBtn.classList.add('active');
            updateQR();
        } else {
            qrToggleBtn.classList.remove('active');
            qrOverlay.classList.remove('visible');
        }
    }

    // === Share (engine-level) — per-topic deep links + share sheet (S) ===
    // Added 2026-08-13 (community request — GitHub issue #6). Links are built from
    // window.location, so they follow the site wherever it lives: GitHub Pages today,
    // the Vercel mirror, or a future custom domain — no hardcoded host anywhere.
    let shareOpen = false;
    let shareSheet = null, shareOverlay = null;

    function shareUrlFor(topicId) {
        const params = new URLSearchParams(window.location.search);
        const week = params.get('week') || (weekData && weekData.week) || '';
        let url = `${window.location.origin}${window.location.pathname}?week=${encodeURIComponent(week)}`;
        if (topicId) url += `&topic=${encodeURIComponent(topicId)}`;
        return url;
    }

    function buildShareSheet() {
        shareOverlay = document.createElement('div');
        shareOverlay.className = 'share-overlay';
        shareSheet = document.createElement('div');
        shareSheet.className = 'share-sheet';
        shareSheet.setAttribute('role', 'dialog');
        shareSheet.setAttribute('aria-label', 'Share');
        shareSheet.innerHTML = `
            <button type="button" class="share-close" aria-label="Close share">&times;</button>
            <p class="share-title">Share</p>
            <p class="share-topic-title"></p>
            <div class="share-main">
                <div class="share-qr">
                    <canvas></canvas>
                    <p class="share-qr-label">Scan to open</p>
                </div>
                <div class="share-right">
                    <div class="share-link-row">
                        <span class="share-link-text"></span>
                        <button type="button" class="share-copy-btn">Copy Link</button>
                    </div>
                    <div class="share-targets"></div>
                </div>
            </div>
        `;
        document.body.appendChild(shareOverlay);
        document.body.appendChild(shareSheet);
        shareOverlay.addEventListener('click', closeShare);
        shareSheet.querySelector('.share-close').addEventListener('click', closeShare);
        shareSheet.querySelector('.share-copy-btn').addEventListener('click', (e) => {
            copyShareLink(e.currentTarget.dataset.url || '', e.currentTarget);
        });
    }

    function copyShareLink(url, btn) {
        const done = () => {
            btn.textContent = 'Copied ✓';
            setTimeout(() => { btn.textContent = 'Copy Link'; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
        } else {
            fallbackCopy(url, done);
        }
    }

    function fallbackCopy(text, done) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* best effort */ }
        ta.remove();
        done();
    }

    function buildShareTargets(container, url, title) {
        const eUrl = encodeURIComponent(url);
        const eTitle = encodeURIComponent(title);
        let html = '';
        if (navigator.share) {
            html += `<button type="button" class="share-target" data-native="true">Share…</button>`;
        }
        html += `
            <a class="share-target" href="mailto:?subject=${eTitle}&body=${eTitle}%0A%0A${eUrl}">Email</a>
            <a class="share-target" href="https://twitter.com/intent/tweet?text=${eTitle}&url=${eUrl}" target="_blank" rel="noopener noreferrer">X</a>
            <a class="share-target" href="https://www.facebook.com/sharer/sharer.php?u=${eUrl}" target="_blank" rel="noopener noreferrer">Facebook</a>
            <a class="share-target" href="https://www.linkedin.com/sharing/share-offsite/?url=${eUrl}" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            <a class="share-target" href="https://www.reddit.com/submit?url=${eUrl}&title=${eTitle}" target="_blank" rel="noopener noreferrer">Reddit</a>
            <a class="share-target" href="https://wa.me/?text=${eTitle}%20${eUrl}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
        `;
        container.innerHTML = html;
        const nativeBtn = container.querySelector('[data-native]');
        if (nativeBtn) {
            nativeBtn.addEventListener('click', () => {
                navigator.share({ title: title, url: url }).catch(() => { /* user closed the native sheet */ });
            });
        }
    }

    function openShare(topicId) {
        if (!shareSheet) buildShareSheet();
        // No explicit topic → share the current slide's topic; on title/overview/finale, the week
        if (topicId === undefined || topicId === null || topicId === '') {
            topicId = slides[currentSlide] ? slides[currentSlide].topicId : null;
        }
        const slideMeta = topicId ? slides.find(s => s.topicId === topicId) : null;
        const topicTitle = slideMeta ? slideMeta.topicTitle : null;
        const url = shareUrlFor(topicId);
        const shareTitle = topicTitle ? `${topicTitle} — 3D Printing Weekly` : `${weekData ? weekData.title : '3D Printing Weekly'}`;

        shareSheet.querySelector('.share-topic-title').textContent = topicTitle || (weekData ? weekData.title : '');
        shareSheet.querySelector('.share-link-text').textContent = url.replace(/^https?:\/\//, '');
        shareSheet.querySelector('.share-copy-btn').dataset.url = url;
        generateQR(url, shareSheet.querySelector('.share-qr canvas'), 132);
        buildShareTargets(shareSheet.querySelector('.share-targets'), url, shareTitle);

        shareOpen = true;
        shareOverlay.classList.add('open');
        shareSheet.classList.add('open');
    }

    function closeShare() {
        if (!shareOpen) return;
        shareOpen = false;
        shareOverlay.classList.remove('open');
        shareSheet.classList.remove('open');
    }

    function toggleShare() {
        if (shareOpen) closeShare();
        else openShare();
    }

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.slide-share-btn');
        if (btn) openShare(btn.dataset.topicId);
    });

    // === TOC ===
    function buildTOC(data) {
        tocList.innerHTML = '';

        // Overview item
        const overviewItem = document.createElement('button');
        overviewItem.className = 'toc-item';
        overviewItem.innerHTML = `
            <span class="toc-item-number">—</span>
            <span class="toc-item-title">Overview</span>
        `;
        overviewItem.addEventListener('click', () => {
            closeTOC();
            goToSlide(overviewSlideIndex);
        });
        tocList.appendChild(overviewItem);

        data.topics.forEach((topic, i) => {
            const item = document.createElement('button');
            item.className = 'toc-item';
            item.dataset.topicIndex = i;
            item.innerHTML = `
                <span class="toc-item-number">${String(i + 1).padStart(2, '0')}</span>
                <span class="toc-item-title">${topic.title}</span>
            `;
            item.addEventListener('click', () => {
                closeTOC();
                goToTopic(i);
            });
            tocList.appendChild(item);
        });
    }

    function openTOC() {
        tocOpen = true;
        tocOverlay.classList.add('open');
        tocSidebar.classList.add('open');
        tocToggleBtn.classList.add('active');
        updateTOCHighlight();
    }

    function closeTOC() {
        tocOpen = false;
        tocOverlay.classList.remove('open');
        tocSidebar.classList.remove('open');
        tocToggleBtn.classList.remove('active');
    }

    function toggleTOC() {
        if (tocOpen) closeTOC();
        else openTOC();
    }

    function updateTOCHighlight() {
        const items = tocList.querySelectorAll('.toc-item');
        const currentTopicIndex = slides[currentSlide]?.topicIndex;

        items.forEach(item => {
            item.classList.remove('active');
            const idx = item.dataset.topicIndex;
            if (idx !== undefined && parseInt(idx) === currentTopicIndex) {
                item.classList.add('active');
            }
            // Highlight overview
            if (idx === undefined && currentSlide === overviewSlideIndex) {
                item.classList.add('active');
            }
        });
    }

    // === Keyboard Navigation ===
    document.addEventListener('keydown', (e) => {
        // Ignore when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
            case ' ':
                e.preventDefault();
                nextSlide();
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                prevSlide();
                break;
            case 'Escape':
                e.preventDefault();
                if (shareOpen) {
                    closeShare();
                } else if (tocOpen) {
                    closeTOC();
                } else {
                    goToOverview();
                }
                break;
            case 't':
            case 'T':
                e.preventDefault();
                toggleTOC();
                break;
            case 'q':
            case 'Q':
                e.preventDefault();
                toggleQR();
                break;
            case 's':
            case 'S':
                e.preventDefault();
                toggleShare();
                break;
            case 'r':
            case 'R':
                e.preventDefault();
                resetTimer();
                break;
        }

        // Number keys 1-9: jump to topic
        const num = parseInt(e.key);
        if (!isNaN(num) && num >= 1 && num <= 9) {
            e.preventDefault();
            goToTopic(num - 1);
        }
    });

    // === Touch / Swipe Navigation (tablets & phones) ===
    let touchStartX = 0, touchStartY = 0, touchTracking = false;
    const SWIPE_THRESHOLD = 50; // minimum horizontal travel in px

    presentation.addEventListener('touchstart', (e) => {
        // Single-finger only, and not while an overlay is open
        if (e.touches.length !== 1 || tocOpen || qrVisible || shareOpen) { touchTracking = false; return; }
        touchTracking = true;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    presentation.addEventListener('touchend', (e) => {
        if (!touchTracking) return;
        touchTracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        // Only treat clearly-horizontal swipes as navigation (ignore vertical scrolls)
        if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) nextSlide();   // swipe left → next slide
            else prevSlide();          // swipe right → previous slide
        }
    }, { passive: true });

    // === Click Handlers ===
    prevBtn.addEventListener('click', prevSlide);
    nextBtn.addEventListener('click', nextSlide);
    tocToggleBtn.addEventListener('click', toggleTOC);
    tocClose.addEventListener('click', closeTOC);
    tocOverlay.addEventListener('click', closeTOC);
    qrToggleBtn.addEventListener('click', toggleQR);

    timerDisplay.addEventListener('click', () => {
        if (timerRunning) {
            pauseTimer();
        } else {
            startTimer();
        }
    });

    timerDisplay.addEventListener('dblclick', (e) => {
        e.preventDefault();
        resetTimer();
    });

    // === Keyboard Hints ===
    function showKeyboardHints() {
        keyboardHints.classList.add('visible');
        setTimeout(() => {
            keyboardHints.classList.remove('visible');
        }, 4000);
    }

    // === Inline fallback data for file:// protocol ===
    // Keep in sync with weeks/2026-W22.json
    const INLINE_WEEKS = {
        "2026-W33": {
            "week": "2026-W33",
            "date": "2026-08-13",
            "title": "Prusa Goes Gen 2, Bambu Teases Its First Laser & AB 2047's Decision Day",
            "subtitle": "This week in 3D printing news",
            "timerMinutes": 20,
            "topics": [
                {
                    "id": "prusa-gen2-refresh",
                    "title": "Prusa Refreshes the Whole Line: XL+, CORE One+ (Gen 2), CORE One L+",
                    "description": "Same prices, new hardware — and pending orders upgrade free",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Same Prices, Better Machines",
                            "body": "Prusa dropped a lineup-wide refresh yesterday: the XL, CORE One and CORE One L all go 'plus', with quality-of-life hardware across the board — and no price increase on any of them. The classiest move is buried in the fine print: every pending order ships as the new version, free.",
                            "bullets": [
                                "All three: GT1.5 belts for cleaner surfaces, plus an integrated nozzle wiper for cleaner print starts",
                                "XL+: 360° part cooling, high-flow nozzles standard, and an eddy-current Tool Offset Sensor — toolhead calibration about 20× faster",
                                "XL+ chamber rated to 60 °C, with the heater itself still to come",
                                "CORE One+ (Gen 2): redesigned heatbed mounting kills the 'absorbing heat' wait on beds at 85 °C or lower, plus a snap-on top panel",
                                "Assembled Gen 2 machines are shipping now — XL+ follows late August",
                                "Existing owners: upgrade kits land end of August into September, parts also sold individually"
                            ],
                            "link": "https://blog.prusa3d.com/better-prints-easier-use-prusa-xl-core-one-l-and-core-one-gen-2-our-big-product-update_137539/",
                            "linkLabel": "Prusa's Announcement"
                        },
                        {
                            "heading": "The INDX Check-In, Same Post",
                            "body": "Mid-August was the promised kit window — it's mid-August. The only INDX movement this week came inside the Gen 2 post, and it's thin: 'very soon', again. Our stance hasn't changed since the nozzle mess: wait.",
                            "bullets": [
                                "Prusa: the first INDX units are shipping 'very soon' — no confirmed standard-kit deliveries in the wild yet",
                                "INDX is fully compatible with the Gen 2 machines; CORE One L compatibility is in testing",
                                "A dedicated State of INDX update post is promised for next week — we'll have it Thursday",
                                "Also teased in the post: PrusaSlicer 3.0 alpha 'within weeks', an HT Hotend in September, and Prusa Connect Local in early access"
                            ]
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Free Gen 2 for pending orders is the anti-Osborne play — should we expect this from every vendor now?",
                                "CORE One owners in the room: upgrade kit, or is Gen 1 fine for how you print?",
                                "INDX 'very soon' — after end-of-July became mid-August became this: what would convince you it's actually shipping?"
                            ]
                        }
                    ]
                },
                {
                    "id": "bambu-r1-teaser",
                    "title": "Bambu Teases the R1 — Its First Standalone Laser",
                    "description": "\"A new Ray of making\" — announced today, coming September",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "One More Tool in the Lab",
                            "body": "Announced this morning across Bambu's channels: the R1, their first standalone laser engraver and cutter, 'coming September'. The page is a tagline, a signup form, and a render of a laser cutting the Bambu logo through light wood — that's the entire official record, so resist the spec rumors until there's a spec sheet.",
                            "bullets": [
                                "First standalone laser from Bambu — the H2D already does laser, but only as a combo ($2,149 with 10W, $2,699 with 40W)",
                                "No price, no specs, no date beyond 'September' — email signup is live now",
                                "The obvious read: Bambu wants the xTool/Glowforge crowd inside its ecosystem",
                                "Laser folks in the room — what would the R1 need to pull you over?"
                            ],
                            "link": "https://bambulab.com/en/r1",
                            "linkLabel": "Bambu Lab R1"
                        }
                    ]
                },
                {
                    "id": "ab-2047-decision-day",
                    "title": "AB 2047: Decision Day Was Today",
                    "description": "The suspense-file vote happened this afternoon — the record posts tonight",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Advance or Die — Decided Hours Ago",
                            "body": "The make-or-break moment we flagged last week landed on meetup day: Senate Appropriations ran its vote-only suspense hearing today. AB 2047 — the bill requiring DOJ-certified 'firearm blocking technology' on every 3D printer sold in California — either advanced to the Senate floor this afternoon or died in the file. As we built this deck, the official record hadn't posted yet; it usually appears overnight. Scan the tracker and we'll check together.",
                            "bullets": [
                                "Suspense file rules: one vote, no debate — bills either move to the floor or quietly stop existing",
                                "The hearing was today, against a Friday Aug 14 deadline; the session itself ends August 31",
                                "If it advanced, the floor vote comes fast — then the governor's desk",
                                "How to check: the CalMatters tracker on the QR, or the official Bill History page — or just search 'AB 2047'",
                                "It has cleared every prior hurdle: the full Assembly, Senate Judiciary, and Public Safety 5–1"
                            ],
                            "link": "https://calmatters.digitaldemocracy.org/bills/ca_202520260ab2047",
                            "linkLabel": "AB 2047 Live Tracker",
                            "links": [
                                {
                                    "label": "Official Bill History",
                                    "url": "https://leginfo.legislature.ca.gov/faces/billHistoryClient.xhtml?bill_id=202520260AB2047"
                                },
                                {
                                    "label": "Joel's Action Hub",
                                    "url": "https://www.the3dprintingnerd.com/ab2047"
                                },
                                {
                                    "label": "EFF's Analysis",
                                    "url": "https://www.eff.org/deeplinks/2026/06/we-can-still-stop-californias-3d-printer-surveillance-scheme"
                                }
                            ]
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Suspense kills bills over cost, not principle — if this died today, it died over enforcement budgets. Does that feel like a win?",
                                "If it advanced: floor vote within two weeks. What's left for the opposition — Průša, VORON, Make, Joel, EFF — to throw at it?",
                                "If it died: it can come back next session, and copycat bills in other states are the real long game. Who's watching their own statehouse?"
                            ]
                        }
                    ]
                },
                {
                    "id": "m1d-follow-up",
                    "title": "Sovol M1D: $3.4M With 13 Days Left",
                    "description": "Live numbers from the campaign we backed twice",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Still Climbing",
                            "body": "We read the Kickstarter page live this afternoon: $3,435,700 pledged from 2,173 backers, 13 days to go. The campaign closes Thursday, August 27 at 10 AM Eastern, deliveries are still estimated for November, and our two orders stand. Same disclaimer as always — it's a pledge, not a purchase. The QR has the live total; it's moved since we wrote this.",
                            "link": "https://www.kickstarter.com/projects/sovol/sovol-m1d-idex-tool-changing-3d-printer",
                            "linkLabel": "M1D on Kickstarter",
                            "product": "sovol-m1d"
                        }
                    ]
                },
                {
                    "id": "yudx-tool-changer",
                    "title": "YUDX: The INDX You Can Build Today",
                    "description": "A college builder open-sourced a 7-tool changer — files, BOM and all",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "While Everyone Waits on Kits…",
                            "body": "…a builder called Dumpling lab put a complete toolchanger on GitHub. YUDX went open source August 5 under GPL-3.0: a 7-tool changer that mounts on a VORON, with every file you need to build one this weekend. It plays the same one-motor-runs-every-tool trick as INDX — but the demo video is from last December, before the INDX hype cycle, and the execution is its own thing.",
                            "videoUrl": "https://youtu.be/G3__Ysn6-TI"
                        },
                        {
                            "heading": "What's Actually in the Repo",
                            "bullets": [
                                "Seven swappable toolheads on magnet-seat docks — 32 neodymium magnets and steel balls do the kinematic coupling — running Bambu hotends",
                                "One 36 mm stepper drives every tool, through mirrored one-way-bearing gearboxes on the carriage — no motor per head",
                                "A 42-page illustrated assembly PDF, STLs, STEP models, sample G-code, and a full BOM with Amazon links",
                                "The BOM's own note: the Amazon links were 'found by Claude Code' — the builder put an AI to work on parts sourcing",
                                "A finished extruder kit 'may be released in the coming months' — but nothing stops a scratch build now",
                                "GPL-3.0: fork it, improve it, share it back. Who's first in the club to try?"
                            ],
                            "links": [
                                {
                                    "label": "Watch the YUDX Demo",
                                    "url": "https://youtu.be/G3__Ysn6-TI"
                                },
                                {
                                    "label": "YUDX on GitHub",
                                    "url": "https://github.com/dumplinglab/YUDX-tool-changer"
                                }
                            ]
                        }
                    ]
                },
                {
                    "id": "polymaker-affiliate",
                    "title": "Polymaker Affiliate: Our First Sale, Full Circle",
                    "description": "Someone used the link — and you'll meet him in two slides",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "It Works — and It Came From This Room",
                            "body": "A follow-up on last week's announcement, with the best possible proof it works: our Polymaker affiliate link recorded its first sale — and the buyer is tonight's Builder Spotlight. Ben used it to order HT-PLA Pro for the exact build you're about to see. Full disclosure, same as always: 15% off your first purchase, and every cent of affiliate revenue goes back into running this meetup.",
                            "bullets": [
                                "15% off — first purchase only",
                                "All affiliate revenue funds the meetup — thank you, Ben, for sale number one",
                                "Same Polymaker store, same products — the link just credits us",
                                "Heads-up: HT-PLA Pro itself is backordered right now — orders queue and ship when it restocks"
                            ],
                            "link": "https://shop.polymaker.com/MAXSIKORSKI",
                            "linkLabel": "Polymaker — 15% Off First Order"
                        }
                    ]
                },
                {
                    "id": "builder-spotlight",
                    "title": "Builder Spotlight: Ben's 3D-Printed Glasses",
                    "description": "His frames broke — so he printed better ones",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Ben Printed His Own Glasses",
                            "body": "This week's spotlight is Ben — Horizon-3D on our GitHub. His frames broke, so he and a friend made it a challenge: no buying replacements, print them. He modeled the lenses from photos and measurements, built the frames around them, and he's wearing the result right now. He's here tonight.",
                            "imageUrls": [
                                "photos/w33-ben-glasses-1.jpg",
                                "photos/w33-ben-glasses-2.jpg",
                                "photos/w33-ben-glasses-3.jpg"
                            ],
                            "link": "https://github.com/MaxSikorski/3d-printing-weekly-news/issues/4",
                            "linkLabel": "Ben's Full Write-Up"
                        },
                        {
                            "heading": "The Workflow: Frames Break → Print Your Own",
                            "body": "The part worth stealing. If your frames ever break, this is the whole recipe — follow along and ask Ben the hard questions tonight:",
                            "bullets": [
                                "Trace your lenses — photograph them flat, take careful measurements",
                                "Into CAD: trace the lens outline, then design and extrude the frame around it",
                                "Measure the old frames' geometry — the angles, the lens spacing, the arm length — and carry those numbers over",
                                "Print the frames beefier than the originals — thin injection-molded shapes don't survive as prints",
                                "Heat-form the fit: gentle heat softens the plastic just enough to bend the nose bridge and arms ever so slightly — hold until cool",
                                "Assemble: heat-set inserts, small bolts, a drop of threadlocker — done"
                            ]
                        },
                        {
                            "heading": "The Build, Up Close",
                            "body": "Hinge hardware and the finished fit — and in his words: 'Im really proud of it.' He should be.",
                            "bullets": [
                                "Hinges: heat-set inserts and M2.5 bolts, threadlocked so they stay put",
                                "The material journey: PETG snapped within minutes of wearing, regular PLA can't take the heat — PLA Pro is holding today, with a Polymaker HT-PLA Pro reprint queued"
                            ],
                            "imageUrls": [
                                "photos/w33-ben-glasses-4.jpg",
                                "photos/w33-ben-glasses-5.jpg"
                            ]
                        }
                    ]
                },
                {
                    "id": "quick-tip",
                    "title": "Quick Tip of the Week",
                    "description": "Bend it like Ben — heat-forming printed parts",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Quick Tip: Your Print Isn't Final — Heat It",
                            "body": "PLA goes rubbery around 60–70 °C, and that's a feature. A blow dryer or a dip in hot water softens a printed part just enough to bend it against a form — exactly how Ben fitted his glasses to his face. The print doesn't have to come off the bed in its final shape.",
                            "bullets": [
                                "Blow dryer for local tweaks, near-boiling water for even all-over softening — either gets you there",
                                "Bend slightly past your target and hold until cool — plastic springs back a little",
                                "Cold water locks the new shape instantly",
                                "Overdid it? Reheat: PLA has shape memory and creeps back toward its printed form — you get retries",
                                "Skip it on precision or load-bearing parts — bending stresses the layer bonds"
                            ],
                            "link": "https://www.instructables.com/Shaping-PLA-through-boiling/",
                            "linkLabel": "Shaping PLA: the How-To"
                        }
                    ]
                },
                {
                    "id": "community-news",
                    "title": "Community News & Topics",
                    "description": "Share what you're interested in talking about!",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Next Week's Meetup",
                            "body": "Find something you're interested in talking about? Share it here and we'll cover it in next week's meetup!",
                            "link": "https://github.com/MaxSikorski/3d-printing-weekly-news/issues",
                            "linkLabel": "Submit a Topic"
                        }
                    ]
                }
            ]
        },
        "2026-W32": {
            "week": "2026-W32",
            "date": "2026-08-06",
            "title": "Qidi Plus5 Lands, INDX Slips to Mid-August & AB 2047 Hits the Suspense File",
            "subtitle": "This week in 3D printing news",
            "timerMinutes": 20,
            "topics": [
                {
                    "id": "qidi-plus5-launch",
                    "title": "Qidi Plus5: Big, Hot & $749",
                    "description": "Qidi's Plus4 successor launched yesterday — and it undercuts half the enclosed CoreXY field",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Launched Yesterday, Aimed at Everyone",
                            "body": "Qidi pulled the trigger on the Plus5 yesterday morning, and the spec-per-dollar math is hard to argue with: a bigger build volume than the Plus4 in the same footprint, a genuinely hot actively heated chamber, and a price that starts with a 7. Our take up front: if we were shopping Qidi today, we'd buy this over the Q2.",
                            "bullets": [
                                "$749, or $899 Combo with the QIDI Box — up to 16-color multi-material",
                                "320 × 320 × 300 mm build volume — 18% more than the Plus4, same machine size",
                                "65 °C active chamber heating (3rd gen), 370 °C nozzle, 120 °C bed — engineering materials are the point",
                                "CoreXY, 600 mm/s toolhead speed, 20,000 mm/s² acceleration",
                                "Tempered-glass enclosure, 3-stage filtration, AI camera with skip-objects, dual Z lead screws",
                                "Launch pricing runs to Aug 31 — the member discount takes it under $700; in stock, ships 1–3 days from the China warehouse"
                            ],
                            "link": "https://qidi3d.com/products/plus5",
                            "linkLabel": "Plus5 at Qidi"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Plus5 vs Q2: same money, different philosophies — who picks the Q2 anyway, and why?",
                                "A 65 °C chamber at $749 was a $2,000 feature not long ago. What's left that justifies flagship prices?",
                                "Anyone running a Plus4 — what would the extra 18% of volume have saved you?"
                            ]
                        }
                    ]
                },
                {
                    "id": "indx-kits-mid-august",
                    "title": "INDX Watch: Kits Slip to Mid-August",
                    "description": "Prusa's official status post confirms the delay — and promises free extra hardware",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "The Nozzle Mess Has a Timeline Now",
                            "body": "Last week Bondtech admitted the 'hardened' INDX nozzles measure HRC 30–32, and our call was: don't buy or set up INDX until it's sorted. This week Prusa posted an official status update, and the short version is that the end-of-July kit shipments are now mid-August — with a make-good attached.",
                            "bullets": [
                                "Conversion kits: end-of-July promise is now mid-August, shipping in order by purchase date",
                                "Prusa's own abrasion test: 5 kg of PETG-CF ran fine — just 100 g of their Ultraglow filament killed the nozzle coating",
                                "Current nozzles are fine for standard materials: PLA, PETG, ABS, ASA, TPU, PC, Nylon and friends",
                                "Prusa is adding extra hardware to initial-batch orders free, at their expense — specifics promised before shipping",
                                "They may not finish the full first batch by end of August; truly hardened nozzles still have no timeline",
                                "Cancel any time before shipment for a full refund, plus a 60-day return window after delivery"
                            ],
                            "link": "https://forum.prusa3d.com/forum/prusa-indx-general-discussion-announcements-and-releases/current-as-of-july-31st-2026-status-on-prusa-core-one-index-orders/",
                            "linkLabel": "Prusa's Official Status Post"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Our recommendation stands: wait until the nozzle situation is fully fixed. Anyone tempted anyway?",
                                "Mystery hardware: what would actually make this right — free hardened nozzles later, or something else?",
                                "Kit holders in the room: riding it out on non-abrasives, or taking the refund?"
                            ]
                        }
                    ]
                },
                {
                    "id": "ab-2047-suspense-file",
                    "title": "AB 2047 Lands on the Suspense File",
                    "description": "California's 3D printer bill reached the make-or-break holding pen on Monday",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Monday: Senate Appropriations, Suspense File",
                            "body": "The standing watch fired this week. AB 2047 — the bill that would ban selling any 3D printer in California unless it's on a DOJ-approved roster with 'firearm blocking technology' — came back from summer recess and went straight to Senate Appropriations on Monday, August 3. The committee referred it to the suspense file, which sounds like procedure but is actually the whole ballgame.",
                            "bullets": [
                                "The suspense file is where fiscal committees park bills that cost real money, then decide their fate in one vote-only hearing",
                                "That hearing must happen by Friday, August 14 — bills either advance to the Senate floor or die quietly, no debate",
                                "The full session ends August 31 — if it clears suspense, the floor vote comes fast",
                                "It has cleared every hurdle so far: three Assembly committees, the Assembly floor, Senate Judiciary June 23, Senate Public Safety June 30 by a 5–1 vote"
                            ],
                            "link": "https://calmatters.digitaldemocracy.org/bills/ca_202520260ab2047",
                            "linkLabel": "Track AB 2047 at CalMatters"
                        },
                        {
                            "heading": "What the Bill Looks Like Now",
                            "body": "It's been amended 33 times on its way through the Assembly, and the current shape is softer than the original in two ways that matter — while the core mandate is untouched:",
                            "bullets": [
                                "The performance standard was weakened from 'effectively prevent' circumvention to 'substantially reduce' it",
                                "A carveout now allows private resale of printers bought before the mandate takes effect",
                                "The core stays: every new printer sold in California would need DOJ certification and blocking software",
                                "EFF's case against it: it censors lawful making, it builds corporate surveillance into every printer, and it won't work — determined bad actors route around it while everyone else gets monitored",
                                "The opposition coalition is unchanged: Průša, VORON, Make, Joel Telling, EFF — Joel's action hub is pointing everyone at the Appropriations committee right now"
                            ],
                            "links": [
                                {
                                    "label": "EFF's Analysis",
                                    "url": "https://www.eff.org/deeplinks/2026/06/we-can-still-stop-californias-3d-printer-surveillance-scheme"
                                },
                                {
                                    "label": "Joel's Action Hub",
                                    "url": "https://www.the3dprintingnerd.com/ab2047"
                                }
                            ]
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "By next Friday this bill is either headed to the Senate floor or dead. Predictions?",
                                "The suspense file kills bills over cost, not principle — does 'this mandate is expensive to enforce' sit right as the last line of defense?",
                                "Californians in the room: has anyone actually written to Appropriations? The action hub makes it a five-minute job"
                            ]
                        }
                    ]
                },
                {
                    "id": "m1d-week-one",
                    "title": "Sovol M1D, Week One: $3M and Climbing",
                    "description": "Quick follow-up on the campaign we backed twice",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "The Toolchanger Bet Keeps Growing",
                            "body": "One week into the campaign we covered last Thursday: All3DP reports the M1D passed $3 million with close to 2,000 backers as of August 1, and the campaign runs to August 27. Our two orders stand, and the usual Kickstarter rules still apply — it's a pledge, not a purchase. We'll pull up the live total on the QR right now; it's moved since we wrote this slide.",
                            "link": "https://www.kickstarter.com/projects/sovol/sovol-m1d-idex-tool-changing-3d-printer",
                            "linkLabel": "M1D on Kickstarter",
                            "product": "sovol-m1d"
                        }
                    ]
                },
                {
                    "id": "linear-shaft-motor",
                    "title": "A Fully Closed-Loop Linear Shaft Motor",
                    "description": "No belts, no screws — the motor IS the motion system",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "The Motor Is the Axis",
                            "body": "This one's a homework topic — we're covering it because we can't stop thinking about it. Builder midi700 demos a fully closed-loop linear shaft motor built for 3D printers and pick-and-place machines: the carriage rides the shaft directly, position feedback closes the loop, and there's no belt anywhere in the system.",
                            "videoUrl": "https://youtu.be/mbTjdPQQA20"
                        },
                        {
                            "heading": "Why We're Watching",
                            "bullets": [
                                "Belts stretch, ring, and need tensioning — direct linear drive removes that whole failure category",
                                "Closed-loop means the machine knows where the toolhead actually is, not where it should be",
                                "No GitHub and no files yet — this is a build to watch, not one to copy this weekend",
                                "We'll dig deeper and report back — if you know this builder or this motor class, come talk to us after"
                            ]
                        }
                    ]
                },
                {
                    "id": "growbot-ai-body",
                    "title": "Give an AI a Body — With Your Phone",
                    "description": "Art of the Problem's GrowBot puts the robot brain in the device you already own",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "The Robot Is Already in Your Pocket",
                            "body": "Art of the Problem's pitch is disarmingly simple: your phone already has the eyes, ears, and inner ear a robot needs — camera, mic, gyroscope, touch, speaker. GrowBot is an AI that wakes up inside the phone, uses those senses, and grows from its own experience. Print it a body and it starts moving through your house. We're building one.",
                            "videoUrl": "https://youtu.be/mIfmUHiMN3U"
                        },
                        {
                            "heading": "What It Takes",
                            "bullets": [
                                "$20 GrowBot Pass, one-time — no subscription; includes the app, brain credits, and step-by-step build instructions",
                                "Roughly $40 in printed and off-the-shelf parts for the body, or a $99 all-in-one kit",
                                "Free 5-minute trial before you spend anything",
                                "The AI gets full sensory use of the phone — it sees, hears, and feels tilt and touch",
                                "Expect a report from us once ours is walking"
                            ],
                            "links": [
                                {
                                    "label": "GrowBot at Art of the Problem",
                                    "url": "https://artoftheproblem.com/pages/growbot-preview"
                                }
                            ]
                        }
                    ]
                },
                {
                    "id": "curve-cut-premium",
                    "title": "Curve Cut: A Premium Tier Is in the Works",
                    "description": "Free stays free — a paid option is coming when the code is ready",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "From the Workbench: Going Freemium",
                            "body": "An update on our curve-slicing tool, and a small announcement: Curve Cut is getting a premium option. The free version stays free — everything you use today keeps working — and the paid tier adds more on top. It has NOT shipped yet: we're still building it out and optimizing the code, and it goes live when it's ready, not before. Same rule as always.",
                            "link": "https://maxsikorski.github.io/curve-cut/",
                            "linkLabel": "Try Curve Cut (Free)"
                        }
                    ]
                },
                {
                    "id": "new-discord",
                    "title": "We Have a New Discord — Join Us!",
                    "description": "The community hangout is live again, and there's more coming",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "The New Hangout Is Open",
                            "body": "The revamp we've been promising is here: our new Discord is live. This is where the between-meetup conversation lives — show your prints, ask for help, argue about nozzles. Scan the QR and you're in. This also closes the GitHub issue that's been asking for it — thanks for the push.",
                            "bullets": [
                                "Scan the QR or grab the invite link — everyone's welcome",
                                "We'll also be trying out Buzz by Block alongside it — more on that in a coming week"
                            ],
                            "link": "https://discord.gg/pnFyeAZJsk",
                            "linkLabel": "Join the Discord",
                            "links": [
                                {
                                    "label": "Buzz",
                                    "url": "https://buzz.xyz/"
                                }
                            ]
                        }
                    ]
                },
                {
                    "id": "polymaker-affiliate",
                    "title": "New: Our Polymaker Affiliate Link",
                    "description": "15% off your first purchase — and every cent supports the meetup",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Filament That Funds the Meetup",
                            "body": "Full disclosure as always: Polymaker is one of the brands we work with, and we now have an official affiliate link. Use it and you get 15% off your first purchase; every cent of affiliate revenue goes back into running this meetup. Thank you for supporting us — it genuinely keeps the lights on.",
                            "bullets": [
                                "15% off — first purchase only",
                                "All affiliate revenue goes to the meetup",
                                "Same Polymaker store, same products — the link just credits us"
                            ],
                            "link": "https://shop.polymaker.com/MAXSIKORSKI",
                            "linkLabel": "Polymaker — 15% Off First Order"
                        }
                    ]
                },
                {
                    "id": "infinityflow-demo",
                    "title": "InfinityFlow S1 Plus — Live Demo Tonight",
                    "description": "Use the whole spool, down to the last gram — no pause, no purge",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "The End-of-Spool Problem, Solved?",
                            "body": "Our 5 kg unit arrived yesterday, so tonight you get a live demo instead of a review of someone else's. The InfinityFlow S1 Plus is a standalone device with one job: when a spool runs out, it feeds the next one — mid-print, no pause, no cutting, no purging. Because it sits outside the printer, it claims to work with any machine: any firmware, any brand, any type. For long and large prints, that's the whole pitch.",
                            "bullets": [
                                "Uses literally the last bit of every spool — the end-of-roll graveyard goes away",
                                "Standalone and printer-agnostic: no firmware mods, adapters listed for Bambu, Elegoo, Creality and more",
                                "Roller options up to 5 kg spools — ours is the 5 kg setup you'll see tonight",
                                "$179.99 right now (down from $210.99), about a 1-week lead time",
                                "Our link gets you an extra $10 off — and yes, watch the demo before you decide"
                            ],
                            "link": "https://infinityflow3d.com/products/s1-plus-automatic-filament-loader?ad_id=9x9fB1JzoD",
                            "linkLabel": "InfinityFlow S1 Plus ($10 Off)"
                        }
                    ]
                },
                {
                    "id": "builder-spotlight",
                    "title": "Builder Spotlight: Rocco's Stuff",
                    "description": "A fully 3D-printed coin-operated vending machine — free files and all",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "A Vending Machine You Print",
                            "body": "This week's spotlight goes to Rocco's Stuff, a channel that builds proper mechanical machines out of printed parts. The star: a fully 3D-printed, coin-operated vending machine for fun-size candy bars — real coin mechanism, real vending coils, and he keeps reinventing it.",
                            "videoUrl": "https://youtu.be/7GeJV4fl4lU"
                        },
                        {
                            "heading": "The Build — and the Files",
                            "bullets": [
                                "Takes US quarters, or the included printable discs if you'd rather not bank real change",
                                "A keyed door on the back unlocks restocking and the coin drawer",
                                "July update: Euro-coin mechanisms, an improved lock bolt, doors for stacking multiple units, and a coil redesign that prints support-free",
                                "The files are FREE on Printables and MakerWorld — print one for your desk, your shop, your kid",
                                "The channel is all mechanical builds like this — worth a follow"
                            ],
                            "links": [
                                {
                                    "label": "Rocco's Stuff on Printables",
                                    "url": "https://www.printables.com/@RoccosStuff/models"
                                }
                            ]
                        }
                    ]
                },
                {
                    "id": "quick-tip",
                    "title": "Quick Tip of the Week",
                    "description": "A dried spool isn't a done spool",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Quick Tip: Dryer → Sealed Box, Immediately",
                            "body": "It's August, it's humid, and here's the part of filament drying nobody tells you: the drying isn't the hard part — keeping it dry is. Nylon and PVA can re-absorb enough moisture to print badly within hours of leaving the dryer; even PLA degrades over a few weeks in open summer air. The fix costs less than a spool:",
                            "bullets": [
                                "The moment drying finishes, the spool goes into a sealed container — never onto the shelf 'for now'",
                                "A cereal container with silica gel and a $5 hygrometer is a real dry box — aim for under 25% RH, under 15% for nylon",
                                "Indicating silica shows you when it's spent; recharge it in the oven at 120 °C for 1–2 hours, forever",
                                "Print from the dry box on hygroscopic materials — a feed hole and a PTFE stub is all it takes"
                            ],
                            "link": "https://slice-lab.com/en/guide-humidity",
                            "linkLabel": "Slice Lab's Humidity Guide"
                        }
                    ]
                },
                {
                    "id": "community-news",
                    "title": "Community News & Topics",
                    "description": "Share what you're interested in talking about!",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Next Week's Meetup",
                            "body": "Find something you're interested in talking about? Share it here and we'll cover it in next week's meetup!",
                            "link": "https://github.com/MaxSikorski/3d-printing-weekly-news/issues",
                            "linkLabel": "Submit a Topic"
                        }
                    ]
                }
            ]
        },
        "2026-W31": {
            "week": "2026-W31",
            "date": "2026-07-30",
            "title": "M1D Goes Live, INDX Nozzles Aren't Hardened & HT-PLA's Fine Print",
            "subtitle": "This week in 3D printing news",
            "timerMinutes": 20,
            "topics": [
                {
                    "id": "sovol-m1d-live",
                    "title": "Sovol M1D Is LIVE — and We Ordered Two",
                    "description": "The 1+6 toolchanger finally launched — and blew past its goal 15× on day one",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "The Waiting Is Over: M1D Launches",
                            "body": "We've been tracking this one for weeks — last Wednesday it was still 'Launching soon' with 2,305 followers and no date. Monday morning it went live, and the crowd we watched build finally got to open their wallets. They did: the campaign obliterated its goal within hours. And yes — we put our money where the coverage is and ordered TWO.",
                            "bullets": [
                                "Launched July 28; HK$23,309,857 pledged by 1,884 backers against a HK$1.5 million goal — about US$2.97 million and climbing",
                                "Super Early Bird: ~US$1,299 Essential / ~US$1,599 Advanced",
                                "The pitch, one more time: IDEX crossed with a toolchanger — 1 active + 6 parked toolheads, ~5-second swaps, near-zero purge",
                                "Sovol keeps leaning on the open-source positioning",
                                "Those spec claims are still campaign claims — nobody outside Sovol has tested a production M1D yet"
                            ],
                            "link": "https://www.kickstarter.com/projects/sovol/sovol-m1d-idex-tool-changing-3d-printer",
                            "linkLabel": "M1D on Kickstarter",
                            "product": "sovol-m1d"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Usual Kickstarter rules: it's a pledge, not a purchase — who else in the room backed it?",
                                "US$2.97M in two days for a purge-killer: is this the demand signal Bambu can't ignore?",
                                "We'll report from the front of the line when ours arrive — hold us to it"
                            ]
                        }
                    ]
                },
                {
                    "id": "indx-nozzles-not-hardened",
                    "title": "INDX Nozzles Aren't Hardened — Bondtech Comes Clean",
                    "description": "Sold as hardened, measured at HRC 30 — and our recommendation has changed",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Hardened on the Box, Not in the Steel",
                            "body": "Last week we told you INDX conversion kits were days from shipping. This week the toolchanger story took a hard turn: after 3D Musketeers put the nozzles under scrutiny on PrintFixFriday, Bondtech published an official update on July 29 admitting the 'hardened, abrasive-resistant' nozzles that shipped… aren't.",
                            "videoUrl": "https://youtu.be/VEdDrMN3UtI"
                        },
                        {
                            "heading": "What Bondtech Admitted",
                            "bullets": [
                                "The shipped nitrocarburized nozzles measure about HRC 30–32 — Bondtech's own number for truly hardened steel is HRC 55–60",
                                "Every Founders Edition nozzle and the initial Prusa-kit batches are affected",
                                "Carbon-fiber, glass-fiber, glow, and metal-fill filaments will chew through these nozzles fast",
                                "Non-abrasive materials remain fine — that's Bondtech's own framing, and it's honest",
                                "Bondtech is offering returns and refunds; genuinely hardened production is 'many months' away"
                            ],
                            "links": [
                                {
                                    "label": "Bondtech's Official Update",
                                    "url": "https://www.bondtech.se/2026/07/29/indx-hardened-nozzles-update/"
                                }
                            ]
                        },
                        {
                            "heading": "Our Call: Wait",
                            "body": "We've been INDX optimists since the reveal — the purge-tower math still favors it, and nothing about the architecture changed. But a launch that ships spec-sheet promises the steel can't back is a launch that isn't done. Painful conclusion, familiar shape:",
                            "bullets": [
                                "Prusa's conversion-kit product page still listed the nozzles as 'Hardened' while we built this deck",
                                "Our group's recommendation: do NOT buy or set up INDX until the nozzle situation is fully sorted",
                                "It's sad — and it's nearly identical to what early Prusa XL buyers went through: right idea, shipped before it was ready"
                            ]
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Anyone here holding a Founders Edition or an April kit order — refund, or ride it out on non-abrasives?",
                                "Does a self-reported HRC confession make you trust Bondtech more or less than silence would?",
                                "The XL recovered and became a great machine. What does INDX have to do to earn that arc?"
                            ]
                        }
                    ]
                },
                {
                    "id": "printed-solid-prusa-usa",
                    "title": "Printed Solid Is Now Prusa USA",
                    "description": "Prusa's U.S. arm gets a name that says the quiet part out loud",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Printed Solid → Prusa USA Inc.",
                            "body": "Delaware's Printed Solid — the shop that's been Prusa's U.S. distributor and assembly operation for years — legally rebranded to Prusa USA Inc. this week, per Tom's Hardware. For U.S. buyers this is the formalization of something that was already true: domestic Prusa assembly, support, and warranty handling under Prusa's own name.",
                            "bullets": [
                                "Reported July 25; the transition branding is 'Printed Solid, a Prusa Company'",
                                "Day-to-day operations are explicitly unchanged — same people, same warehouse",
                                "The interesting question is what a first-party U.S. footprint sets up next: tariff insulation, faster support, maybe U.S.-assembled CORE Ones"
                            ],
                            "link": "https://www.tomshardware.com/3d-printing/delawares-printed-solid-rebrands-to-prusa-usa",
                            "linkLabel": "Read at Tom's Hardware",
                            "product": "prusa-core-one"
                        }
                    ]
                },
                {
                    "id": "ht-pla-pro-fine-print",
                    "title": "HT-PLA Pro Follow-Up: Read the Fine Print",
                    "description": "The 148 °C headline is real — but the number that matters needs an oven",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Heat Under Load: Annealing Changes Everything",
                            "body": "Last week we covered Polymaker's HT-PLA Pro launch and its sold-out day one. This week we did our homework on the spec sheet, and there's a distinction every buyer should understand before expecting a 100 °C-class part straight off the plate. The headline 148.3 °C figure is Vicat — a no-load softening test. Put the part under actual load and the as-printed number tells a different story:",
                            "bullets": [
                                "Heat deflection under load (0.45 MPa), as printed: 56.3 °C — regular-PLA territory",
                                "The same test after annealing: 107.6 °C — THAT'S where the 100 °C-class claim lives",
                                "The anneal itself is easy: 100 °C for 30 minutes",
                                "Full disclosure, as always: Polymaker is one of the brands we work with — which is exactly why we're reading their datasheet this closely",
                                "Bottom line: still an incredible filament — you just have to anneal it to get the headline performance"
                            ],
                            "link": "https://shop.polymaker.com/products/polymaker-ht-pla-pro",
                            "linkLabel": "HT-PLA Pro at Polymaker"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Annealing shrinks and warps some geometries — who's tried it on a dimensionally critical part?",
                                "Does 'anneal to unlock it' change your use case, or is 30 minutes at 100 °C a non-issue?",
                                "Vicat vs HDT on the same box: should filament makers be forced to lead with the load-bearing number?"
                            ]
                        }
                    ]
                },
                {
                    "id": "bambuddy-command-center",
                    "title": "Bambuddy: Your Self-Hosted Bambu Command Center",
                    "description": "Local monitoring, job history, and print queues — on your hardware, not Bambu's cloud",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "Your Printers, Your Server, Your Data",
                            "body": "Bambuddy is an open-source, self-hosted command center for Bambu Lab printers — it talks to your machines locally over Developer Mode, so monitoring, job history, and queue management live on YOUR hardware instead of Bambu's cloud. The Lesser The Besser's new video takes it further, pairing it with TrueNAS and Tailscale into a fully private print cloud you can reach from anywhere.",
                            "videoUrl": "https://youtu.be/ea6_EunDp10"
                        },
                        {
                            "heading": "What You Get",
                            "bullets": [
                                "AGPL-3.0 open source, self-hosted",
                                "Local Developer-Mode connection — printer monitoring, job history/archive, queue management",
                                "The video's stack: Bambuddy + TrueNAS + Tailscale = private print cloud",
                                "A live public demo lets you click around before installing anything"
                            ],
                            "links": [
                                {
                                    "label": "Bambuddy",
                                    "url": "https://bambuddy.cool/"
                                },
                                {
                                    "label": "Bambuddy on GitHub",
                                    "url": "https://github.com/maziggy/bambuddy"
                                },
                                {
                                    "label": "Bambuddy Demo",
                                    "url": "https://demo.bambuddy.cool/"
                                }
                            ]
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "After the Bambu ecosystem-lockdown fights, how many of you want the cloud OUT of your print farm?",
                                "It's a self-hosted command center — not a drop-in replacement for everything the Handy app does. Which features would you actually miss?",
                                "Who's already running TrueNAS or Tailscale and could stand this up this weekend?"
                            ]
                        }
                    ]
                },
                {
                    "id": "modly-local-image-to-3d",
                    "title": "Modly: Image → 3D Model, Fully Local",
                    "description": "An MIT-licensed desktop app that keeps the AI on your machine",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Image-to-3D Without the Cloud",
                            "body": "The image-to-3D generators we've covered all run in someone else's cloud — your pictures go up, a mesh comes down, and a subscription meter runs. Modly flips that: it's an MIT-licensed desktop app that runs open-source AI models entirely on your own machine. Feed it an image, get a printable mesh, and nothing ever leaves your computer.",
                            "bullets": [
                                "Runs the AI models locally — offline and private",
                                "Windows, Linux, and Apple-silicon macOS builds",
                                "Exports STL, OBJ, GLB, and PLY",
                                "Plan for 16 GB+ RAM; the heavier models want roughly 8 GB of GPU VRAM",
                                "Expectation check: treat it as a tool to TRY — nobody's proven one-click print-ready output yet"
                            ],
                            "link": "https://github.com/lightningpixel/modly",
                            "linkLabel": "Modly on GitHub"
                        }
                    ]
                },
                {
                    "id": "lumina-studio-color-calibration",
                    "title": "Lumina Studio: Camera-Calibrated Multicolor",
                    "description": "Stop guessing what your filaments blend into — measure it with a camera",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Calibrate Color From Photographs",
                            "body": "Every multicolor workflow we've shown — ColorMix halftoning, ImageMap overhang tricks — ultimately guesses how your filaments blend. Lumina Studio measures it instead: print its calibration plates with your actual filaments, photograph them with your actual camera, and it maps the colors your printer really produces before building the print job.",
                            "bullets": [
                                "Free and open source",
                                "Works with 2–8 loaded colors",
                                "The calibration loop covers your printer, filaments, lighting, and camera — not a theoretical color model",
                                "Exports 3MF straight into Bambu Studio or OrcaSlicer"
                            ],
                            "link": "https://github.com/lumina-layer-studio/Lumina-Layers",
                            "linkLabel": "Lumina Layers on GitHub"
                        }
                    ]
                },
                {
                    "id": "prusawire-r1",
                    "title": "Prusawire R1: Your Old MK3/MK4 Parts, Reborn CoreXZ",
                    "description": "The half-a-printer left over from your upgrade wants a second life",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Turn the Donor Printer Into a CoreXZ",
                            "body": "If a CORE One or MK4 upgrade left a gutted MK3 on your shelf, this one's aimed straight at you. Prusawire R1 is an open DIY conversion that reuses a Prusa MK3/MK4-family frame and leftover parts to build a Switchwire-style CoreXZ machine — the classic 'house build stuff' answer to half-a-printer-in-a-box syndrome.",
                            "bullets": [
                                "Open, documented DIY conversion — no kit purchase required",
                                "Reuses the Prusa frame, motion parts, and electronics you already own",
                                "What's reusable depends on your donor's configuration — read the docs before tearing down",
                                "No total-cost claim from us: it genuinely varies by what's in your parts bin"
                            ],
                            "link": "https://prusawire.positron3d.com/",
                            "linkLabel": "Prusawire R1 Documentation",
                            "product": "prusa-mk4s"
                        }
                    ]
                },
                {
                    "id": "nine-slicer-hacks",
                    "title": "9 Slicer Hacks — Two You Need Today",
                    "description": "Nine minutes of tips; two of them changed how we set up prints this week",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "Two Slicer Moves to Steal",
                            "body": "Printcademy packed nine slicer tricks into nine minutes, and while the whole video is worth your lunch break, two of them stopped us cold — the first two we genuinely didn't know. We'll walk the rest live, but two are the keepers:",
                            "videoUrl": "https://youtu.be/tPWG06UIIi4"
                        },
                        {
                            "heading": "The Two Keepers",
                            "bullets": [
                                "Threaded connectors, IN the slicer: Bambu Studio's thread model drops printable screw threads onto parts without touching CAD — exactly what we were talking about last week, Brian",
                                "Exact-scale from a measurement: measure any feature, type the size it SHOULD be, and the whole model rescales proportionally to match",
                                "We tested the exact-scaling move in OrcaSlicer — works there too"
                            ]
                        }
                    ]
                },
                {
                    "id": "curve-cut-updates",
                    "title": "Curve Cut — Quick Update From the Workbench",
                    "description": "Hollowing work continues — and threads might be next",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Still on the Workbench",
                            "body": "Quick status on our free curve-slicing tool for anyone following along: the hollowing improvements we teased are still in the works — necessary updates first, ship date when it's ready, not before. And a new idea just jumped the queue: now that Bambu Studio has a thread model, we're seriously looking at adding thread support to Curve Cut's connector system. What's live today is still the launch version.",
                            "link": "https://maxsikorski.github.io/curve-cut/",
                            "linkLabel": "Try Curve Cut"
                        }
                    ]
                },
                {
                    "id": "builder-spotlight",
                    "title": "Builder Spotlight: John Boss's Beach Robot",
                    "description": "A cooler, a handle, wheels — and nobody carries anything to the beach again",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "A Robot Built for Beach Duty",
                            "body": "This week's spotlight is pure summer engineering joy: John Boss got tired of hauling beach gear, so he built a robot to do it — basically a cooler and a handle on wheels, done properly.",
                            "videoUrl": "https://youtu.be/K6y0kSSMVfw"
                        },
                        {
                            "heading": "The Build",
                            "bullets": [
                                "A homemade hauler that carries his cooler and beach gear across sand so he doesn't have to",
                                "The video covers the whole build arc — frame, electronics, testing, and the real beach run",
                                "Watch it for the iteration: every version that failed on sand taught the next one something"
                            ],
                            "links": [
                                {
                                    "label": "John Boss on YouTube",
                                    "url": "https://www.youtube.com/@john-boss"
                                }
                            ]
                        }
                    ]
                },
                {
                    "id": "quick-tip",
                    "title": "Quick Tip of the Week",
                    "description": "PTFE tube + printed PETG = real bearings",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "Quick Tip: PTFE Tube Bearings",
                            "body": "File this one under 'why didn't we think of that': Printabot shows how to make genuinely effective linear and rotary bearings from PTFE tube seated in a printed PETG housing. PTFE is one of the slipperiest solids you can buy, and the tube form is cheap and everywhere. The video is in Spanish — subtitles handle it fine, and the technique needs no translation.",
                            "videoUrl": "https://youtu.be/2UZ4EHST6_M"
                        },
                        {
                            "heading": "Making It Work",
                            "bullets": [
                                "Dial in the tube fit in the printed housing before committing to the full part",
                                "Orient the print so the bearing load works with the layers, not against them",
                                "Cut and prep the PTFE tube cleanly, then lubricate the finished bearing"
                            ]
                        }
                    ]
                },
                {
                    "id": "community-news",
                    "title": "Community News & Topics",
                    "description": "Share what you're interested in talking about!",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Next Week's Meetup",
                            "body": "Find something you're interested in talking about? Share it here and we'll cover it in next week's meetup!",
                            "link": "https://github.com/MaxSikorski/3d-printing-weekly-news/issues",
                            "linkLabel": "Submit a Topic"
                        }
                    ]
                }
            ]
        },
        "2026-W30": {
            "week": "2026-W30",
            "date": "2026-07-23",
            "title": "INDX Kits Ship Within Days, Polymaker's Best Filament Yet & Pressure Advance Goes Automatic",
            "subtitle": "This week in 3D printing news",
            "timerMinutes": 20,
            "topics": [
                {
                    "id": "indx-deep-dive",
                    "title": "INDX — the Deep Dive, Because Kits Ship Within Days",
                    "description": "Missed last week? Here's the whole story — plus the details we didn't have room for",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "INDX in 60 Seconds — the Recap",
                            "body": "A lot of you missed last week, and this story is moving too fast to skip. INDX is Bondtech's toolchanger: ONE smart toolhead does all the heating and driving, and swaps between cheap passive tools — each with its own nozzle and its own material path. No purge tower, no flushing half a spool into the bin.",
                            "bullets": [
                                "Founders Edition units: shipped and in early adopters' hands",
                                "Dev kit orders re-opened July 15 (the July 3 launch died of website issues): $390 smart toolhead, $40 passive tools, ~$1,250 for a full 8-tool setup, ships late Aug–Sept",
                                "The dev kit is the BYO-printer path — Voron, Sovol, custom builds; geometry and tool CAD are on GitHub"
                            ],
                            "link": "https://www.bondtech.se/indx-by-bondtech/",
                            "linkLabel": "INDX by Bondtech",
                            "product": "bondtech-indx"
                        },
                        {
                            "heading": "The Big One: CORE One Kits Start Shipping by July 31",
                            "body": "Per Prusa's July 'State of INDX' post, the standard Conversion Kit for the CORE One/+ has first units leaving the factory by the END OF THIS MONTH — that's within days — and the whole first batch ships by the end of August. April's sell-out crowd is about to get hardware.",
                            "bullets": [
                                "Redesigned front docking panel — you can actually see your parked tools now",
                                "Silicone nozzle cleaner + waste bin; priming pellets average a tiny 0.013–0.015 g",
                                "Inductive sensor auto-calibrates tool offsets — no manual paper-shim ritual",
                                "Budget a real afternoon: install runs about 5–6 hours",
                                "Four more print profiles and firmware updates on the way"
                            ],
                            "link": "https://blog.prusa3d.com/indx_july_2026_update_137377/",
                            "linkLabel": "State of INDX — July Update"
                        },
                        {
                            "heading": "ColorMix and the Waste Math",
                            "bullets": [
                                "ColorMix: halftoning across a CMYKW+RGB 8-tool loadout fakes DOZENS of color tones from 8 spools — the 'infinite colors' idea, done with toolheads",
                                "Prusa's own waste test on a typical multi-color model: 29 g with INDX vs up to 696.4 g on competing purge-based systems (their numbers — but a 24× gap survives a lot of skepticism)",
                                "That's the whole INDX pitch in one stat: every material keeps its own path, so nothing gets flushed"
                            ]
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Conversion kit on a CORE One vs dev kit on a machine you already own — which path is yours?",
                                "Is 29 g vs ~700 g the stat that finally kills the purge tower argument?",
                                "Anyone in the April order batch — watching the mailbox yet?"
                            ]
                        }
                    ]
                },
                {
                    "id": "toolchanger-wars-round-2",
                    "title": "The Toolchanger Wars, Round 2 — a New Challenger Appears",
                    "description": "The July standings, one week later: Sovol still counting followers, HeyGears crashes the party",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "The Board, One Week Later",
                            "body": "Last week we mapped the war over killing the purge tower. Seven days on, the board has a new player:",
                            "bullets": [
                                "Bondtech INDX — kits ship within days (previous topic). The pace car right now",
                                "Sovol M1D — still 'launching soon'… but the crowd is growing fast",
                                "HeyGears G1 — NEW ENTRANT: launched on Kickstarter TODAY, and it fights with ink, not toolheads",
                                "Creality KliTek — nozzle-swap system on the K3, still slated for fall",
                                "FlashForge Creator 5 — four heads, $699 after cart discount, still shipping now (and our business-practices caveat still applies)",
                                "Snapmaker U1 — still the one you can buy today; 'U1 Max' rumor: STILL nothing public, still just a rumor"
                            ],
                            "product": "snapmaker-u1"
                        },
                        {
                            "heading": "Sovol M1D — Still Pre-Launch, Crowd +20% in a Week",
                            "body": "We checked the Kickstarter page again today: still 'Launching soon,' still no date. But the follower count tells its own story — 2,305 now, up from 1,911 when we checked last Wednesday. Nearly 400 people joined the waitlist in seven days.",
                            "bullets": [
                                "The pitch, for the recap crowd: IDEX crossed with a toolchanger — '1+6 toolheads,' up to 7 colors/materials, 5-second swaps, near-zero purge",
                                "From $1,199 pre-order early-bird (~$200 off) — we hold a $20 VIP deposit ourselves",
                                "Sovol's claim to fame: first-ever IDEX + toolchanger in one machine"
                            ],
                            "link": "https://www.kickstarter.com/projects/sovol/sovol-m1d-idex-tool-changing-3d-printer",
                            "linkLabel": "M1D on Kickstarter",
                            "product": "sovol-m1d"
                        },
                        {
                            "heading": "HeyGears G1 — Full Color Without the Toolchanger",
                            "body": "Launched on Kickstarter this morning (9 AM Pacific): HeyGears calls the G1 Series the world's first desktop full-color 3D and UV printer. It's a modular 3-in-1 — full-color 3D printing, 3D-textured UV printing, and flat 2D UV printing in one machine — aimed at creators and small customization businesses. And the launch detonated: past $5.5 MILLION pledged against a $100k goal from 1,300 backers on day one (we checked mid-afternoon — it'll be higher by the time you read this).",
                            "bullets": [
                                "The angle that matters for this board: color via UV inkjet instead of juggling toolheads — a completely different answer to the same multicolor question",
                                "Claims 10M+ colors, full-color and transparent in one print, auto-calibration",
                                "Super Early Bird from $1,999 (G1 Starter, $2,699 MSRP); the G1X with the full 3D resin station starts at $3,299 ($4,999 MSRP)",
                                "Usual Kickstarter rules apply: it's a pledge, not a purchase — and HeyGears is at least an established manufacturer, not a garage startup",
                                "If it delivers, 'multicolor' stops being a toolchanger-only conversation"
                            ],
                            "link": "https://www.kickstarter.com/projects/heygears/heygears-g1-series-first-desktop-full-color-3d-and-uv-printer",
                            "linkLabel": "G1 Series on Kickstarter"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Toolheads vs inkjet color: is the G1 even fighting the same war, or starting a new one?",
                                "M1D's waitlist grew ~20% in a week without a launch date — smart demand-building or stalling?",
                                "Still the elephant: Bambu stays silent. Who's most exposed when they finally move?"
                            ]
                        }
                    ]
                },
                {
                    "id": "polymaker-ht-pla-pro",
                    "title": "Polymaker HT-PLA Pro — 'The Best Filament We've Ever Made'",
                    "description": "PLA that shrugs off 148 °C, prints like PLA, made in the USA — and it sold out on day one",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "PLA's Big Weakness, Patched",
                            "body": "Polymaker launched HT-PLA Pro today, calling it the best filament they've ever made. The pitch: PLA's famous printability with the heat resistance that's always been its Achilles' heel — a Vicat softening point of 148.3 °C straight off the build plate, 150.5 °C if you anneal. Regular PLA taps out around 60.",
                            "bullets": [
                                "Prints like PLA: 210–230 °C nozzle, standard brass nozzle, no enclosure, bed as low as 25 °C, speeds up to 300 mm/s",
                                "Tough, fatigue-resistant recipe aimed at functional parts, not just trinkets",
                                "$25.99 per kilo, 17 colors, made in the USA",
                                "Sold out on Polymaker's shop on launch day — the market has spoken"
                            ],
                            "link": "https://shop.polymaker.com/products/polymaker-ht-pla-pro",
                            "linkLabel": "HT-PLA Pro at Polymaker"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Full disclosure, as always: Polymaker is one of the brands we work with — and this launch is why",
                                "A no-enclosure, brass-nozzle filament that survives a car dashboard in July: what does this replace in YOUR lineup — PETG? ABS?",
                                "Who's grabbing a spool for a torture test the moment it restocks?"
                            ]
                        }
                    ]
                },
                {
                    "id": "big-box-silver-pla",
                    "title": "Big-Box Filament Showdown: Michaels vs Best Buy vs Hobby Lobby",
                    "description": "Filament while-you-wait is now a real thing at three national chains",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "The Craft Store Filament Era Is Here",
                            "body": "Prints Charming grabbed silver PLA from Michaels, Best Buy, and Hobby Lobby and put them head-to-head. The quiet story: you can now walk into three national big-box chains and leave with filament the same afternoon. The impulse-buy era of 3D printing supplies has officially arrived.",
                            "videoUrl": "https://youtu.be/GBGnEv9WS9M"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Our own experience: we've run the Hobby Lobby spools before and they genuinely impressed us — so the Michaels and Best Buy runs are now on our to-try list",
                                "Same-day filament within 15 minutes of your house: does this change what you keep in stock at home?",
                                "Anyone already tried the Michaels or Best Buy house spools? Report in"
                            ]
                        }
                    ]
                },
                {
                    "id": "orcaslicer-imagemap",
                    "title": "OrcaSlicer ImageMap — Full-Spectrum Color From a Handful of Spools",
                    "description": "Print photos ON the walls of your prints — no paint, no hydro-dip, no thousand tool changes",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "Images on the SIDE of Your Print",
                            "body": "This one is genuinely unique: OrcaSlicer-ImageMap is a free fork of OrcaSlicer that prints full-color images on the side surfaces of your models. The trick is 'overhang modulation' — it cycles a fixed set of colors (think CMYK) and varies how much each layer's edge overhangs, so the blend your eye sees can hit essentially any color in the spectrum.",
                            "bullets": [
                                "One tool change per LAYER — not per color region — which is why YGK3D's testing found it cuts multicolor print times roughly in half",
                                "Imports textured OBJ/glTF/GLB models, projects images, renders text — it'll even print pictures on your prime tower",
                                "Free and open source (AGPL), beta builds for Windows and macOS on GitHub"
                            ],
                            "videoUrl": "https://youtu.be/B5cvfSPWjlU"
                        },
                        {
                            "heading": "Try It / Discussion",
                            "bullets": [
                                "AMS or toolchanger owners: this squeezes photo-grade color out of hardware you already have",
                                "It's a beta fork — expect rough edges, and slice something you don't love first",
                                "Between this, ColorMix halftoning, and UV inkjet — 'full color' suddenly has three totally different roads"
                            ],
                            "link": "https://github.com/sentientstardust-dev/OrcaSlicer-ImageMap",
                            "linkLabel": "ImageMap on GitHub"
                        }
                    ]
                },
                {
                    "id": "load-cell-pressure-advance",
                    "title": "Pressure Advance, Calibrated by the Bed Sensor You Already Have",
                    "description": "CNC Kitchen automates the most tedious calibration in FDM — with a load cell",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "No More Squinting at Test Lines",
                            "body": "Pressure advance calibration usually means printing test patterns and squinting at which line looks least bad. Stefan at CNC Kitchen just showed a much smarter way: use a load-cell bed sensor to MEASURE nozzle pressure directly — the extruder runs a controlled acceleration ramp against the sensor, and math does the judging. It's the same trick Bambu and Snapmaker machines quietly do with their built-in sensors, now in the open.",
                            "videoUrl": "https://youtu.be/sHLGrTBLxLg"
                        },
                        {
                            "heading": "The Open-Source Path: bd_pressure",
                            "bullets": [
                                "Stefan's Prusa-based build rides on markniu's open-source bd_pressure project — a strain-gauge sensor that pulls double duty as a nozzle probe AND a pressure-advance instrument",
                                "Works with Klipper and RepRapFirmware; E3D and Voron toolhead mounts; MIT licensed",
                                "Results land in the same ballpark as Bambu's factory auto-calibration — from a part you can buy from the usual Voron vendors",
                                "The bigger arc: flagship-printer 'magic' keeps getting reverse-engineered into open source within a year or two"
                            ],
                            "link": "https://github.com/markniu/bd_pressure",
                            "linkLabel": "bd_pressure on GitHub"
                        }
                    ]
                },
                {
                    "id": "shapr3d-slicer-export",
                    "title": "Shapr3D Now Exports Straight to Your Slicer",
                    "description": "Design on the iPad, hit export, land in PrusaSlicer or EasyPrint",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "One Less Hop Between CAD and Print",
                            "body": "Shapr3D — the tablet-first CAD app a lot of our CAD-class folks already use — added direct export to PrusaSlicer and Prusa's cloud slicer EasyPrint. Model, tap export, and you're staged to print. The sleeper detail: EasyPrint can push jobs over LAN to plenty of NON-Prusa printers too, with the essential settings covered — so for simple parts, the full desktop slicer never even opens.",
                            "link": "https://www.shapr3d.com/",
                            "linkLabel": "Shapr3D"
                        }
                    ]
                },
                {
                    "id": "cgtrader-ai-numbers",
                    "title": "1 in 6 Uploads, 1 in 90 Dollars — CGTrader's AI Report Card",
                    "description": "The marketplace numbers behind the AI-model hype",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "The Numbers",
                            "body": "3D model marketplace CGTrader published its yearly trends report, and it's the first hard data we've seen on AI-generated models in the wild. Demand for 3D-PRINTABLE models grew faster than general CG models — good news for our side of the hobby. The AI slice is where it gets interesting:",
                            "bullets": [
                                "Roughly 1 in 6 new uploads is AI-generated…",
                                "…but AI models earn only about 1 dollar in every 90 of marketplace revenue",
                                "Only 1 in 25 buyers who printed an AI model says it 'works well'",
                                "72% of buyers haven't touched an AI-generated model at all"
                            ],
                            "link": "https://www.cgtrader.com/",
                            "linkLabel": "CGTrader Report"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Flood of supply, trickle of value — is AI generation actually getting closer to printable, or just closer to pretty renders?",
                                "Have you successfully PRINTED an AI-generated model? What did it take to fix it?",
                                "Prediction time: what does this 1-in-90 revenue number look like this time next year?"
                            ]
                        }
                    ]
                },
                {
                    "id": "curve-cut-update",
                    "title": "Curve Cut — Quick Update From the Workbench",
                    "description": "Hollowing improvements are done — shipping next week",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Curve Cut: What's Cooking",
                            "body": "Quick reminder for anyone who missed the unveil: Curve Cut is our free, browser-based tool that slices models along drawn curves instead of flat planes — with connector pegs, presets, and a BIG Print mode that grid-cuts models bigger than your bed. Status update: we've been heads-down on it this week and the hollowing improvements are DONE — that work ships next week. Nothing new on the GitHub yet, so what's live today is still the launch version. Consider this the calm before the update.",
                            "link": "https://maxsikorski.github.io/curve-cut/",
                            "linkLabel": "Try Curve Cut"
                        }
                    ]
                },
                {
                    "id": "crown-molding-print",
                    "title": "Print File of the Week: Crown Molding With a Built-In LED Strip",
                    "description": "Print your own trim — with a light channel where the dust would be",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Crown Molding, Off the Printer",
                            "body": "File find of the week: printable crown molding with an integrated LED strip channel, free on Printables from maker BTCB. Print trim sections, chain them along the wall, drop a strip in the channel, and you've got indirect cove lighting without a single piece of MDF. It's an excellent idea — the kind of 'wait, I can just PRINT that' home project this hobby is for.",
                            "bullets": [
                                "Sections chain along the wall — print as many as the room needs",
                                "The LED channel aims the light up the wall for a clean indirect glow",
                                "Painted PLA or PETG passes for real trim once it's on the ceiling"
                            ],
                            "link": "https://www.printables.com/model/1775449-crown-molding-with-led-strip",
                            "linkLabel": "Crown Molding on Printables"
                        }
                    ]
                },
                {
                    "id": "quick-tip",
                    "title": "Quick Tip of the Week",
                    "description": "How to print 'glass'",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Quick Tip: How to Print Glass",
                            "body": "Want prints that look like glass? The classic 'How To Print Glass' guide by Rygar1432 on Printables shows transparent prints are a settings game, not a filament miracle. The short version: use a clear PETG or PCTG, print SLOW, print HOT — hotter than you think — and use fine layers so the light passes through fewer, better-fused boundaries. Patience is the actual ingredient: the test pieces prove clear parts come off a stock printer.",
                            "link": "https://www.printables.com/model/15310-how-to-print-glass",
                            "linkLabel": "How To Print Glass",
                            "products": [
                                "petg",
                                "pctg"
                            ]
                        }
                    ]
                },
                {
                    "id": "community-news",
                    "title": "Community News & Topics",
                    "description": "Share what you're interested in talking about!",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Next Week's Meetup",
                            "body": "Find something you're interested in talking about? Share it here and we'll cover it in next week's meetup!",
                            "link": "https://github.com/MaxSikorski/3d-printing-weekly-news/issues",
                            "linkLabel": "Submit a Topic"
                        }
                    ]
                }
            ]
        },
        "2026-W29": {
            "week": "2026-W29",
            "date": "2026-07-16",
            "title": "Curve Cut Goes Live, INDX Opens Orders & the Toolchanger Wars Heat Up",
            "subtitle": "This week in 3D printing news",
            "timerMinutes": 20,
            "topics": [
                {
                    "id": "indx-dev-kit-orders",
                    "title": "INDX Dev Kit — Orders Open, For Real This Time",
                    "description": "The July 3 launch faceplanted; July 15's actually stuck",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Second Launch's the Charm",
                            "body": "Bondtech's original July 3 dev-kit launch collapsed under website issues — orders simply wouldn't go through. Two weeks of work with their hosting partner later, orders re-opened Wednesday, July 15 at 15:00 CEST. This came straight to subscriber inboxes on the 14th — and this time, the store held.",
                            "imageUrl": "photos/INDX_email-post.png"
                        },
                        {
                            "heading": "What $390 Buys — and What It Doesn't",
                            "bullets": [
                                "The Smart Toolhead is $390 — one per printer; it does the heating and driving",
                                "The $40 passive tools are what it actually swaps — that's the whole INDX trick",
                                "A full 8-tool setup with docks, link board, and cables lands around $1,250",
                                "Shipping: late August into September",
                                "This kit is the BYO-printer path — aimed at Voron, Sovol, and custom builds. 'Open by design': reference geometry and tool CAD live on GitHub"
                            ],
                            "link": "https://www.bondtech.se/product/indx-development-kit/",
                            "linkLabel": "INDX Development Kit",
                            "product": "bondtech-indx"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Dev kit on your own machine vs. the CORE One conversion kit — which path tempts you?",
                                "~$1,250 for 8 purgeless tools on a printer you already own — fair math?",
                                "Anyone here actually order — and did the site survive you this time?"
                            ]
                        }
                    ]
                },
                {
                    "id": "toolchanger-wars",
                    "title": "The Toolchanger Wars — July 2026 Standings",
                    "description": "Sovol, Creality, FlashForge, Snapmaker — the fight over your next multi-material machine",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Suddenly, Everyone Has a Toolchanger",
                            "body": "Purge towers are the enemy — the war is over how to kill them. The July 2026 board:",
                            "bullets": [
                                "Bondtech INDX — one smart head, cheap passive tools, open ecosystem (see previous topic)",
                                "Sovol M1D — IDEX crossed with a toolchanger; Kickstarter imminent",
                                "Creality KliTek — swaps the nozzle, not the head; debuts on the K3 this fall",
                                "FlashForge Creator 5 — four independent heads at a price-fighter $699, shipping now",
                                "Snapmaker U1 — whole-head swaps, shipping since late 2025 off a $20.6M Kickstarter record",
                                "And the DIY corner never left: Voron toolchangers keep getting easier to build"
                            ]
                        },
                        {
                            "heading": "Sovol M1D — 'Launching Soon,' Not Launched",
                            "body": "We checked the Kickstarter page last night: still pre-launch — a notify-me button and 1,911 followers, no public date. Don't let the coverage fool you into thinking it's live.",
                            "bullets": [
                                "DualX: one fixed extruder plus one tool-changing head — '1+6 toolheads,' up to 7 colors or materials",
                                "Near-zero purge waste, 5-second swaps, 300×300×350 mm, 600 mm/s, vision calibration, open source",
                                "Sovol's claim: the first-ever IDEX + toolchanger in one machine",
                                "From $1,199 — that's the pre-order early-bird price (roughly $200 off); final tiers at launch",
                                "We put down the $20 VIP deposit ourselves — early-bird locked"
                            ],
                            "link": "https://www.kickstarter.com/projects/sovol/sovol-m1d-idex-tool-changing-3d-printer",
                            "linkLabel": "M1D on Kickstarter",
                            "product": "sovol-m1d"
                        },
                        {
                            "heading": "Creality KliTek — Swap the Nozzle, Keep the Head",
                            "bullets": [
                                "Creality's entry (announced May 29) rides the upcoming K3: CoreXY, 260×260×260 mm, due this fall",
                                "Four nozzles garaged at the back of the chamber — the head clicks one on in under 5 seconds; a full color/material switch runs under 15",
                                "Mix nozzle sizes in one print: 0.4 mm for surface detail, 0.8 mm for bulk infill",
                                "TPU claims that raise eyebrows: 15 mm³/s on 95A (~7× typical) and stable extrusion down to soft 80A, helped by the S-Drive dual-power feed",
                                "Repositioning spec: within 25 µm after every swap",
                                "The strategy is the story: KliTek across a range of machines, not one flagship"
                            ],
                            "link": "https://www.creality.com/campaigns/creality-nozzle-changing-3d-printer-2026",
                            "linkLabel": "Creality K3 / KliTek"
                        },
                        {
                            "heading": "FlashForge Creator 5 — the Price Fighter",
                            "bullets": [
                                "Four independent toolheads, zero purge waste claimed, 256×256×256 mm, 300 mm/s print",
                                "$699 after the automatic $100 cart discount ($799 list) — undercuts everything else on this board",
                                "Shipping now — 1–2 week delivery. No Kickstarter, no 'coming this fall'",
                                "Broad material menu out of the box: TPU 90A/95A/64D, CF blends — high-temp set with the enclosure",
                                "Our caveat, stated plainly: good machine for the money, but we're not fans of FlashForge's business practices — go in eyes-open"
                            ],
                            "link": "https://www.flashforge.com/products/flashforge-creator-5",
                            "linkLabel": "Creator 5 Product Page"
                        },
                        {
                            "heading": "Snapmaker U1 — Shipping, Maturing… Growing?",
                            "bullets": [
                                "The one you can actually buy today: $899, 270³, four heads — and still improving",
                                "July 8 firmware added top-cover support, auto-refill across colors, and AI detection uploads",
                                "RUMOR CORNER — clearly labeled: a bigger U1 (350³ build volume, 6 toolheads) is making the rounds",
                                "We looked everywhere: nothing public, no leak, no filing. Pure rumor until receipts show up",
                                "Seen it somewhere real? Bring it to the community slot"
                            ],
                            "product": "snapmaker-u1"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Five machines, four architectures — whole head (U1, Creator 5), nozzle-only (KliTek), IDEX hybrid (M1D), passive tools (INDX): which wins the next two years?",
                                "What actually matters to you — swap speed, purge waste, or price per extra material?",
                                "The elephant: Bambu has been silent all year. When they move, does this whole board reshuffle?"
                            ]
                        }
                    ]
                },
                {
                    "id": "adidas-bb01",
                    "title": "adidas BB.01 — the First 3D-Printed Basketball Shoe",
                    "description": "$250, a printed lattice upper, and only 169 pairs on Earth",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Printed for the Court",
                            "body": "adidas released the BB.01 on July 14 — the first 3D-printed basketball shoe. A printed lattice upper engineered to wrap the foot, breathable windows along the sides, $250. It's the debut of Project R.A.P. — 'Radical Athlete Perception' — adidas's program for pushing additive manufacturing into performance footwear, sport by sport.",
                            "link": "https://3dprintingindustry.com/news/adidas-prints-bb-01-becomes-the-worlds-first-3d-basketball-shoe-253043/",
                            "linkLabel": "BB.01 Coverage"
                        },
                        {
                            "heading": "The Catch — and the Conversation",
                            "bullets": [
                                "169 pairs worldwide: 50 at the Las Vegas flagship (July 10), 89 on the CONFIRMED app (July 14), 30 in Greater China",
                                "So — real product line, or collector-bait marketing flex?",
                                "Lattice uppers at $250, while home printers push TPU lattices for pocket change: how far away is DIY performance footwear?",
                                "Printed midsoles took adidas years to reach real shelves — when does a printed UPPER go mass-market?"
                            ]
                        }
                    ]
                },
                {
                    "id": "makers-muse-hacks",
                    "title": "Five 3D Printing Hacks, Actually Tested",
                    "description": "Maker's Muse separates the keepers from the clickbait",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "Tested So You Don't Have To",
                            "body": "Angus at Maker's Muse ran five viral 3D-printing hacks through real testing — and the video dropped this morning, so you're seeing it the day it landed. Which ones survive contact with reality?",
                            "videoUrl": "https://youtu.be/JZ5rcWgxeFo"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Our favorite is the last one: isopropyl alcohol to pop TPU off the build plate — flexible prints release clean instead of fighting you",
                                "Which hacks do YOU swear by that everyone else doubts?",
                                "And which famous 'hack' turned out to be bunk when you actually tried it?"
                            ]
                        }
                    ]
                },
                {
                    "id": "filament-color-match",
                    "title": "Color Match — Find the Filament That Matches Anything",
                    "description": "Free tool: paste a color code, get the closest real spools",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "From Color Code to Spool",
                            "body": "Color Match on filamentcolors.xyz takes any color — hex, RGB, HSV, or LAB — and returns the closest real, physically measured filament swatches across brands and materials, ranked by ΔE color distance. Community-run, free, no ads. The honest caveat: it only knows swatches they've measured — but that library is the largest one going.",
                            "bullets": [
                                "Matching a client's brand color without ordering five spools on faith",
                                "Extending or repairing an old print when the original spool is long gone",
                                "Building multi-brand color schemes that actually agree with each other"
                            ],
                            "link": "https://filamentcolors.xyz/colormatch/",
                            "linkLabel": "Try Color Match"
                        }
                    ]
                },
                {
                    "id": "builder-spotlight",
                    "title": "Builder Spotlight: Curve Cut — Built Here, Live Now",
                    "description": "Last week we teased it. This week you can use it.",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Builder Spotlight: Curve Cut",
                            "body": "Last week we covered DaveRig Design's curved-cut tool and said we'd rebuild the concept for the browser — free, no install, no Blender. One week later: it's live. Curve Cut slices your models along drawn curves instead of flat planes, right in the browser. Full credit to DaveRig for the spark — this is our take on the tool the hobby was missing.",
                            "link": "https://maxsikorski.github.io/curve-cut/",
                            "linkLabel": "Try Curve Cut",
                            "reveal": {
                                "kicker": "One week later",
                                "label": "Unveil",
                                "confetti": true
                            }
                        },
                        {
                            "heading": "What It Does",
                            "bullets": [
                                "Drag in an STL, OBJ, or 3MF — no account, nothing to install",
                                "Draw the cut with a pen tool, or use the Planar and Dovetail presets",
                                "Preview before committing, tune the gap, and add plug connectors — pegs on one side, matching sockets on the other (circle or hexagon)",
                                "Exploded view to inspect the pieces; exports binary STL or 3MF",
                                "Free and open source (MIT) — Manifold WebAssembly and Three.js under the hood"
                            ],
                            "link": "https://github.com/MaxSikorski/curve-cut",
                            "linkLabel": "Curve Cut on GitHub"
                        },
                        {
                            "heading": "BIG Print Mode — Bigger Than Your Bed",
                            "bullets": [
                                "Pick your printer — or type a custom bed size — and scale by multiplier or to a target size",
                                "It grid-cuts the model to fit and exports a zip of parts, every piece engraved with its ID (A1, B2-L3…)",
                                "Connectors auto-placed on every seam, plus a manifest and a printable assembly map",
                                "The pitch: statue-sized prints from a 220 mm bed, without touching Blender"
                            ],
                            "link": "https://maxsikorski.github.io/curve-cut/",
                            "linkLabel": "Try Curve Cut"
                        },
                        {
                            "heading": "Live Demo",
                            "body": "Full walk-through, right now: load a model, draw a curve, cut it, then blow it up to BIG-print scale and watch it grid itself into labeled, connector-fitted parts. Feature requests welcome — it's our tool, so the roadmap is this room's to shape.",
                            "link": "https://maxsikorski.github.io/curve-cut/",
                            "linkLabel": "Follow Along"
                        }
                    ]
                },
                {
                    "id": "quick-tip",
                    "title": "Quick Tip of the Week",
                    "description": "Fillets first, then chamfers",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Quick Tip: Fillets First, Then Chamfers",
                            "body": "When you're finishing edges in CAD, order matters: fillet first, then chamfer. On side and top edges that sequence gives you smoother transitions between faces. The one exception is the build-plate edge — save it for the very end, chamfer the edge that touches the plate, then fillet the top edge of that chamfer. You keep a printable angle at the plate (no steep overhang) and still land a soft, finished edge."
                        }
                    ]
                },
                {
                    "id": "community-news",
                    "title": "Community News & Topics",
                    "description": "Share what you're interested in talking about!",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Next Week's Meetup",
                            "body": "Find something you're interested in talking about? Share it here and we'll cover it in next week's meetup!",
                            "link": "https://github.com/MaxSikorski/3d-printing-weekly-news/issues",
                            "linkLabel": "Submit a Topic"
                        }
                    ]
                }
            ]
        },
        "2026-W28": {
            "week": "2026-W28",
            "date": "2026-07-09",
            "title": "California's AB 2047, INDX Finally Ships & a Clay Printer That Prints the Impossible",
            "subtitle": "This week in 3D printing news",
            "timerMinutes": 20,
            "topics": [
                {
                    "id": "ab-2047-final-hearing",
                    "title": "AB 2047 — California's 3D Printer Bill Keeps Moving",
                    "description": "The 'firearm blocking technology' mandate clears another committee",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "The Final Hearing in California",
                            "body": "Joel Telling (3D Printing Nerd) walks through the June 30 Senate Public Safety hearing on AB 2047 — California's bill that would require every consumer 3D printer sold in the state to run state-approved 'firearm blocking' software that scans your STL, CAD, and G-code files before printing.",
                            "videoUrl": "https://youtu.be/b6fpPStIAsY"
                        },
                        {
                            "heading": "Where the Bill Actually Stands",
                            "bullets": [
                                "June 30 result: passed Senate Public Safety 5–1, as amended — now headed to Appropriations after summer recess",
                                "The community IS moving the text: May amendments softened the open-source-slicer treatment after loud pushback",
                                "But make no mistake — the bill is still advancing, not dying",
                                "Timeline if enacted: DOJ standards by Jan 1, 2028; sale ban on non-compliant printers from March 1, 2029",
                                "On record against it: Josef Průša, VORON Design, Make's Dale Dougherty, Joel Telling, and the EFF"
                            ],
                            "link": "https://calmatters.digitaldemocracy.org/bills/ca_202520260ab2047",
                            "linkLabel": "AB 2047 Bill Tracker"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Scanning every print job against a state-approved algorithm — where does that leave open source and privacy?",
                                "The amendments show pressure works — what does effective pushback look like from here?",
                                "If this passes in California, how fast do other states copy it?"
                            ],
                            "link": "https://www.the3dprintingnerd.com/ab2047",
                            "linkLabel": "Joel's AB 2047 Resource Page"
                        }
                    ]
                },
                {
                    "id": "bambu-owners-corner",
                    "title": "Bambu Owners' Corner — A Sleeper Upgrade & Free Parametric Models",
                    "description": "The AMS riser BV3D didn't know he needed, plus ParamaCraft Lite",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "The Upgrade You Didn't Know You Needed",
                            "body": "Bryan Vines (BV3D) tried Sanja 3D's AMS Flipper Glass Slider Riser V6 — a printable riser combo for the P1S and X1C that lifts the AMS off the printer top, slides the glass lid, and fixes three small annoyances at once. His verdict is in the title: didn't know he needed it, until he tried it.",
                            "videoUrl": "https://youtu.be/c49oyM8Hq6U"
                        },
                        {
                            "heading": "ParamaCraft Lite — Free Parametric Editing in MakerWorld",
                            "body": "New in Bambu's MakerLab this week (July 6): ParamaCraft Lite, a free browser-based parametric editor. Take an existing template model and dial exact dimensions, shapes, and surface patterns with sliders — no CAD, no install. The full version stays paid, but the free tier covers the everyday 'I just need it 3 mm wider' cases.",
                            "link": "https://3druck.com/en/programs/paramacraft-lite-parametric-model-editor-now-available-for-free-via-bambu-labs-makerworld-21159558/",
                            "linkLabel": "ParamaCraft Lite Coverage"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "What's the best cheap-or-free upgrade you've added to your printer this year?",
                                "Parametric-lite tools in the browser — gateway drug to real CAD, or all most people will ever need?",
                                "Bambu keeps pulling tools into its walled garden — convenience win or lock-in worry?"
                            ]
                        }
                    ]
                },
                {
                    "id": "indx-july-update",
                    "title": "INDX Ships — Plus a Hot Take and a Wild Custom Build",
                    "description": "Founders Editions are going out; the community is already remixing it",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "State of INDX: It's Actually Shipping",
                            "body": "Last week we reported the printhead-rework delay with no committed date. This week Prusa's official July 3 update answers it: Founders Edition units are shipping now, the first CORE One conversion kits go out by end of July, and the whole first batch should ship by end of August. Firmware 6.6.1 is out, with more PLA profiles, nozzle sizes, and a bigger waste bin in the pipeline.",
                            "link": "https://blog.prusa3d.com/indx_july_2026_update_137377/",
                            "linkLabel": "State of INDX — July 2026",
                            "product": "bondtech-indx"
                        },
                        {
                            "heading": "The Skeptic's Take: 'Brilliant, But Not Finished'",
                            "body": "mpoxDE's hands-on review (German, subtitles do fine) lands on: genuinely brilliant toolchanger, but it ships feeling like a beta — limited profiles, rough edges, early-adopter energy. Our take at the meetup: this launch rhymes with the Prusa XL's in 2021 — a big multi-tool promise that took a year of updates to grow into itself.",
                            "videoUrl": "https://youtu.be/Khf-A6ofChE"
                        },
                        {
                            "heading": "And the Community Is Already Going Off-Script",
                            "body": "David Wood (dwuk3d) has INDX toolheads running 2-second tool changes on a heavily customized Sovol SV08 — dual X-axis, with the motion system, toolheads, and board all converted to Duet 3D hardware. The INDX ecosystem escaping the CORE One this early is the most interesting signal of the week.",
                            "videoUrl": "https://youtu.be/csogGqbEnKo"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Shipping resumed a week after the delay news — does that change anyone's read on Bondtech?",
                                "Beta-feel launches: fair price for early access, or should v1 mean finished?",
                                "INDX heads on a Duet-converted SV08 — who else wants toolchanging without buying a CORE One?"
                            ]
                        }
                    ]
                },
                {
                    "id": "pps-brake-rotors",
                    "title": "3D-Printed Brake Rotors in PPS-CF — It Did Not Go Well",
                    "description": "A ~$1,000 lesson in material limits",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "Printing Brake Rotors. Then Testing Them.",
                            "body": "The Fabrication Series printed actual brake rotors in PPS-CF — one of the toughest high-temp filaments you can buy — and put them on a real car. Spoiler: it did not go well. Braking turns kinetic energy into heat by design, and even a filament that laughs at 200°C+ meets its match against glowing cast iron temperatures.",
                            "videoUrl": "https://youtu.be/U_BuiDNe-K8"
                        },
                        {
                            "heading": "The Price of the Experiment",
                            "bullets": [
                                "Back-of-napkin math: the rotors alone ate two 3 kg spools of Polymaker Fiberon PPS at roughly $399 each — ~$800 in filament, likely ~$1,000 all-in",
                                "PPS-CF is a genuinely elite engineering filament — chemical resistance, high heat deflection — just not brake-rotor heat",
                                "The right lesson: know what your material is FOR, not just how strong the spec sheet looks",
                                "Obvious but worth saying: never put printed parts in your braking system"
                            ]
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "What's the most expensive failed print experiment you've run — and was it worth it?",
                                "Where do PPS and other exotic filaments actually earn their price for you?",
                                "Content like this: valuable myth-busting, or expensive stunts?"
                            ]
                        }
                    ]
                },
                {
                    "id": "clay-3d-printer",
                    "title": "Joshua Bird's Clay Printer — Impossible Objects, Open Sourced",
                    "description": "The Core R-Theta creator turns to ceramics",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "A Clay Printer That Prints Impossible Objects",
                            "body": "Joshua Bird — the builder behind the Core R-Theta 4-axis polar printer (884 stars on GitHub) — strapped a clay extruder onto his rotating-bed machine. Because the bed spins and the head prints radially, it lays down ceramic geometries a normal Cartesian clay printer physically can't: severe overhangs and curves with no supports.",
                            "videoUrl": "https://youtu.be/ajfrOBs_mNk"
                        },
                        {
                            "heading": "Build It Yourself — Both Halves Are Open",
                            "bullets": [
                                "The clay extruder is open source: CAD files (.f3d/.step) plus a BOM — NEMA 14 stepper, pneumatic compressor, clay cylinder",
                                "It's designed to mount on his Core R-Theta 4-axis printer, which is also fully open source",
                                "R-Theta = polar motion: radial arm + rotating bed instead of X/Y — that's where the 'impossible' geometry comes from",
                                "Ceramics + hobby 3D printing is still wide open territory — this is the most accessible multi-axis clay setup we've seen"
                            ],
                            "link": "https://github.com/jyjblrd/Ceramic-3D-Printer",
                            "linkLabel": "Ceramic Printer on GitHub"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Who here would fire and glaze printed ceramics if the printer were solved?",
                                "Polar/multi-axis machines keep coming from solo builders, not brands — why?",
                                "What's the next material that deserves the open-source-printer treatment?"
                            ],
                            "link": "https://github.com/jyjblrd/Core-R-Theta-4-Axis-Printer",
                            "linkLabel": "Core R-Theta 4-Axis Printer"
                        }
                    ]
                },
                {
                    "id": "curved-cut-tool",
                    "title": "The Tool Slicers Should Have — Curved Cuts Without Blender",
                    "description": "DaveRig's cutter — and our plan to put it in your browser",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Curved Cuts, Finally",
                            "body": "Every slicer can cut a model flat. The moment you want a curved cut — or several — you're off to Blender. DaveRig Design built the tool slicers should have shipped years ago: define curved cutting paths, even multiple compound curves, and split your model right there. Dropped this week and it's exactly the kind of small-sharp-tool this hobby runs on.",
                            "videoUrl": "https://youtu.be/7G6voqHYV5U"
                        },
                        {
                            "heading": "And Here's Our Plan for It",
                            "body": "We like this one enough to act on it: we're planning to rebuild the concept as a free web-based tool and publish it on our GitHub, so anyone can do curved cuts in the browser — no install, no Blender. Consider this your teaser; watch the community-news slot in the coming weeks.",
                            "link": "https://github.com/MaxSikorski",
                            "linkLabel": "Our GitHub"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "What's YOUR most-wanted missing slicer feature?",
                                "Curved cuts for prints too big for the bed — who has a project waiting on this?",
                                "Small independent tools vs. waiting for slicer teams to ship it — which serves the hobby better?"
                            ]
                        }
                    ]
                },
                {
                    "id": "quick-tip",
                    "title": "Quick Tip of the Week",
                    "description": "Thermoforming over prints — two processes, one part",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Quick Tip: Thermoform Onto Your Prints",
                            "body": "Mihai T's tablet case combines a printed body with a thermoformed insert — heat a thin plastic sheet until floppy, form it over or into the printed part, and you get thin, glossy, flexible geometry that would print terribly. A heat gun, a scrap of PETG or polycarbonate sheet, and your print becomes the mold. Great for cases, lenses covers, living-hinge-ish panels, and clean cosmetic skins.",
                            "videoUrl": "https://youtu.be/WNTNCcYMRRM"
                        }
                    ]
                },
                {
                    "id": "community-news",
                    "title": "Community News & Topics",
                    "description": "Share what you're interested in talking about!",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Next Week's Meetup",
                            "body": "Find something you're interested in talking about? Share it here and we'll cover it in next week's meetup!",
                            "link": "https://github.com/MaxSikorski/3d-printing-weekly-news/issues",
                            "linkLabel": "Submit a Topic"
                        }
                    ]
                }
            ]
        },
        "2026-W27": {
            "week": "2026-W27",
            "date": "2026-07-02",
            "title": "SUNLU's US Factory, Sovol M1D Pricing & a Walking Robot Duck",
            "subtitle": "This week in 3D printing news",
            "timerMinutes": 20,
            "topics": [
                {
                    "id": "sunlu-usa-factory",
                    "title": "SUNLU Is Bringing a Factory to the USA",
                    "description": "The filament giant teases a US manufacturing plant",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "SUNLU: 'Made in USA — Coming Soon'",
                            "body": "SUNLU announced this week (official post, timed with the brand's 13th anniversary) that it will establish a manufacturing plant in the United States — promising faster delivery, stronger support, and a tighter worldwide connection. One of the biggest budget-filament brands planting a flag on US soil.",
                            "imageUrl": "photos/sunlu-usa-factory-news.png"
                        },
                        {
                            "heading": "The Fine Print (There Isn't Much)",
                            "bullets": [
                                "It's a teaser: no location, no timeline, no capacity announced yet",
                                "The factory picture in the post is a concept render, not a real building",
                                "SUNLU's stated 'why': faster delivery and stronger support — tariffs go unmentioned, but loom over every brand's US move",
                                "No press coverage yet — the announcement is the social post itself"
                            ],
                            "link": "https://www.sunlu.com/",
                            "linkLabel": "SUNLU"
                        },
                        {
                            "heading": "Also from SUNLU: FilaDC i10 Drying Cabinet",
                            "body": "In the same week, SUNLU's filament-dehumidifying cabinet built with Inslogic — the FilaDC i10, first shown at RAPID+TCT — was slated for release July 1. It stores up to ten 1 kg spools dry at once: SUNLU moving past single-spool dryers into whole-shelf moisture management.",
                            "link": "https://www.prnewswire.com/news-releases/sunlu-and-inslogic-team-up-to-announce-the-filadc-i10-at-rapid-tct-in-boston-302745575.html",
                            "linkLabel": "FilaDC i10 Announcement"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Would you pay a premium for US-made filament — and how much of one?",
                                "If tariffs stick around, does a US plant actually mean lower prices on the shelf?",
                                "Which brand announces a US factory next?"
                            ]
                        }
                    ]
                },
                {
                    "id": "sovol-m1d-pricing",
                    "title": "Sovol M1D — Pricing Is Out",
                    "description": "The IDEX + 7-head toolchanger gets a price tag",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "Sovol M1D — Now With a Price Tag",
                            "body": "We covered the M1D announcement a few weeks back — now the pricing is out. It's Sovol's IDEX-plus-toolchanger machine: two independent extruders AND a rack of swappable heads (up to 7 total), so multi-color and multi-material printing without a purge tower. 300 × 300 × 350 mm build, up to 600 mm/s, and ~5-second head swaps with a patented metal gripper.",
                            "videoUrl": "https://youtu.be/KxvXpApL6tA"
                        },
                        {
                            "heading": "Pricing & The Catch",
                            "bullets": [
                                "Kickstarter super early bird: $1,499 — expected list price $1,799",
                                "A $20 VIP reservation locks in the lowest tier (final number on Sovol's page)",
                                "Sovol's claim: the world's first IDEX tool-changing 3D printer",
                                "It's a Kickstarter: not shipping yet — back at your own risk (same caveat as last week's TOP.E R1)"
                            ],
                            "link": "https://www.sovol3d.com/products/sovol-m1d-vip-reservation",
                            "linkLabel": "M1D VIP Reservation",
                            "product": "sovol-m1d"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "IDEX + toolchanger vs. AMS-style single-nozzle systems — is purge waste finally solved?",
                                "$1,499 for 7-head multi-material — bargain or big promise?",
                                "Would you back it on Kickstarter, or wait for review units?"
                            ]
                        }
                    ]
                },
                {
                    "id": "bondtech-indx-shipping",
                    "title": "Bondtech INDX — First Units in the Wild (and a Delay)",
                    "description": "Founders Editions are appearing on camera — while others wait",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "INDX Founders Editions: It's Complicated",
                            "body": "Two weeks ago we said Founders Editions were set to ship June 25. Reality is messier: the first FE 8-tool units are showing up on camera — DarkTeck3D has one in hand — but forum reports say many Founders orders are still waiting after Bondtech caught a printhead issue that forced rework and re-testing, without committing to a firm new date.",
                            "videoUrl": "https://youtu.be/AKtfOcpj83A"
                        },
                        {
                            "heading": "Recap & Where Things Stand",
                            "bullets": [
                                "Recap: INDX is the purgeless 8-tool indexing toolchanger for the Prusa CORE One",
                                "Founders run: the first 1,000 units — pre-orders currently showing sold out",
                                "Pricing: 8-tool ~$999 / €899 · 4-tool ~$749 / €669",
                                "Status: early units in the wild; broader Founders shipping held up by the printhead rework"
                            ],
                            "link": "https://www.bondtech.se/indx-by-bondtech/",
                            "linkLabel": "INDX by Bondtech",
                            "product": "bondtech-indx"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "A delay for rework — red flag, or exactly what you want a small company to do?",
                                "Anyone here holding a Founders order? What's Bondtech telling you?",
                                "Toolchangers vs. AMS-style multi-material — where does this land in five years?"
                            ]
                        }
                    ]
                },
                {
                    "id": "slicer-tricks",
                    "title": "Slicer Tricks You're Not Using Yet",
                    "description": "Vase-mode strength hacks, corrugated walls & quasi non-planar",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "The 'Everything Is a Wall' Hack",
                            "body": "Spectrum Filaments' short shows a clever strength trick: fool the slicer into treating the whole model as wall, so the part prints as continuous extrusions — vase-mode-style toughness without vase mode's single-wall limit. We'll walk through how it works.",
                            "videoUrl": "https://youtu.be/IwDNXsbhsKs"
                        },
                        {
                            "heading": "OrcaSlicer 2.4.1: Corrugated 'Ripple' Walls",
                            "body": "New in OrcaSlicer 2.4.1: a corrugated-wall generator hiding in the fuzzy-skin tab. Instead of just roughing up the surface, it ripples the wall like corrugated cardboard — a big stiffness-per-gram gain, demoed by the Magnetic IDEX channel on real parts that flex less and take more abuse.",
                            "videoUrl": "https://youtu.be/qNiUTy18Jpo"
                        },
                        {
                            "heading": "Quasi Non-Planar: Smoother Shallow Angles",
                            "body": "Quasi non-planar printing lets the nozzle vary Z within a layer to smooth out the stair-stepping on shallow slopes — no more staircase on gentle curves. Demoed in Spectrum's short (tagged for Bambu Studio; the feature is landing across the Bambu/Orca slicer family).",
                            "videoUrl": "https://youtu.be/wOHd-li9zoQ"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Which of these tricks gets tried first on your printer?",
                                "Corrugated walls: where does stiffness-per-gram matter most in your prints?",
                                "Non-planar features going mainstream — how long before it's a default checkbox in every slicer?"
                            ],
                            "link": "https://github.com/SoftFever/OrcaSlicer/releases",
                            "linkLabel": "OrcaSlicer Releases"
                        }
                    ]
                },
                {
                    "id": "open-duck-mini-v2",
                    "title": "Open Duck Mini V2 — A 3D-Printed Robot Duck Kit",
                    "description": "Open-source walking robot: $570 kit or print-and-source it yourself",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "Open Duck Mini V2",
                            "body": "Open Duck Mini is Antoine Pirrone's open-source, 3D-printable bipedal robot duck (heavy BDX-droid vibes) with a walking gait trained by reinforcement learning. Back to Engineering's build video is an honest look at what the build actually takes — '4 days of soldering, assembling, and electrical exorcisms.'",
                            "videoUrl": "https://youtu.be/tt-g_fi-eGU"
                        },
                        {
                            "heading": "Kit vs. Self-Source",
                            "bullets": [
                                "V2 kit: about $570 with shipping via tnkr.ai, quoted 2–3 week lead time",
                                "Fully open source — print the parts and self-source the electronics from the BOM for less",
                                "The gait is trained with RL in simulation, then deployed to the real robot",
                                "Not a beginner kit: plenty of soldering and small-parts assembly"
                            ],
                            "link": "https://tnkr.ai/open-duck-mini/open-duck-mini-v2",
                            "linkLabel": "Open Duck Mini V2 Kit"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Kit at $570 vs. self-sourcing the BOM — which would you do?",
                                "RL-trained gaits reaching hobby desks — what would you train a robot to do next?",
                                "Robots keep stealing the show here (giant Arduino robot, Marina's hand) — should robotics become a regular segment?"
                            ],
                            "link": "https://github.com/apirrone/Open_Duck_Mini",
                            "linkLabel": "Open Duck Mini on GitHub"
                        }
                    ]
                },
                {
                    "id": "quick-tip",
                    "title": "Quick Tip of the Week",
                    "description": "Summer humidity is print poison — dry your filament",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Quick Tip: Beat Summer Humidity",
                            "body": "Wet filament means stringing, popping and hissing at the nozzle, fuzzy surfaces, and brittle parts — and mid-summer air wets PLA and PETG in days, nylon and TPU in hours. The fix is cheap: dry before you print (typical: PLA ~45–55°C for 4–6 h, PETG ~55–65°C for 4–6 h, nylon ~70–80°C for 8–12 h — check your brand's numbers), store spools sealed with desiccant, and keep a cheap hygrometer in the dry box so you know when it's time to re-dry.",
                            "link": "https://help.prusa3d.com/article/how-to-dry-filaments_332086",
                            "linkLabel": "Prusa: How to Dry Filaments",
                            "products": [
                                "sovol-sh03",
                                "filament-hygrometer"
                            ]
                        }
                    ]
                },
                {
                    "id": "community-news",
                    "title": "Community News & Topics",
                    "description": "Share what you're interested in talking about!",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Next Week's Meetup",
                            "body": "Find something you're interested in talking about? Share it here and we'll cover it in next week's meetup!",
                            "link": "https://github.com/MaxSikorski/3d-printing-weekly-news/issues",
                            "linkLabel": "Submit a Topic"
                        }
                    ]
                }
            ]
        },
        "2026-W26": {
            "week": "2026-W26",
            "date": "2026-06-25",
            "title": "Prime Day Deals, Desktop 5-Axis & a 3D-Printed Hypercar",
            "subtitle": "This week in 3D printing news",
            "timerMinutes": 20,
            "topics": [
                {
                    "id": "prime-day-deals",
                    "title": "Amazon Prime Day — 3D Printer Deals (June 23–26)",
                    "description": "Prime Day is on during meetup week — here's what's worth grabbing",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Prime Day 2026 — Deals Are Live (June 23–26)",
                            "body": "Amazon Prime Day runs June 23–26, and the 3D-printing brands are all in — Bambu Lab (also marking its 4th anniversary), Anycubic, Elegoo, Creality, Prusa, and Sovol are discounting printers, filament, and bundles. Prices move fast, so check the live links — but here are some standouts.",
                            "link": "https://www.tomshardware.com/3d-printing/prime-day-brings-huge-savings-on-affordable-3d-printers-top-value-picks-from-anycubic-bambu-lab-elegoo-and-creality-hit-rock-bottom-pricing-cant-miss-deals-on-filament-bundles",
                            "linkLabel": "Prime Day Deals Roundup"
                        },
                        {
                            "heading": "Standout Deals (Verify Current Prices)",
                            "bullets": [
                                "Anycubic Kobra X — around $299.99 for Prime members",
                                "Creality K2 — around $369 (down from $549)",
                                "Sovol SV06 Ace — around $239",
                                "Up to ~30% off Elegoo and ~26% off Anycubic; filament bundles discounted across brands",
                                "Bambu Lab 4th-anniversary deals + a Creality Father's Day sale are running too"
                            ],
                            "shop": "Printers"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Best entry-level printer to recommend to a newcomer right now?",
                                "Stock up on filament, or hold out for a printer upgrade?",
                                "Any deals you've spotted that we should share with the group?"
                            ]
                        }
                    ]
                },
                {
                    "id": "bambu-pla-pure",
                    "title": "Bambu Lab PLA Pure — A 'Cleaner' Filament",
                    "description": "A PLA that lists every ingredient and is certified food- and toy-safe",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Bambu PLA Pure",
                            "body": "Bambu Lab launched PLA Pure, a filament built around safety and transparency: it publicly lists all five ingredients and is certified for food contact (EU 10/2011), kids' toys (EN 71-3 heavy-metal limits), and low indoor emissions (UL 2904 Greenguard). The talc is verified asbestos-free. Around $24.99 a spool ($21.99 refill), in soft pastels plus black and white.",
                            "link": "https://www.tomshardware.com/3d-printing/bambu-lab-launches-pla-pure-filament-new-material-boasts-kid-safe-toy-certifications-and-asbestos-free-talc",
                            "linkLabel": "PLA Pure Details"
                        },
                        {
                            "heading": "Why It Matters",
                            "bullets": [
                                "Most filament makers don't disclose ingredients — Bambu listing all five is unusual",
                                "Certs target real use cases: food-contact items, kids' toys, and indoor air quality (VOCs/particles)",
                                "Quietly raises the question: how safe is the 'regular' PLA we print around the house?",
                                "Trade-off: a premium price vs. standard PLA — worth it for the right prints?"
                            ],
                            "product": "bambu-pla-pure"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Do you think about fumes/particles when printing indoors? Enclosure + ventilation habits?",
                                "Would you pay extra for certified-safe filament for toys, the kitchen, or kids' projects?",
                                "Should ingredient disclosure become the industry norm?"
                            ]
                        }
                    ]
                },
                {
                    "id": "prusa-highspeed-pla",
                    "title": "Prusament PLA High-Speed",
                    "description": "Prusa's first high-speed PLA — up to 40% faster prints",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Prusament PLA High-Speed",
                            "body": "Prusa's first high-speed PLA, claiming up to 40% faster prints 'in the right conditions.' It's formulated to flow cleanly at the higher volumetric speeds modern CoreXY machines push, and is designed to pair with Prusa's high-flow CHT Nextruder nozzles. Launching in a five-color series.",
                            "link": "https://all3dp.com/4/prusa-launches-its-first-high-speed-pla-promising-up-to-40-faster-prints/",
                            "linkLabel": "Prusament PLA High-Speed",
                            "product": "prusament-pla-highspeed"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "High-speed PLAs (Bambu, Polymaker, now Prusa) — real gains, or mostly marketing?",
                                "The real bottleneck is usually hot-end flow — does a high-flow (CHT) nozzle matter more than the filament?",
                                "Speed vs. safety: pair this with Bambu's PLA Pure above — two very different bets on what PLA should be"
                            ]
                        }
                    ]
                },
                {
                    "id": "top-e-r1-5axis",
                    "title": "TOP.E R1 — Desktop 5-Axis Printing",
                    "description": "A 5-axis FFF printer for the desktop that tilts the bed to kill supports",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "TOP.E R1 — 5-Axis on the Desktop",
                            "body": "Most desktop printers are 3-axis. The TOP.E R1 adds two more by tilting the build plate on a 3-point system (each point lifts independently, up to ~30°). That lets it lay plastic along curves and hit support-free overhangs up to ~75° — less support waste, stronger parts, and non-planar prints like the helical pillar in the demo.",
                            "videoUrl": "https://www.youtube.com/watch?v=n3eZYf1dJcQ"
                        },
                        {
                            "heading": "Specs & The Catch",
                            "bullets": [
                                "350 × 340 × 320 mm build, hotend to 350°C, bed to 100°C, actively heated chamber to 60°C",
                                "Tilting 3-point bed adds 2 axes; support-free overhangs up to ~75°",
                                "Integrated 4-spool multi-material + dual monitoring cameras",
                                "~$1,699 — about an H2S; launching via Kickstarter (crowdfunding — not shipping yet, back at your own risk)"
                            ]
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Is 5-axis genuinely useful for our prints, or a novelty for showpieces?",
                                "Non-planar / support-free printing — what would you actually make with it?",
                                "Would you back a $1,699 5-axis printer on Kickstarter, or wait for reviews?"
                            ]
                        }
                    ]
                },
                {
                    "id": "ldo-unicorn",
                    "title": "LDO 'Unicorn' Chasing Kit — Resonance, Tuned",
                    "description": "An accelerometer in the nozzle for dialed-in input shaping (Voron / Klipper)",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "LDO Unicorn Chasing Kit",
                            "body": "A resonance-compensation toolkit for Klipper machines, in two parts. The 'Rethonance' nozzle is V6-compatible with an ADXL345 accelerometer built right into the nozzle — so you measure vibration at the tip, where ringing actually happens, instead of on the toolhead body. The 'Rethonance' hub is a magnet-mounted board that brings ADXL sensors, motor/chamber thermistors, and a GPIO port together over a single USB cable.",
                            "link": "https://docs.ldomotors.com/en/voron/unicorn",
                            "linkLabel": "LDO Unicorn Docs",
                            "product": "ldo-unicorn"
                        },
                        {
                            "heading": "What's Clever",
                            "bullets": [
                                "Accelerometer in the nozzle = input-shaper data measured exactly where it matters",
                                "Rethonance hub: 2 ADXL ports + 4 thermistor ports + GPIO, all over one USB to the Pi",
                                "V6-compatible nozzle; works with Klipper / Katapult; magnet-mounts to the flex plate",
                                "Aimed at the Voron / Klipper crowd chasing sharper corners and less ghosting"
                            ]
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Does measuring resonance at the nozzle meaningfully beat a toolhead-mounted ADXL?",
                                "Input shaping: who here runs it, and did it actually fix your ringing?",
                                "Niche tuning gear like this — worth it, or diminishing returns?"
                            ]
                        }
                    ]
                },
                {
                    "id": "divergent-czinger",
                    "title": "Divergent's Metal Mega-Factory — & the Czinger Hypercar",
                    "description": "A 64-machine metal-printing super-factory, from the people who 3D-print a hypercar",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Divergent's 64-Machine Metal Super-Factory",
                            "body": "Divergent Technologies is betting big on defense and automotive with a 64-machine metal 3D-printing super-factory in Torrance, CA. It runs on their new in-house 'Monolith One' — a laser powder-bed-fusion (LPBF) printer with a massive 24 kW of laser power. The machine isn't for sale; it's proprietary production capacity feeding their DAPS pipeline (design → print → auto-assemble complex metal structures).",
                            "link": "https://all3dp.com/4/divergent-bets-big-on-defense-with-massive-new-printer-64-machine-3d-printing-super-factory/",
                            "linkLabel": "Divergent Super-Factory"
                        },
                        {
                            "heading": "...And They 3D-Print a Hypercar; Czinger 21C",
                            "body": "The fun connection: Divergent and Czinger Vehicles share a founder — Kevin Czinger. The Czinger 21C is a 3D-printed hybrid hypercar built on that same additive tech: a tandem two-seater making 1,250 hp (1,350 in the limited 'Blackbird'), a top speed around 281 mph, just 80 units, from ~$1.7M. The 3D-printed metal structures aren't a gimmick — they're how it gets so light and strong.",
                            "link": "https://www.czinger.com/model-21c",
                            "linkLabel": "Czinger 21C"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Metal AM going from prototyping to a 64-machine production farm — the 'factory of the future,' or hype?",
                                "A genuinely 3D-printed hypercar at 281 mph — does this make additive cool to the mainstream?",
                                "Printed structures vs. traditional stamping/casting for cars — who wins long-term?"
                            ]
                        }
                    ]
                },
                {
                    "id": "mgm-cults",
                    "title": "MGM Makes Cults Block 'Stargate' Searches",
                    "description": "Trademark enforcement quietly breaking search on a model repo",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Cults Blocks 'Stargate' at MGM's Request",
                            "body": "Cults, one of the big 3D-model marketplaces, has disabled search results for the term 'stargate' after pressure from MGM Studios, which owns the Stargate trademark. The odd part: it's a selective block — other Stargate-related terms still surface models — so it does little to stop actual infringement and mostly just breaks search for everyone. Cults hasn't commented.",
                            "link": "https://all3dp.com/6/cults-prevents-searches-for-term-startgate-at-behest-of-mgm-studios-inc/",
                            "linkLabel": "All3DP: Cults & MGM"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Blunt, automated IP enforcement on model repos — where's the line between protecting IP and censoring makers?",
                                "We're eyeing Printables / MakerWorld / Thingiverse / Cults / Thangs for a future 'Model Spotlight' — does this change which repos we trust?",
                                "Fan-made models of franchises: fair game, gray area, or asking for takedowns?"
                            ]
                        }
                    ]
                },
                {
                    "id": "printed-to-fit-you",
                    "title": "Printed to Fit You — Prosthetics & Custom Insoles",
                    "description": "3D printing made personal: assistive devices and scan-to-print insoles",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "3D-Printed Prosthetics Step Up",
                            "body": "Two prosthetics milestones this week. Open Bionics released the HERO Flex, its first 3D-printed above-elbow system — lightweight and modular with swappable attachments — recently fitted to a New York physicist after decades without a prosthetic. And researchers at the University of Alicante / ISABIAL unveiled a patent-pending modular arm prosthesis using simple, easy-swap mechanical modules and flexible biocompatible sockets, aimed at affordability and user autonomy.",
                            "link": "https://3dprint.com/327335/3d-printing-news-briefs-6-20-2026/",
                            "linkLabel": "News Brief (June 20)"
                        },
                        {
                            "heading": "Scan-to-Print Insoles (Superfeet ME3D)",
                            "body": "On the consumer side, Superfeet's ME3D platform now lets you scan your feet with an iPhone (13 or newer) and customize 3D-printed insoles at home using their biomechanical algorithms, then have them manufactured and shipped. A clean example of mass-customization: your body, scanned by a phone, turned into a printed product."
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Phone-scan → custom printed product: where else does this go (braces, grips, ergonomic tools)?",
                                "Could our group print assistive devices locally for people who need them?",
                                "Affordable open prosthetics vs. medical-grade certified devices — where's the line?"
                            ]
                        }
                    ]
                },
                {
                    "id": "research-space-quickhits",
                    "title": "Research & Space — Quick Hits",
                    "description": "A fast pass on the cool research and off-world printing news",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Research & Space — Quick Hits",
                            "bullets": [
                                "Self-aware parts: researchers 3D-printed magnetoelectronics that let a part sense its own motion and state ('4D mechatronics')",
                                "Printing in orbit: Auburn University + NASA Marshall demoed a process for astronauts to make electronic components in space",
                                "Building off-world: a new review maps how 3D-printed regolith concrete could enable lunar / Martian structures",
                                "Also: ORNL printed foldable panels via a hybrid method, and Chalmers made a biodegradable printable material from baker's yeast + cellulose"
                            ],
                            "link": "https://3dprint.com/327529/3d-printing-news-briefs-6-24-2026/",
                            "linkLabel": "News Brief (June 24)"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Self-sensing printed parts — gimmick, or the start of smart mechanisms?",
                                "In-space manufacturing: how soon is it actually practical?",
                                "Which of these surprised you most?"
                            ]
                        }
                    ]
                },
                {
                    "id": "quick-tip",
                    "title": "Quick Tip of the Week",
                    "description": "Kill ringing/ghosting with input shaping",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Quick Tip: Input Shaping",
                            "body": "Those faint echoes or ripples next to sharp corners and embossed text are 'ringing' (ghosting/VFA's) from machine vibration. If you run Klipper, input shaping cancels it: attach an accelerometer (a cheap ADXL345 — or a kit like the LDO Unicorn above), run TEST_RESONANCES, and Klipper picks the best shaper and frequency per axis. No accelerometer? You can still improve it by eye with a ringing/tower test and by keeping your belts tensioned and frame tight. Five minutes of calibration for noticeably crisper corners.",
                            "link": "https://www.klipper3d.org/Resonance_Compensation.html",
                            "linkLabel": "Klipper: Resonance Compensation",
                            "product": "adxl345"
                        }
                    ]
                },
                {
                    "id": "community-news",
                    "title": "Community News & Topics",
                    "description": "Share what you're interested in talking about!",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Next Week's Meetup",
                            "body": "Find something you're interested in talking about? Share it here and we'll cover it in next week's meetup!",
                            "link": "https://github.com/MaxSikorski/3d-printing-weekly-news/issues",
                            "linkLabel": "Submit a Topic"
                        }
                    ]
                }
            ]
        },
        "2026-W25": {
            "week": "2026-W25",
            "date": "2026-06-18",
            "title": "MRRF's Last Ride, Open-Source Volumetric Printing & a 16-Color U1",
            "subtitle": "This week in 3D printing news",
            "timerMinutes": 20,
            "topics": [
                {
                    "id": "mrrf-2026-recap",
                    "title": "MRRF 2026 — Recap (The Last One As We Know It)",
                    "description": "We road-tripped to the Midwest RepRap Festival — and it was the final year under the current organizers",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "MRRF 2026 — We Were There (June 12–14)",
                            "body": "Several of us road-tripped to the Midwest RepRap Festival at the Elkhart County 4-H Fairgrounds in Goshen, Indiana — the world's largest grassroots, bring-your-own-printer gathering. Community-run, free to attend, and three days of wild builds, vendor booths, talks, and the legendary tip-jar raffle. I've got a pile of photos to walk through.",
                            "link": "https://www.facebook.com/midwestreprapfest/",
                            "linkLabel": "MRRF on Facebook"
                        },
                        {
                            "heading": "The Last MRRF As We Know It",
                            "body": "The big news from the show: the current organizers announced this was their final year running MRRF. The festival is being handed off to The MakerHive, a makerspace in Elkhart, Indiana, who plan to keep the community going and put their own twist on it. So MRRF lives on — just under new stewardship. (Screenshots from their Facebook announcement below.)",
                            "imageUrls": [
                                "photos/MRRF-1.png",
                                "photos/MRRF-2.png"
                            ]
                        },
                        {
                            "heading": "Photos from the Floor",
                            "body": "See my photos"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "End of an era — what made MRRF special, and what do we hope The MakerHive keeps (or changes)?",
                                "What was the standout machine or print of the show?",
                                "Anything you saw that changes what you'll build or buy next?",
                                "Who's in for MRRF 2027 under the new organizers?"
                            ]
                        }
                    ]
                },
                {
                    "id": "japan-reprap-festival",
                    "title": "Japan RepRap Festival 2026 (JRRF)",
                    "description": "Meanwhile, the global grassroots scene is thriving — Japan's biggest 3DP festival",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "JRRF 2026 — Tokyo, May 30–31",
                            "body": "While MRRF wraps up an era stateside, Japan's largest 3D-printing festival is going strong. JRRF 2026 ran at the Tokyo Distribution Center (TRC Hall E) — 144 general booths and 55+ sponsoring companies. Same open-source RepRap spirit as MRRF: see, touch, and experience real machines, from scratch-built and modded printers to the latest commercial gear. Very cool stuff.",
                            "videoUrl": "https://youtu.be/m4X7i2JZv00"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "MRRF in the Midwest, JRRF in Tokyo — the grassroots scene is global and healthy",
                                "Japan's maker culture leans heavily on custom builds and creative prints — what can we learn from it?",
                                "Worth following international creators and feeds for gear and ideas we don't see stateside"
                            ],
                            "link": "https://japanreprapfestival.com/",
                            "linkLabel": "Japan RepRap Festival"
                        }
                    ]
                },
                {
                    "id": "opencal-volumetric",
                    "title": "OpenCAL — Volumetric Printing Goes Open-Source",
                    "description": "Computed Axial Lithography — layerless prints in seconds — is now free and open",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "Prints in Seconds — Now Open-Source",
                            "body": "Computed Axial Lithography (CAL) is a volumetric, layer-less resin technique: instead of building up layer by layer, it projects computed light patterns into a slowly rotating vat of photopolymer, solidifying the whole object at once — in seconds. As of June 2026 it's open-source as OpenCAL, with full documentation and code on GitHub.",
                            "videoUrl": "https://youtu.be/TWZ4I2GLYgI"
                        },
                        {
                            "heading": "How OpenCAL Works & Why It Matters",
                            "bullets": [
                                "Layer-less: no layer lines, and it can even print around or onto existing objects (overmolding)",
                                "Built from commercially available optics plus 3D-printed parts — runs headless on a Raspberry Pi 5",
                                "Ships with CentrifuCAL, a centrifuge-based post-processor to spin printed parts free of excess resin",
                                "GPL-3 license: free for research, education, and non-profit use — not for commercial use"
                            ],
                            "link": "https://github.com/computed-axial-lithography/OpenCAL",
                            "linkLabel": "OpenCAL on GitHub"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Is volumetric printing the next big leap, or a research curiosity for now?",
                                "Resin handling, build size, and material limits — what's the real catch?",
                                "An open CAL printer you can build yourself: who here would actually attempt it?"
                            ],
                            "link": "https://opencal-org.readthedocs.io/en/stable/",
                            "linkLabel": "OpenCAL Docs"
                        }
                    ]
                },
                {
                    "id": "snapmaker-u1-16color",
                    "title": "16 Colors on One Snapmaker U1 — Four AMSs",
                    "description": "Someone hooked four AMS units to a U1 toolchanger for a real 16-color machine",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "A Real 16-Color U1 Changer",
                            "body": "Somebody wired four AMS units up to a Snapmaker U1 toolchanger to get a genuine 16-color machine — and it works. The U1 is Snapmaker's affordable toolchanger (its SnapSwap system swaps four preloaded, pre-heated toolheads in ~5 seconds; 270 × 270 × 270 mm; ~$999 MSRP), and feeding each toolhead from its own AMS pushes it to 16 colors/materials. Very, very cool.",
                            "videoUrl": "https://youtu.be/7EH3QAjspt0"
                        },
                        {
                            "heading": "The Catch",
                            "bullets": [
                                "Four AMS boxes × four toolheads = 16 colors fed into a single U1",
                                "The maker hasn't released any code or files yet",
                                "Looks like he may be planning to sell it rather than open-source it — kind of a bummer for the DIY crowd",
                                "Still a great proof of how far the community can push an affordable toolchanger"
                            ]
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Toolchanger + multiple AMSs as the multicolor endgame — overkill, or the future?",
                                "Open-source vs. selling it: where's the line, and what would you pay for a kit like this?",
                                "Anyone here running a U1? What would you print with 16 materials at once?"
                            ]
                        }
                    ]
                },
                {
                    "id": "bondtech-indx",
                    "title": "Bondtech INDX — 8-Tool Changer for the CORE One",
                    "description": "Near-zero-waste multi-material toolchanger for the Prusa CORE One — Founders Editions shipping",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Bondtech INDX — Up to 8 Materials, Near-Zero Waste",
                            "body": "The INDX is Bondtech and Prusa's automatic toolchanger that adds fast, purgeless multi-material printing to the Prusa CORE One — up to 8 independent tools with almost no purge waste, unlike an AMS that wastes filament on every color change. The Founders Editions are shipping out June 25.",
                            "link": "https://blog.prusa3d.com/prusa-core-one-indx-orders-now-open_134915/",
                            "linkLabel": "Prusa: INDX Orders Open"
                        },
                        {
                            "heading": "Pricing & Availability",
                            "bullets": [
                                "8-tool kit ~$999 / €899; 4-tool kit ~$749 / €669 (upgrade kits for the CORE One)",
                                "Founders Editions shipping June 25 — wider availability still TBD",
                                "Accessories and spare/extra tool heads are listed on the Bondtech store, but not buyable yet",
                                "Purgeless toolchanging vs. an AMS: real filament + time savings on multi-material jobs"
                            ],
                            "link": "https://www.bondtech.se/product/founders-edition-indx-for-core-one-8-tools/",
                            "linkLabel": "Bondtech INDX (8 Tools)"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Toolchanger (INDX) vs. AMS vs. the DIY 4-AMS U1 — which approach wins for multicolor?",
                                "Purgeless is the big selling point — does near-zero waste justify the cost for you?",
                                "CORE One owners: tempting upgrade, or wait for general availability and reviews?"
                            ]
                        }
                    ]
                },
                {
                    "id": "giant-arduino-robot",
                    "title": "Giant Arduino Robot — 7× Bigger, and It Works!",
                    "description": "A maker scaled an Arduino robot up seven times — and it actually functions",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "He Built an Arduino Robot 7× Bigger (And It Actually Works)",
                            "body": "Pure maker fun: someone took a small Arduino robot and rebuilt it seven times larger — and the giant version actually works. A great showcase of 3D printing for large-format mechanical parts, plus the engineering headaches that come with scaling everything up.",
                            "videoUrl": "https://youtu.be/KtBT_bazFGo"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Scaling up 7× isn't free — torque, weight, power, and part strength all fight back. What breaks first?",
                                "How fun is this! Am I right?",
                                "Best 'because I can' build any of us have attempted?"
                            ]
                        }
                    ]
                },
                {
                    "id": "gesture-robot-hand",
                    "title": "Gesture-Mirroring Robot Hand — Marina's Open-Source Build",
                    "description": "A computer-vision hand that mirrors your movements — full credit to Marina; I forked it and added docs",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "Gesture-Controlled Robotic Hand — No Gloves",
                            "body": "A robotic hand that mirrors your real-life hand movements in real time — using computer vision to track your hand, with no gloves or sensors to wear. This is Marina's open-source project; here's her demo video.",
                            "videoUrl": "https://youtu.be/_GSqwtdkvcs"
                        },
                        {
                            "heading": "How It Works — and Full Credit to Marina",
                            "body": "All credit goes to Marina, who designed and built this — it's fully open source on her GitHub.",
                            "bullets": [
                                "Computer-vision hand tracking → servo-driven 3D-printed hand, no wearable hardware",
                                "Open source: anyone can build their own or contribute",
                                "The original project and demo are Marina's work"
                            ],
                            "link": "https://github.com/mmm1712/hand-gestures-robotic-hand",
                            "linkLabel": "Marina's GitHub"
                        },
                        {
                            "heading": "My Fork & What I Added",
                            "body": "I forked Marina's repo and contributed documentation to the project's static webpage. That pull request isn't merged upstream yet, but I'll show the docs page live tonight.",
                            "bullets": [
                                "My contribution: documentation for the project's static webpage (PR pending merge upstream)",
                                "Where could a rig like this go — teleoperation, prosthetics, accessibility, animatronics?"
                            ],
                            "link": "https://github.com/MaxSikorski/hand-gestures-robotic-hand",
                            "linkLabel": "My Fork"
                        }
                    ]
                },
                {
                    "id": "quick-tip",
                    "title": "Quick Tip of the Week",
                    "description": "The basic 3D printer tools that are genuinely worth having",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Quick Tip: The Basic Tools Worth Owning",
                            "body": "You don't need a huge kit, but a handful of cheap tools make printing dramatically less painful. The full walkthrough is in the video below — and here's the complete checklist on the next few slides so you don't have to watch the whole thing.",
                            "videoUrl": "https://youtu.be/1QjFT-w534M"
                        },
                        {
                            "heading": "Before Printing (1:31)",
                            "bullets": [
                                "Solid glue stick — bed adhesion, or a release agent for high-grip materials like TPU to protect the build surface",
                                "PTFE tube cutter — clean, square 90° cuts on Bowden/guide tubes to avoid gaps and friction",
                                "Mini digital hygrometer & thermometer — track ambient or dry-box humidity so your filament stays dry"
                            ]
                        },
                        {
                            "heading": "Nozzle Cleaning (4:27)",
                            "bullets": [
                                "Nozzle cleaning needles — in a storage tube; clear partial clogs from standard 0.4mm nozzles",
                                "Two brushes — soft brass for melted plastic on a hot nozzle (won't damage it), nylon for frame dust",
                                "Dual wrench set — 20mm to hold the heater block + a multi-wrench (5/6/7mm) to swap nozzles while hot",
                                "Tweezers — pluck oozing filament strings right as the bed finishes leveling"
                            ]
                        },
                        {
                            "heading": "Model Removal (6:30)",
                            "bullets": [
                                "Plastic scraper — 10 replaceable blades to lift purge lines, skirts, and light prints without scratching PEI or spring steel",
                                "Stainless steel scraper — for stubborn, heavy-duty removal (keep it aligned to avoid gouging the plate)"
                            ]
                        },
                        {
                            "heading": "Measurement (7:41)",
                            "bullets": [
                                "Digital caliper — 0.1mm accuracy, mm/inch toggle, built-in step & depth gauge; ships with a battery + spare",
                                "Mini cutting mat — compact 22 × 15 cm dual-sided mat to protect your desk from knives and files"
                            ]
                        },
                        {
                            "heading": "Post-Processing (9:46)",
                            "bullets": [
                                "Craft knife — X-Acto-style with 10 spare blades for trimming wisps and shaving layer artifacts",
                                "Needle file set — 5 micro-files (flat, half-round, triangular, round) for tight geometries and screw channels",
                                "Precision tweezers — straight, curved, and flat-tip pairs for supports and fragile parts",
                                "Hand deburring tool — swivel head + 5 spare blades to shave sharp edge brims in one pass",
                                "Precision flush cutters — flat-faced diagonal cutters to clip supports flush to the surface",
                                "Silicon finger protectors — 4 caps to shield fingertips from hot stringing and sharp edges",
                                "Manual pin vise / hand drill — pocket hand chuck + mini HSS bits to clean up undersized screw holes"
                            ]
                        }
                    ]
                },
                {
                    "id": "community-news",
                    "title": "Community News & Topics",
                    "description": "Share what you're interested in talking about!",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Next Week's Meetup",
                            "body": "Find something you're interested in talking about? Share it here and we'll cover it in next week's meetup!",
                            "link": "https://github.com/MaxSikorski/3d-printing-weekly-news/issues",
                            "linkLabel": "Submit a Topic"
                        }
                    ]
                }
            ]
        },
        "2026-W24": {
            "week": "2026-W24",
            "date": "2026-06-11",
            "title": "MRRF Weekend, BigTreeTech's ViViD & Formlabs Goes Industrial",
            "subtitle": "This week in 3D printing news",
            "timerMinutes": 20,
            "topics": [
                {
                    "id": "mrrf-2026",
                    "title": "MRRF 2026 — This Weekend!",
                    "description": "The Midwest RepRap Festival hits Goshen, IN — and several of us are going",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "MRRF 2026 — June 12–14, Goshen, Indiana",
                            "body": "The Midwest RepRap Festival — one of the world's largest gatherings of 3D-printing enthusiasts — returns to the Elkhart County 4-H Fairgrounds this weekend, Friday through Sunday. It's community-run, famously free to attend, and packed with vendor booths, wild show-and-tell builds, talks, and the legendary tip-jar raffle.",
                            "link": "https://www.facebook.com/midwestreprapfest/",
                            "linkLabel": "MRRF on Facebook"
                        },
                        {
                            "heading": "What to Watch For",
                            "bullets": [
                                "Toolchangers everywhere — Stealthchanger Vorons, the new wave of changers we've been covering, and DIY multi-material rigs",
                                "Open-source hardware in the wild: RatRig, Voron, E3D, Slice Engineering, Annex, and the maker crowd",
                                "Big, weird, and record-setting prints — MRRF is where the showpieces come out",
                                "Vendor deals and brand-new gear that often debuts right at the show"
                            ]
                        },
                        {
                            "heading": "We're Going — Recap Next Week",
                            "body": "Max and several meetup members are road-tripping out in person. We'll bring back photos, notes, and a full MRRF recap for next Thursday's meetup (June 18).",
                            "bullets": [
                                "Going too? Let's coordinate and meet up at the show",
                                "What do you want us to hunt down and report back on?"
                            ]
                        }
                    ]
                },
                {
                    "id": "bigtreetech-biqu",
                    "title": "New from BigTreeTech & BIQU",
                    "description": "A multi-color filament dryer, fresh screens & boards — plus a Bambu firmware fight",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "BTT ViViD — Multi-Color Filament Dryer + Changer",
                            "body": "BigTreeTech's ViViD is an all-in-one, open-source answer to the Bambu AMS for Klipper printers. It feeds and changes filament while actively drying it — and it's one of the most affordable open-source AMS alternatives out there, around $339.",
                            "link": "https://biqu.equipment/products/biqu-vivid",
                            "linkLabel": "View the ViViD"
                        },
                        {
                            "heading": "Why ViViD Is Interesting",
                            "bullets": [
                                "Holds 4 spools and dries them with a built-in cross-flow fan while you print — gang up to 4 units for 16 colors",
                                "Automatic filament backup: when a spool runs out, the next takes over mid-print — no pause, no failed job",
                                "RFID auto-detects filament type, color, and recommended temp on tagged spools",
                                "Works with Klipper machines (Voron 2.4, Trident, VzBot); needs a toolhead cutter like Filametrix or A4T"
                            ]
                        },
                        {
                            "heading": "More New BTT Gear",
                            "bullets": [
                                "PAD5 V2.0 — refreshed 5\" Klipper touchscreen (~$79)",
                                "Creator Knomi Hi — wireless smart display with custom GIFs, made for the Creality Hi (~$56)",
                                "K Hub V1.0 — 4-port USB 2.0 hub for Klipper, with 24V/5V power (~$18)",
                                "Scylla V1.0 — a CNC control board (STM32H723); BTT stepping beyond just 3D printers (~$88)"
                            ]
                        },
                        {
                            "heading": "The Catch: Panda Touch vs. Bambu's New Firmware",
                            "body": "BTT's Panda Touch (a wireless screen that controls Bambu printers) is getting squeezed by Bambu's new authorization/authentication firmware — print start, motion, temperature, and AMS control can stop working unless you're in LAN / Developer mode. It's the same right-to-repair fight we've been tracking with the slicer drama.",
                            "link": "https://bigtree-tech.com/blogs/news/announcement-on-bambu-lab-security-firmware-update",
                            "linkLabel": "BTT's Statement"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Open-source AMS alternatives (ViViD and others) vs. the locked Bambu AMS — is the gap closing?",
                                "Bambu's auth firmware keeps breaking third-party gear — does that change what you'll buy next?"
                            ]
                        }
                    ]
                },
                {
                    "id": "formlabs-fuse-x1",
                    "title": "Formlabs Fuse X1 — Industrial SLS",
                    "description": "A large-format SLS ecosystem aimed at real production, launched June 9",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Formlabs Fuse X1 (Launched June 9)",
                            "body": "Formlabs jumped from prototyping into full production with the Fuse X1, a large-format selective laser sintering (SLS) system. Starting price: $84,999, with shipping in Q4 2026.",
                            "link": "https://3dprintingindustry.com/news/formlabs-launches-fuse-x1-technical-specifications-and-pricing-252208/",
                            "linkLabel": "Specs & Pricing"
                        },
                        {
                            "heading": "Why It Matters",
                            "bullets": [
                                "330 × 330 × 565 mm build volume — genuinely large-format SLS",
                                "Claims production parts in under 24 hours, ~3× the throughput and ~half the cost-per-part of comparable powder-bed machines",
                                "New 'Adaptive Thermal Control' with 13 independent thermal zones enables 30%+ packing density (vs ~10–15% typical for MJF)",
                                "Early users — Tesla, Radio Flyer, Autotiv — already printed 30,000+ parts"
                            ]
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Does prosumer high-speed CoreXY with PA-CF eat the low end of SLS — or is powder-bed still its own world?",
                                "At ~$85k, who's the real customer in our orbit: service bureaus, R&D labs, small manufacturers?"
                            ]
                        }
                    ]
                },
                {
                    "id": "ratrig-vcore-4-1",
                    "title": "RatRig V-Core 4.1 + RatOS 2.1",
                    "description": "A meaningful open-source CoreXY refresh for the FOSS crowd",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "RatRig V-Core 4.1 Upgrade",
                            "body": "RatRig rolled out a 4.1 refresh of its open-source V-Core CoreXY platform — plus an upgrade kit so existing V-Core 4.0 owners can bring their machines up to spec instead of buying new.",
                            "link": "https://ratrig.com/products/rat-rig-v-core-4-1",
                            "linkLabel": "V-Core 4.1"
                        },
                        {
                            "heading": "What Changed",
                            "bullets": [
                                "New rigid toolhead with much better part cooling, integrated with the Orbitool O2S toolboard — one clean cable to the toolhead",
                                "Steel X-axis gantry replaces the bi-metal design, killing thermal distortion in enclosed, high-temp printing",
                                "Pairs with RatOS 2.1: adaptive heat soak, improved compensation mesh, and better multi-point true-zero calibration",
                                "Open-source through and through — a natural MRRF-floor machine"
                            ]
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Build-it-yourself CoreXY vs. buy-it-assembled (Bambu/Creality): who's still scratch-building in 2026, and why?",
                                "Is the single-cable toolboard trend (Orbitool / EBB) finally making DIY toolheads painless?"
                            ]
                        }
                    ]
                },
                {
                    "id": "prusament-pc-space",
                    "title": "Prusament PC Space-Grade Black",
                    "description": "An ESD-safe, low-outgassing polycarbonate you can print at home — literally space-rated",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Prusa + TRL Space: PC Space-Grade Black",
                            "body": "Prusa Research teamed up with Czech space company TRL Space on a polycarbonate filament engineered for orbit — ESD-safe and ultra-low-outgassing, meeting European Space Agency requirements. Around €249 for an 850 g spool.",
                            "link": "https://blog.prusa3d.com/prusament-pc-space-grade-black_121877/",
                            "linkLabel": "Prusa's Announcement"
                        },
                        {
                            "heading": "Why 'Space-Grade' Matters",
                            "bullets": [
                                "Ultra-low outgassing (0.25% total mass loss vs ESA's 1% limit) — it won't fog optics or sensors in vacuum",
                                "ESD-safe — safely dissipates static around sensitive electronics",
                                "Developed against real CubeSat targets: ≥70 MPa tensile, 100°C heat-deflection",
                                "Prints on a normal hardened-nozzle machine: ~290°C nozzle, 120°C bed"
                            ]
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "A genuinely satellite-rated material you can run at home — gimmick, or a real door into aerospace work?",
                                "Where would ESD-safe + low-outgassing PC actually help us — electronics enclosures, jigs, optics mounts?"
                            ]
                        }
                    ]
                },
                {
                    "id": "industrial-roundup",
                    "title": "Industrial AM — Quick Hits",
                    "description": "A fast pass on the industrial side (we're a consumer-focused crew)",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Industrial AM — Quick Hits",
                            "bullets": [
                                "Sinterit BIANCO2 — compact SLS with an open material ecosystem and an RF CO₂ laser (~€47k)",
                                "Mastrex MX300 — metal LPBF, dual 500 W lasers, runs aluminum / Inconel / stainless ($185k)",
                                "ExxonMobil × Meltio — a refinery part redesigned with wire-laser DED: 42% cheaper, 90% faster lead time"
                            ],
                            "link": "https://3dprint.com/326493/3d-printing-news-briefs-6-6-2026/",
                            "linkLabel": "News Brief (June 6)"
                        }
                    ]
                },
                {
                    "id": "bloomberg-ban",
                    "title": "Who's Funding the Printer-Ban Push?",
                    "description": "Follow-up to the ban bills — videos arguing Bloomberg-backed groups are behind them",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "The Money Behind the 3D-Printer Bans",
                            "body": "A follow-up to the ban bills we've covered: this video argues the state 3D-printer legislation isn't really grassroots — it's a coordinated push backed by Michael Bloomberg-funded advocacy groups, and that it's more about control of the technology than stopping crime. (Presented as the creator's argument — worth weighing critically.)",
                            "videoUrl": "https://youtu.be/E1B2cWEaWDw"
                        },
                        {
                            "heading": "NY's Law: 'Not Gun Control — Just Control'",
                            "body": "The second video zeroes in on New York's proposal, arguing it targets the printers and the makers themselves rather than firearms.",
                            "videoUrl": "https://youtu.be/ma12AyQHzYs"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Separate the claim from the fact — what's verifiable here, and what's advocacy?",
                                "If the funding angle holds up, does it change how we push back: right-to-repair framing vs. gun-policy framing?",
                                "These bills (CA AB 2047, NY budget) still reach Klipper / Mainsail and used-printer resale — worth tracking"
                            ]
                        }
                    ]
                },
                {
                    "id": "microplastics-research",
                    "title": "Microplastics Research, Questioned",
                    "description": "A look at how shaky a lot of microplastics science is — and why it matters for printing",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "The Grad Student Who 'Broke' Microplastics Research",
                            "body": "A thought-provoking video on how a grad student exposed serious problems in how microplastics research gets done — relevant given the ongoing debate over whether FDM printing and filament dust meaningfully add to microplastics and fine-particle exposure.",
                            "videoUrl": "https://youtu.be/pNPvWsmxwno"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "How much do our printers actually contribute — filament dust, FDM particle emissions, failed-print waste?",
                                "Does this change how we think about ventilation and enclosures in our print spaces?",
                                "Biodegradable filaments (PHA, the PLA debate) — real fix or feel-good?"
                            ]
                        }
                    ]
                },
                {
                    "id": "nike-zellerfeld",
                    "title": "Nike's 3D-Printed Air Max",
                    "description": "Fully 3D-printed sneakers ship to consumers",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Nike Air Max 1000.2 — Printed, Not Stitched",
                            "body": "Nike and Zellerfeld released the Air Max 1000.2, a fully 3D-printed sneaker made from a single TPU foam (zellerFOAM). Priced at $179, the latest drop refined the geometry and outsole for better feel and faster production.",
                            "link": "https://3dprint.com/326563/3d-printing-news-briefs-6-10-2026/",
                            "linkLabel": "News Brief (June 10)"
                        },
                        {
                            "heading": "Discussion",
                            "bullets": [
                                "Printed footwear is going mainstream — is this the consumer 'killer app' for large-format TPU printing?",
                                "A single-material, recyclable shoe vs. traditional glued-and-stitched construction — does it stick?"
                            ]
                        }
                    ]
                },
                {
                    "id": "sovol-m1d",
                    "title": "Sovol M1D — DualX Toolchanger",
                    "description": "Sovol's IDEX tool-changing printer — and I've got two on preorder",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Sovol M1D — DualX™ IDEX Tool-Changer",
                            "body": "Sovol's M1D is a new spin on multi-material: a 'DualX' IDEX system pairing one fixed extruder for reliable, continuous output with a second tool-changing extruder. A patented metal auto-grip mechanism swaps toolheads in about 5 seconds, and it'll run up to 7 colors or 7 materials with almost zero waste.",
                            "link": "https://www.sovol3d.com/pages/sovol-m1d-landing-page",
                            "linkLabel": "Sovol M1D"
                        },
                        {
                            "heading": "What's Clever About It",
                            "bullets": [
                                "DualX: one fixed extruder + one tool-changing extruder — IDEX modes (Mirror, Copy, Single, Multi) plus true toolchanging",
                                "~5-second toolhead swaps via a patented metal auto-grip; toolheads heat independently and preheat before a swap",
                                "Auto Vision Calibration sets XY offsets by camera — Sovol claims up to 2.5× faster than probe-based setup",
                                "Eddy-current auto bed leveling, auto Z-lift between heads, and a 6-channel filament system with runout / clog / tangle detection"
                            ]
                        },
                        {
                            "heading": "Show-and-Tell + Discussion",
                            "body": "I've got two M1Ds on preorder — so we'll do hands-on group show-and-tell once they land.",
                            "bullets": [
                                "IDEX plus toolchanging in one machine — best of both worlds, or more to break?",
                                "How does Sovol's 5s auto-grip stack up against the FlashForge Creator 5 and Snapmaker U1 changers we covered?",
                                "Who else here runs Sovols? What would you print first with 7 materials at once?"
                            ]
                        }
                    ]
                },
                {
                    "id": "quick-tip",
                    "title": "Quick Tip of the Week",
                    "description": "Dry engineering filaments before printing — and a four-spool dryer worth a look (Sovol SH03)",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Quick Tip: Dry Before You Print",
                            "body": "Engineering filaments like polycarbonate, nylon, and TPU pull moisture from the air fast — and wet filament means stringing, popping, weak layers, and rough surfaces. Dry the spool before printing, and ideally keep it dry while printing (the whole idea behind boxes like ViViD and Sovol SH03). Rough starting points: ~80°C for PC, ~70°C for nylon, ~50°C for TPU, several hours each — but always check your spool's label, and when in doubt, dry longer. A great standalone option: the Sovol SH03, a four-spool dryer that heats to 85°C and can run up to 24 hours, with separate chambers so you can dry and store at once. I run two of them and they work great.",
                            "link": "https://www.sovol3d.com/products/sovol-sh03-filament-dryer",
                            "linkLabel": "Sovol SH03 Dryer"
                        }
                    ]
                },
                {
                    "id": "community-news",
                    "title": "Community News & Topics",
                    "description": "Share what you're interested in talking about!",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Next Week's Meetup",
                            "body": "Find something you're interested in talking about? Share it here and we'll cover it in next week's meetup!",
                            "link": "https://github.com/MaxSikorski/3d-printing-weekly-news/issues",
                            "linkLabel": "Submit a Topic"
                        }
                    ]
                }
            ]
        },
        "2026-W23": {
            "week": "2026-W23",
            "date": "2026-06-04",
            "title": "A2L Launch, Creality's IPO & 3D Printer Ban Bills",
            "subtitle": "This week in 3D printing news",
            "timerMinutes": 20,
            "topics": [
                {
                    "id": "bambu-a2l",
                    "title": "Bambu A2L — Official Launch",
                    "description": "The leaked large-format 'creative playground' is real and shipping",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Bambu A2L — It's Official",
                            "body": "After weeks of leaks, the A2L launched June 1 and is shipping now. It's Bambu's first extra-large A-series bed slinger, pitched as a 'creative playground.' Price: $469 standalone, or $569 with the AMS Lite combo.",
                            "link": "https://www.tomshardware.com/3d-printing/bambu-lab-launches-big-bed-slinger-a2l-companys-h2s-lite-is-half-the-cost-of-h2s-at-just-usd469",
                            "linkLabel": "Read the Launch Coverage"
                        },
                        {
                            "heading": "Key Specs",
                            "bullets": [
                                "Build volume: 330 × 320 × 325 mm — about 105% more space than 256 mm-class machines",
                                "Single nozzle (for multi-material, Bambu points to the X2D); up to 4 AMS + 1 AMS Lite for multicolor",
                                "300°C max nozzle, but only an 80°C bed (large open bed, no enclosure)",
                                "Closed-loop PMSM servo motors plus two granular dampers — Bambu claims Core-XY-like quality",
                                "Tom's Hardware nicknamed it the 'H2S Lite' — roughly half the cost of the H2S"
                            ]
                        },
                        {
                            "heading": "Creative Playground + Discussion",
                            "body": "An optional Blade Cutting Kit turns the A2L into a cutter and pen plotter for stickers, leather, fabric, and drawing — the 'creative playground' angle.",
                            "bullets": [
                                "How close did it land to the leaks we covered last time?",
                                "Single nozzle and an 80°C bed at $469 — fair trade for the bigger volume?",
                                "Is the cutting and plotting kit genuinely useful, or a gimmick?"
                            ]
                        }
                    ]
                },
                {
                    "id": "creality-ipo",
                    "title": "Creality Goes Public",
                    "description": "First consumer 3D printing company to IPO — and the money is smaller than you'd think",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Creality Goes Public",
                            "body": "Creality became the first consumer 3D printing company to IPO, listing on the Hong Kong Stock Exchange on May 29. It raised roughly HK$1.27 billion (about US$163M) at a market cap near US$1.1B — and the retail tranche was oversubscribed nearly 3,800 times.",
                            "link": "https://3dprintingindustry.com/news/new-creality-ipo-prospectus-shows-record-revenue-alongside-competitive-pressure-250765/",
                            "linkLabel": "Read the Prospectus Breakdown"
                        },
                        {
                            "heading": "The Money Reality",
                            "bullets": [
                                "2025 revenue hit a record RMB 3.13 billion (about US$430M)...",
                                "...but the company posted a net LOSS of about RMB 182M (~US$25M) in 2025 — margins crushed by competition",
                                "Sales are NOT mostly US: North America + Europe were 57.3% of 2025 revenue, China 25.9% — the mix is shifting West, away from China",
                                "On market size: ~$34–35B global in 2026, but hardware is the largest segment — 'services and materials dominate' is an industrial-AM stat, not consumer"
                            ]
                        },
                        {
                            "heading": "Discussion Points",
                            "bullets": [
                                "Now that Creality answers to shareholders, do we expect more ads and ecosystem lock-in (à la FlashForge)?",
                                "The 'world's largest' consumer maker lost money in 2025 — is consumer 3D printing just a brutal business?",
                                "Their KliTek nozzle-changer is slated for the K3 series in Q3 2026"
                            ]
                        }
                    ]
                },
                {
                    "id": "slicer-updates",
                    "title": "Latest Slicer Releases",
                    "description": "Fresh Bambu Studio, OrcaSlicer, and PrusaSlicer updates as of June 4",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Bambu Studio 2.7.1",
                            "body": "The latest public release adds support for the new A2L, plus two notable features: Texture-to-Color Painting and a new Filament Manager.",
                            "link": "https://github.com/bambulab/BambuStudio/releases",
                            "linkLabel": "View Releases"
                        },
                        {
                            "heading": "OrcaSlicer 2.3.2 (RC2)",
                            "bullets": [
                                "Major Linux usability improvements",
                                "Fixes for Bambu LAN printing with the legacy plugin",
                                "Pressure equalizer corrections, plus fuzzy skin and macOS fixes"
                            ],
                            "link": "https://github.com/OrcaSlicer/OrcaSlicer/releases",
                            "linkLabel": "View Releases"
                        },
                        {
                            "heading": "PrusaSlicer + Takeaways",
                            "bullets": [
                                "PrusaSlicer 2.9.4 is the current stable; 3.0 is in pre-release (Spring 2026)",
                                "Texture-to-Color Painting in Bambu Studio is a fun 30-second live demo",
                                "Orca's Bambu LAN fixes matter because of the ongoing Bambu/SFC licensing fight"
                            ]
                        }
                    ]
                },
                {
                    "id": "elegoo-emoji",
                    "title": "Elegoo × emoji® Collab",
                    "description": "The teased 'special edition' is a co-brand, not a new machine",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Elegoo × emoji® Centauri Carbon 2 Combo",
                            "body": "Elegoo's teased 'special edition' turned out to be a co-branding deal, not a new machine — the existing Centauri Carbon 2 Combo wearing emoji® branding. Price: $489. The slogan: 'Your Vibe, Now in 3D.'",
                            "link": "https://www.prnewswire.com/news-releases/creative-expression-takes-shape-elegoo-partners-with-emoji---the-iconic-brand-for-a-special-co-branded-3d-printer-centauri-carbon-2-combo-edition-302785379.html",
                            "linkLabel": "Read the Announcement"
                        },
                        {
                            "heading": "Discussion Points",
                            "bullets": [
                                "Is sneaker-style brand-collab marketing coming for 3D printers?",
                                "Does emoji® branding add anything, or is it pure marketing on a printer you could already buy?"
                            ]
                        }
                    ]
                },
                {
                    "id": "robot-dog",
                    "title": "James Bruton's Six-Servo Robot Dog",
                    "description": "A fully open-source, printable robot dog anyone can build",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "Six-Servo Robot Dog — Open Source",
                            "body": "James Bruton (XRobots) designed a deliberately approachable, fully open-source robot dog that's built to be printed and copied. It's a perfect group build.",
                            "videoUrl": "https://youtu.be/2eKb_2N0SBI"
                        },
                        {
                            "heading": "How It Works",
                            "bullets": [
                                "Just 6 servos total: 4 at the knees lift and lower the legs, 2 in the body drive the walking pattern",
                                "Opposite legs swing in tandem — smooth stride, simple kinematics, no per-leg motor, minimal math",
                                "Runs on an Arduino Uno and standard RC servos — cheap and easy to source",
                                "Offered in two sizes: large servos for a full-size dog, or 9g micro servos for a compact one"
                            ]
                        },
                        {
                            "heading": "Build It Yourself",
                            "body": "All the files — 3D models, assembly, and code — are free on his GitHub. Print the body and legs on a basic printer, bolt on standard RC servos, flash the Arduino code, and it walks. Could be a fun club build challenge.",
                            "link": "https://github.com/XRobots",
                            "linkLabel": "Download on GitHub"
                        }
                    ]
                },
                {
                    "id": "fusion-ai",
                    "title": "Autodesk Fusion AI Assistant",
                    "description": "Fusion's AI can now perform real design actions from plain language",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "Autodesk Fusion's AI Assistant",
                            "body": "Fusion's 'Autodesk Assistant' can now perform real design actions from plain-language requests — notable for anyone doing CAD for 3D printing.",
                            "videoUrl": "https://youtu.be/AjEK7Jht1gE"
                        },
                        {
                            "heading": "What It Can Do",
                            "bullets": [
                                "Natural-language modeling: describe a task and it runs the command — Extrude, Fillet, Chamfer, Hole, Shell, Split",
                                "Script Execute: writes and runs scripts against the Fusion API to automate multi-step workflows",
                                "Admin automation: create projects and folders, invite teammates, review permissions by chat",
                                "Now also reachable through Anthropic's Claude for natural-language design actions"
                            ]
                        },
                        {
                            "heading": "Discussion Points",
                            "bullets": [
                                "Does AI CAD lower the barrier for makers who hate parametric modeling — or just make confident mistakes?",
                                "Genuinely useful for designing printable parts, or a demo gimmick?"
                            ]
                        }
                    ]
                },
                {
                    "id": "flashforge-creator5",
                    "title": "FlashForge Creator 5 Toolchanger",
                    "description": "A true 4-toolhead toolchanger aimed at the Snapmaker U1",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "FlashForge Creator 5 Toolchanger",
                            "body": "FlashForge's Creator 5 is a true 4-toolhead toolchanger (not IDEX), aimed squarely at the Snapmaker U1. Launch pricing — $649 for the Creator 5, $799 for the enclosed Creator 5 Pro — runs through June 20.",
                            "link": "https://all3dp.com/4/flashforges-creator-5-toolchanger-takes-aim-at-the-snapmaker-u1-starting-at-649/",
                            "linkLabel": "Read the Breakdown"
                        },
                        {
                            "heading": "Specs",
                            "bullets": [
                                "Four swappable toolheads with roughly 7-second changes; marketing claims 'zero purge waste' and '500% faster' multicolor",
                                "256 × 256 × 256 mm, CoreXY, up to 600 mm/s",
                                "Direct-drive hardened-steel nozzles (0.4 standard; 0.25 / 0.6 / 0.8 options), up to ~350°C, 120°C bed",
                                "1080p camera, Wi-Fi and LAN; works with Flash Studio and Orca-FlashForge"
                            ]
                        },
                        {
                            "heading": "Discussion Points",
                            "bullets": [
                                "A 4-toolhead changer at $649 — is affordable toolchanging finally here (vs Snapmaker U1 and Prusa)?",
                                "Given FlashForge's ecosystem-lock reputation, do we trust them with a flagship?",
                                "True toolchanging with zero purge vs AMS-style multicolor with purge waste — which wins?"
                            ]
                        }
                    ]
                },
                {
                    "id": "printer-ban",
                    "title": "The '3D Printer Ban' Bills",
                    "description": "State legislation that could force blocking tech onto every printer sold",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "The '3D Printer Ban' Bills",
                            "body": "Several states are advancing bills aimed at 3D-printed firearms. Some target only the act of making a gun — but California and New York would force firearm-blocking tech and state-approved-model rosters onto every printer sold. For makers, it's as much a right-to-repair fight as a gun issue.",
                            "videoUrl": "https://youtu.be/EGvvEuIPJxA"
                        },
                        {
                            "heading": "California — AB 2047",
                            "bullets": [
                                "Passed the Assembly and is now in the state Senate — not yet law",
                                "Would require every 3D printer sold in California to include firearm-blocking technology that screens design files",
                                "Makes it a misdemeanor to disable or circumvent the blocking — and adds a state-approved-models roster",
                                "Phased deadlines run 2028–2029; civil fines up to $25,000 per violation for sellers"
                            ],
                            "link": "https://www.tomshardware.com/3d-printing/california-assembly-passes-3d-printer-bill-that-would-criminalize-bypassing-mandated-gun-blocking-software",
                            "linkLabel": "Read the Bill Status"
                        },
                        {
                            "heading": "Why the EFF Is Alarmed",
                            "bullets": [
                                "Banning circumvention would effectively criminalize open-source firmware and lock users into proprietary ecosystems",
                                "Compliance costs hurt small makers, and reselling a non-compliant printer could trigger penalties",
                                "Blocking needs cloud scanning or constant updates — a surveillance layer that could expand beyond firearms",
                                "It won't stop determined bad actors, but it will burden legitimate makers and researchers"
                            ],
                            "link": "https://www.eff.org/deeplinks/2026/04/dangers-californias-legislation-censor-3d-printing",
                            "linkLabel": "Read EFF's Analysis"
                        },
                        {
                            "heading": "Where the Other States Stand",
                            "bullets": [
                                "Washington: already law — HB 2320 was signed March 24, banning 3D-printed firearm manufacture and restricting design-code sharing",
                                "New York: a proposal in the 2026–2027 state budget would mandate print-blocking tech on all printers sold",
                                "Colorado: watered down to dodge a veto — the digital-code-distribution provision was removed to get the governor's signature"
                            ]
                        },
                        {
                            "heading": "Why We Care + Discussion",
                            "bullets": [
                                "The CA/NY approach touches every printer sold there — and could outlaw the open-source firmware we rely on (Klipper, Mainsail, even the ZMOD-style jailbreaks we covered)",
                                "What happens to buying and selling used printers across state lines?",
                                "Do mandated blocking algorithms actually stop anyone, or just burden hobbyists?"
                            ]
                        }
                    ]
                },
                {
                    "id": "quick-tip",
                    "title": "Quick Tip of the Week",
                    "description": "Calibrate new filament fast using OrcaSlicer's built-in Calibration menu",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Quick Tip: Calibrate Your Filament",
                            "body": "Dialing in a new filament is easy with OrcaSlicer's built-in Calibration menu. Just work through the tests in the dropdown from top to bottom — in that sequential order — to tune temperature, flow rate, pressure advance, and more for each spool.",
                            "link": "https://www.orcaslicer.com/wiki/calibration/calibration_guide.html",
                            "linkLabel": "OrcaSlicer Calibration Guide"
                        }
                    ]
                },
                {
                    "id": "community-news",
                    "title": "Community News & Topics",
                    "description": "Share what you're interested in talking about!",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Next Week's Meetup",
                            "body": "Find something you're interested in talking about? Share it here and we'll cover it in next week's meetup!",
                            "link": "https://github.com/MaxSikorski/3d-printing-weekly-news/issues",
                            "linkLabel": "Submit a Topic"
                        }
                    ]
                }
            ]
        },
        "2026-W22": {
            "week": "2026-W22",
            "date": "2026-05-28",
            "title": "PHA Filaments, Slicer Drama & Color Mixing",
            "subtitle": "This week in 3D printing news",
            "timerMinutes": 20,
            "topics": [
                {
                    "id": "prusa-mixer",
                    "title": "Prusa FDM Color Mixer",
                    "description": "Browser-based color mixing tool for multi-color FDM prints",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Prusa FDM Color Mixer",
                            "body": "Prusa released an open-source, browser-based tool for previewing and mixing colors in multi-material FDM prints. No software install needed — it runs right in your browser.",
                            "link": "https://prusa3d.github.io/prusa-fdm-mixer/",
                            "linkLabel": "Try the Mixer"
                        },
                        {
                            "heading": "Prusa FDM Color Mixer Demo",
                            "body": "Watch the official Prusa FDM Color Mixer demonstration to see the tool in action.",
                            "videoUrl": "https://www.youtube.com/watch?v=ERgnSetWkEA"
                        },
                        {
                            "heading": "Discussion Points",
                            "bullets": [
                                "Has anyone tried multi-color mixing on their printers?",
                                "How does this compare to Bambu's AMS color mixing approach?",
                                "It's open source (U1 Full Spectrum) — could we extend or customize it for our needs?"
                            ]
                        }
                    ]
                },
                {
                    "id": "oozebot-preflight",
                    "title": "oozeBot preFlight Slicer",
                    "description": "A new advanced 3D printing slicer and spiritual successor to PrusaSlicer",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "oozeBot preFlight Slicer",
                            "body": "oozeBot preFlight is an advanced 3D printing slicer building on the Slic3r legacy and acting as a spiritual successor to PrusaSlicer. Rather than a simple checklist utility, this is a full-fledged slicer with an under-the-hood overhaul of the entire dependency stack.",
                            "link": "https://github.com/oozebot/preFlight",
                            "linkLabel": "View on GitHub"
                        },
                        {
                            "heading": "Key Features & Transition",
                            "bullets": [
                                "Imports PrusaSlicer and OrcaSlicer profiles natively, enabling a quick transition",
                                "Comprehensive performance and code modernization under the hood",
                                "Developed by oozeBot (creators of the Elevate line of 3D printers)",
                                "Cross-platform support: Windows (x64/ARM64), macOS, Linux, and Raspberry Pi"
                            ]
                        }
                    ]
                },
                {
                    "id": "slicer-issues",
                    "title": "Slicer Issues & Licensing Drama",
                    "description": "Bambu Lab's AGPLv3 violations, legal threats, and FlashForge bugs",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Bambu Lab AGPLv3 Violations",
                            "body": "The Software Freedom Conservancy (SFC) has officially called out Bambu Lab for AGPLv3 licensing violations in Bambu Studio (a fork of PrusaSlicer). Bambu uses a proprietary networking library (libbambu_networking) instead of providing its Corresponding Source Code (CCS) as required.",
                            "link": "https://sfconservancy.org/news/2026/may/18/bambu-studio-3d-printer-agpl-violation-response/",
                            "linkLabel": "Read SFC Response"
                        },
                        {
                            "heading": "Legal Threat & Community Backlash",
                            "body": "Bambu Lab threatened legal action against developer Paweł Jarczak over his OrcaSlicer fork that restored Bambu Cloud connection using only native open-source tools and a single flag. This violates the AGPLv3 clause prohibiting further restrictions, causing community-wide backlash.",
                            "link": "https://github.com/FULU-Foundation/OrcaSlicer-bambulab",
                            "linkLabel": "OrcaSlicer Bambu GitHub"
                        },
                        {
                            "heading": "Project baltobu & Legal Protection",
                            "bullets": [
                                "SFC launched Project baltobu to reverse-engineer libbambu_networking and create an open-source replacement",
                                "baltobu will officially maintain the OrcaSlicer fork, extending liability protection to contributors",
                                "Over $114,000 raised by the community to support 3D printer Right-to-Repair efforts",
                                "Viscose: A clean open fork of Bambu Studio is being maintained under baltobu"
                            ]
                        },
                        {
                            "heading": "FlashForge Ecosystem Lock & Ads",
                            "body": "FlashForge has sparked outrage by locking down its printer ecosystem. Recent firmware updates close open network ports, blocking third-party slicers like OrcaSlicer. Additionally, they have introduced advertisements (such as AI model generators) directly into their desktop software.",
                            "link": "https://www.youtube.com/watch?v=higSOW0-N24",
                            "linkLabel": "Watch Video Report"
                        },
                        {
                            "heading": "The Community's Answer: ZMOD",
                            "bullets": [
                                "Community-developed ZMOD firmware extension jailbreaks Adventurer 5M/Pro/AD5X series",
                                "Unlocks the printer's underlying Klipper system, enabling Mainsail or Fluidd web interfaces",
                                "Restores third-party slicer compatibility and direct network control",
                                "Allows advanced calibrations (bed mesh, input shaping) hidden by the stock firmware"
                            ],
                            "link": "https://www.reddit.com/r/FlashForge/comments/1tlvu53/flashforge_closes_ecosystem_puts_ai_ads_into/",
                            "linkLabel": "Reddit Discussion"
                        }
                    ]
                },
                {
                    "id": "pha-filament",
                    "title": "PHA Filament — Biodegradable Future?",
                    "description": "New truly biodegradable PHA filament options from Polar Filament",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "PHA Filament Deep Dive",
                            "body": "PHA (Polyhydroxyalkanoate) is a truly biodegradable 3D printing filament made from renewable resources. Unlike PLA, it decomposes naturally in compost or soil.",
                            "videoUrl": "https://youtu.be/m2GiiC5i5jg"
                        },
                        {
                            "heading": "Real Biodegradability",
                            "bullets": [
                                "Decomposes in 3-6 months when buried in soil",
                                "Decomposes in 1-2 years if floating in the ocean",
                                "Acts like wood: lasts indefinitely indoors, but degrades easily in nature"
                            ]
                        },
                        {
                            "heading": "Optimal Printing Parameters",
                            "bullets": [
                                "Hotend: 210°C",
                                "Build Plate: Room temperature (no heat required)",
                                "Enclosure: Print on an open printer"
                            ]
                        },
                        {
                            "heading": "Material Properties",
                            "bullets": [
                                "100°C Heat Deflection Temperature (better than ABS!)",
                                "Takes a couple of hours to fully crystallize post-print",
                                "Best practice: Remove from build plate after cooling, then let sit overnight before use"
                            ]
                        },
                        {
                            "heading": "Where to Buy Biodegradable Filament",
                            "body": "Polar Filament offers a range of biodegradable options including PHA blends. Worth checking out if you're interested in sustainable printing.",
                            "link": "https://polarfilament.com/collections/biodegradable",
                            "linkLabel": "Browse Polar Filament"
                        }
                    ]
                },
                {
                    "id": "waveoverhangs",
                    "title": "WaveOverhangs",
                    "description": "No more supports needed for overhangs",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "WaveOverhangs in OrcaSlicer",
                            "body": "A new technique for printing overhangs without supports by generating a wave-like pattern.",
                            "videoUrl": "https://www.youtube.com/watch?v=B-JlMAnAaaI"
                        },
                        {
                            "heading": "Links & Resources",
                            "bullets": [
                                "Project Website: waveoverhangs.com",
                                "GitHub Repository: dennisklappe/OrcaSlicer-WaveOverhangs"
                            ],
                            "link": "https://waveoverhangs.com/",
                            "linkLabel": "Visit WaveOverhangs"
                        }
                    ]
                },
                {
                    "id": "bambu-a2l",
                    "title": "Bambu A2L Leaks",
                    "description": "Upcoming large-format 'creative playground' printer from Bambu Lab",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Bambu A2L Announcement",
                            "body": "Bambu Lab is teasing a new large-format 3D printer and 'creative playground' scheduled for release on June 1. It is an extra-large, scaled-up sibling to the A1 bedslinger."
                        },
                        {
                            "heading": "Speculated Features",
                            "bullets": [
                                "Large Build Volume: Estimated between 300mm and 350mm square",
                                "Creative Attachments: Swappable toolhead modules for vinyl cutting, pen plotting, etc.",
                                "Multi-Color: Supports the AMS Lite system",
                                "Upgraded Hardware: PMSM closed-loop servos, active clog detection"
                            ]
                        },
                        {
                            "heading": "Pricing Estimates",
                            "body": "The community estimates the standalone machine will fall between $399 and $549 USD, depending on if it's bundled with the AMS Lite."
                        }
                    ]
                },
                {
                    "id": "creality-kiltek",
                    "title": "Creality NextGen Nozzle Swapper",
                    "description": "KliTek's new nozzle-changing system",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "KliTek NextGen Nozzle-Changing",
                            "body": "A new automated nozzle-swapping system announced for Creality printers on May 29th.",
                            "link": "https://www.reddit.com/r/Creality/comments/1tq5eck/klitek_nextgen_nozzlechanging_printing/",
                            "linkLabel": "View Reddit Discussion"
                        }
                    ]
                },
                {
                    "id": "elegoo-teaser",
                    "title": "Elegoo Special Edition Teaser",
                    "description": "Announcement scheduled for June 4th",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "Elegoo Special Edition Launch",
                            "body": "Elegoo is teasing a special edition 3D printer launch. The full announcement will drop on June 4th at 9:30 AM EDT.",
                            "link": "https://us.elegoo.com/pages/3d-printer-special-edition-launch",
                            "linkLabel": "View Teaser Page"
                        }
                    ]
                },
                {
                    "id": "polymaker-abs",
                    "title": "Polymaker High Temp ABS",
                    "description": "New high-temperature ABS filament",
                    "type": "discussion",
                    "slides": [
                        {
                            "heading": "Polymaker High Temp ABS",
                            "body": "Check out the photos of the new Polymaker High Temp ABS. It features improved thermal properties and excellent surface finish.",
                            "imageUrl": "photos/Polymaker High Temp ABS.png"
                        }
                    ]
                },
                {
                    "id": "infimech-mx",
                    "title": "Infimech MX Series",
                    "description": "A FlashForge AD5X clone with Bontech INDX tool changing",
                    "type": "tool",
                    "slides": [
                        {
                            "heading": "AD5X + INDX = Infimech MX?",
                            "body": "The Infimech MX series recently launched on Kickstarter. It looks remarkably like a FlashForge AD5X clone but integrates the Bontech INDX tool-changing system. Many in the community are quite skeptical of the claims.",
                            "link": "https://www.kickstarter.com/projects/infimech-mx-series/infimech-mx-3d-printer-8x-more-efficiency-8x-less-waste",
                            "linkLabel": "View Kickstarter"
                        }
                    ]
                },
                {
                    "id": "quick-tip",
                    "title": "Quick Tip of the Week",
                    "description": "How to use electrical tape to fix cardboard spool issues in AMS & holders",
                    "type": "video",
                    "slides": [
                        {
                            "heading": "Cardboard Spool Edge Fix",
                            "body": "Cardboard spools are great for the environment, but they create dust and cause friction/slipping in AMS systems or stock spool holders. Wrapping electrical tape around the outer edge (or inner rim) resolves these friction issues completely.",
                            "videoUrl": "https://youtu.be/m2GiiC5i5jg?t=211"
                        }
                    ]
                },
                {
                    "id": "community-news",
                    "title": "Community News & Topics",
                    "description": "Share what you're interested in talking about!",
                    "type": "text",
                    "slides": [
                        {
                            "heading": "Next Week's Meetup",
                            "body": "Find something you're interested in talking about? Share it here and we'll cover it in next week's meetup!",
                            "link": "https://github.com/MaxSikorski/3d-printing-weekly-news/issues",
                            "linkLabel": "Submit a Topic"
                        }
                    ]
                }
            ]
        }
    };

    // === Initialize ===
    function init() {
        const params = new URLSearchParams(window.location.search);
        const weekId = params.get('week');

        if (!weekId) {
            window.location.href = 'index.html';
            return;
        }

        function loadPresentation(data) {
            weekData = data;

            // Update page title
            document.title = `${data.title} — 3D Printing Meetup`;

            // Set timer from data
            if (data.timerMinutes) {
                timerSeconds = data.timerMinutes * 60;
            }
            updateTimerDisplay();

            // Build slides and TOC
            buildSlides(data);
            buildTOC(data);

            // Show first slide
            loadingState.style.display = 'none';
            presentation.style.display = 'block';
            presenterControls.style.display = 'flex';

            slides[0].el.classList.add('active');
            gsap.set(slides[0].el, { opacity: 1 });

            // Animate hero elements in
            const heroElements = slides[0].el.querySelectorAll('.slide-topic-badge, .slide-heading, .slide-body, [style*="display: flex"]');
            gsap.set(heroElements, { opacity: 0, y: 30 });
            gsap.to(heroElements, {
                opacity: 1,
                y: 0,
                duration: 1.2,
                ease: 'power4.out',
                stagger: 0.12,
                delay: 0.3
            });

            // Fix subtitle opacity
            const subtitles = slides[0].el.querySelectorAll('.slide-body');
            gsap.to(subtitles, { opacity: 0.85, duration: 1.2, ease: 'power4.out', delay: 0.5 });

            updateControls();
            updateSlideCredit();

            // Start button
            const startBtn = document.getElementById('start-btn');
            if (startBtn) {
                startBtn.addEventListener('click', () => {
                    goToSlide(overviewSlideIndex, 1);
                });
            }

            // Show keyboard hints briefly
            setTimeout(showKeyboardHints, 2000);

            // Deep link (share feature): ?topic=<id> lands on that topic's first slide.
            // A shared link shouldn't start the meetup timer — suppress autostart for the jump.
            const topicParam = params.get('topic');
            if (topicParam) {
                const idx = slides.findIndex(s => s.topicId === topicParam);
                if (idx > 0) {
                    const wasStarted = timerStarted;
                    timerStarted = true;
                    goToSlide(idx, 1);
                    timerStarted = wasStarted;
                }
            }
        }

        // Try fetch first (GitHub Pages / HTTP), fall back to inline data (file://)
        fetch(`weeks/${weekId}.json`)
            .then(res => {
                if (!res.ok) throw new Error(`Week ${weekId} not found`);
                return res.json();
            })
            .then(data => loadPresentation(data))
            .catch(err => {
                // Fall back to inline data
                if (INLINE_WEEKS[weekId]) {
                    console.log('Using inline data (file:// mode)');
                    loadPresentation(INLINE_WEEKS[weekId]);
                } else {
                    console.error('Failed to load presentation:', err);
                    loadingState.innerHTML = `
                        <div style="text-align: center;">
                            <p style="opacity: 0.5; margin-bottom: 16px;">Could not load presentation</p>
                            <a href="index.html" class="btn secondary-btn">Back to Archive</a>
                        </div>
                    `;
                }
            });
    }

    // Expose public API
    window.Presenter = {
        goToSlide,
        goToTopic,
        nextSlide,
        prevSlide,
        goToOverview,
        toggleTOC,
        toggleQR,
        resetTimer
    };

    // === Image Lightbox (click a slide photo to expand it) ===
    (function setupImageLightbox() {
        const overlay = document.createElement('div');
        overlay.className = 'image-lightbox';
        overlay.innerHTML = '<img class="image-lightbox-img" alt="">';
        document.body.appendChild(overlay);
        const lightboxImg = overlay.querySelector('.image-lightbox-img');

        function openLightbox(src, alt) {
            lightboxImg.src = src;
            lightboxImg.alt = alt || '';
            overlay.classList.add('visible');
        }
        function closeLightbox() {
            overlay.classList.remove('visible');
        }

        // Open when a slide photo (single image or gallery item) is clicked
        document.addEventListener('click', (e) => {
            const img = e.target.closest('.slide-image-container img, .slide-gallery-item img');
            if (img) {
                e.preventDefault();
                openLightbox(img.currentSrc || img.src, img.alt);
            }
        });

        // Click anywhere off the image (the dimmed backdrop) to close
        overlay.addEventListener('click', (e) => {
            if (e.target !== lightboxImg) closeLightbox();
        });

        // Escape also closes it (runs before the presenter's own Escape handler)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('visible')) {
                e.stopImmediatePropagation();
                e.preventDefault();
                closeLightbox();
            }
        }, true);
    })();

    init();

})();
