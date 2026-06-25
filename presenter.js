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
        github: 'https://github.com/MaxSikorski'
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

                slideHTML += '</div>';
                slide.innerHTML = slideHTML;
                container.appendChild(slide);

                // Determine URL for QR code
                const qrUrl = slideData.link || slideData.videoUrl || topic.url || null;
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
        const innerElements = nextSlideEl.querySelectorAll('.slide-topic-badge, .slide-heading, .slide-body, .slide-bullets li, .slide-link, .video-container, .topic-card, .connect-links');
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
                if (tocOpen) {
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
        if (e.touches.length !== 1 || tocOpen || qrVisible) { touchTracking = false; return; }
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
                            ]
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
                            "heading": "Bambu PLA Pure (Launched June 15)",
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
                            ]
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
                            "heading": "Prusament PLA High-Speed (Launched June 25)",
                            "body": "Prusa's first high-speed PLA, claiming up to 40% faster prints 'in the right conditions.' It's formulated to flow cleanly at the higher volumetric speeds modern CoreXY machines push, and is designed to pair with Prusa's high-flow CHT Nextruder nozzles. Launching in a five-color series.",
                            "link": "https://all3dp.com/4/prusa-launches-its-first-high-speed-pla-promising-up-to-40-faster-prints/",
                            "linkLabel": "Prusament PLA High-Speed"
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
                            "linkLabel": "LDO Unicorn Docs"
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
                            "heading": "...And They 3D-Print a Hypercar (Czinger 21C)",
                            "body": "The fun connection: Divergent and Czinger Vehicles share a founder — Kevin Czinger. The Czinger 21C is a 3D-printed hybrid hypercar built on that same additive tech: a tandem two-seater making 1,250 hp (1,350 in the limited 'Blackbird'), a top speed around 281 mph, just 80 units, from ~$1.7M. The 3D-printed metal structures aren't a gimmick — they're how it gets so light and strong.",
                            "link": "https://en.wikipedia.org/wiki/Czinger_21C",
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
                            "heading": "Quick Tip: Run Input Shaping (Kill the Ghosting)",
                            "body": "Those faint echoes or ripples next to sharp corners and embossed text are 'ringing' (ghosting) from machine vibration. If you run Klipper, input shaping cancels it: attach an accelerometer (a cheap ADXL345 — or a kit like the LDO Unicorn above), run TEST_RESONANCES, and Klipper picks the best shaper and frequency per axis. No accelerometer? You can still improve it by eye with a ringing/tower test and by keeping your belts tensioned and frame tight. Five minutes of calibration for noticeably crisper corners.",
                            "link": "https://www.klipper3d.org/Resonance_Compensation.html",
                            "linkLabel": "Klipper: Resonance Compensation"
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
                            "body": "Engineering filaments like polycarbonate, nylon, and TPU pull moisture from the air fast — and wet filament means stringing, popping, weak layers, and rough surfaces. Dry the spool before printing, and ideally keep it dry while printing (the whole idea behind boxes like BTT's ViViD). Rough starting points: ~80°C for PC, ~70°C for nylon, ~50°C for TPU, several hours each — but always check your spool's label, and when in doubt, dry longer. A great standalone option: the Sovol SH03, a four-spool dryer that heats to 85°C and can run up to 24 hours, with separate chambers so you can dry and store at once. I run two of them and they work great.",
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
                            "heading": "Calibrate Your Filament",
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
                                "Has anyone tried multi-color mixing on their Prusa MK4?",
                                "How does this compare to Bambu's AMS color mixing approach?",
                                "It's open source — could we extend or customize it for our needs?"
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
