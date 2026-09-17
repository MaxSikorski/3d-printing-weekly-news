// config.js — the ONLY branding file for this site. Per-site: never copied to the sister site.
// Every engine file (index.html, week.html, script.js, presenter.js, styles.css) is identical across
// sites and reads its words, links and colors from here. Edit this, never the engine.
window.SITE_CONFIG = {
    siteName: "3D Printing Meetup",
    weeklyName: "3D Printing Weekly",
    pageTitles: {
        index: "3D Printing Meetup — Weekly Presentations",
        week: "3D Printing Meetup — Presentation"
    },
    metaDescription: {
        index: "Weekly 3D printing news and discussion topics for our meetup group.",
        week: "Weekly 3D printing presentation."
    },
    heroTitleHtml: "3D Printing<br>Weekly",
    heroSubtitle: "News, tools, and discussion topics curated for our weekly meetup.",
    deckSubtitle: "Weekly 3D printing news and discussion",
    favicons: [
        { rel: "icon", type: "image/png", sizes: "32x32", href: "favicon-32.png" },
        { rel: "icon", type: "image/png", sizes: "192x192", href: "favicon-192.png" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "apple-touch-icon.png" }
    ],
    navLinks: [
        { label: "Recommendations", href: "recommendations.html" }
    ],
    extraScripts: ["recommendations.js"],
    hostName: "Max Sikorski",
    contactEmail: ["3dmax.ow6p08", "bumpmail.io"],
    mail: {
        workWithSubject: "3D Printing Weekly — Work With You (print farm / R&D / CAD)",
        workWithBody: "Hi Max,\n\nI'd like to talk about working together — print farm / R&D / manufacturing / CAD classes.\n\n",
        topicSubject: "3D Printing Weekly — interested in: {topic}",
        topicBody: "Hi Max,\n\nI was going through this week's 3D Printing Weekly and I'm interested in \"{topic}\".\n\n",
        generalSubject: "3D Printing Weekly — getting in touch",
        generalBody: "Hi Max,\n\nI came across 3D Printing Weekly and wanted to get in touch.\n\n"
    },
    connect: {
        blurbHtml: "3D Printing Weekly — print farm · R&amp;D &amp; manufacturing · CAD classes. Subscribe, say hi, or reach out about a project.",
        links: [
            { label: "YouTube", href: "https://www.youtube.com/@maxwellsikorski4926" },
            { label: "Meetup", href: "https://www.meetup.com/3d-printing-club/" },
            { label: "GitHub", href: "https://github.com/MaxSikorski" },
            { label: "Discord", href: "https://discord.gg/pnFyeAZJsk" },
            { label: "Buzz", href: "https://buzz.xyz/" },
            { label: "Schedule a Chat", href: "https://cal.com/maxsikorski" }
        ],
        workWithLabel: "Work With Us",
        qrHref: "https://www.youtube.com/@maxwellsikorski4926"
    },
    footer: {
        tagline: "3D print farm · R&amp;D &amp; manufacturing · CAD classes",
        links: [
            { label: "Recommendations", href: "recommendations.html" },
            { label: "YouTube", href: "https://www.youtube.com/@maxwellsikorski4926" },
            { label: "Meetup", href: "https://www.meetup.com/3d-printing-club/" },
            { label: "GitHub", href: "https://github.com/MaxSikorski" }
        ],
        workWithLabel: "Work With Us"
    },
    // Likes: LIVE on Nostr (2026-09-17). A like = a kind-7 reaction to this site's
    // per-topic anchor events on Max's Buzz relay; the site key publishes anchors via
    // ../tools/likes_admin.py. Relay URL is interim (custom domain planned) — this is
    // the ONLY place it lives. Demo the mock UI any time with ?likesDemo=1.
    likes: {
        adapter: "nostr",
        relay: "wss://buzz-production-7d9e.up.railway.app",
        sitePubkey: "0daf0fbd4c54dbeccb22e21feffbb8faeb1db0c8f72077135aa33e57cacde4ac",
        tagPrefix: "3dpw"
    },
    accents: {},
    halo: [],
    liveAccent: "#f7931a",
    archive: { openMonths: 2 }
};
