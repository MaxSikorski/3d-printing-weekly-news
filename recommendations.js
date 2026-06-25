/*
 * recommendations.js — MASTER AFFILIATE / RECOMMENDATIONS LIST
 * =============================================================
 * This is the SINGLE SOURCE OF TRUTH for product links. Edit ONLY this file.
 * It is loaded with a <script> tag (works on both file:// and GitHub Pages),
 * and feeds BOTH:
 *   1. the per-topic "Buy on Amazon" buttons in the presentations (week.html), and
 *   2. the searchable Recommendations page (recommendations.html).
 *
 * HOW TO USE
 * ----------
 * • To turn a product into a live affiliate link: paste your Amazon Associates URL
 *   into that product's "amazonUrl". (Until it's filled, no button shows — nothing breaks.)
 * • To add a product: copy an entry, give it a unique "id", set its "category"
 *   to one of the CATEGORIES below, and fill what you can.
 * • In a week's slide JSON, link a topic to a product with  "product": "<id>"
 *   (or several with  "products": ["id1","id2"]  ), or send people to the shop
 *   with  "shop": "Printers"  (a category name, or true for the whole page).
 *
 * AMAZON RULE: don't hard-code prices next to affiliate links (they go stale and
 * it violates the Operating Agreement). Put price talk in the weekly NEWS only,
 * or say "check current price". Leave prices OUT of the "note" field here.
 *
 * CATEGORIES (exact strings): "Printers", "Filament & Materials", "Accessories",
 *   "Tools", "Electronics & Upgrades"
 */

window.AFFILIATE_DISCLOSURE = "As an Amazon Associate, we, as the meetup, earn from qualifying purchases.";

window.PRODUCTS = [

    /* ---------------- Printers ---------------- */
    { id: "snapmaker-u1",        name: "Snapmaker U1",                 brand: "Snapmaker", category: "Printers", amazonUrl: "https://amzn.to/44gmdk9", brandUrl: "https://us.snapmaker.com/products/snapmaker-u1-3d-printer", code: "", note: "4-toolhead color changer (covered W25)." },
    { id: "sovol-m1d",           name: "Sovol M1D",                    brand: "Sovol",     category: "Printers", amazonUrl: "", brandUrl: "https://www.sovol3d.com/pages/sovol-m1d-landing-page", code: "", note: "DualX IDEX tool-changer (covered W24)." },
    { id: "sovol-sv08-max",      name: "Sovol SV08 (Max)",             brand: "Sovol",     category: "Printers", amazonUrl: "https://amzn.to/4vP5j8p", brandUrl: "https://www.sovol3d.com/", code: "", note: "500mm CoreXY (Voron-based)." },
    { id: "sovol-sv08",          name: "Sovol SV08",                   brand: "Sovol",     category: "Printers", amazonUrl: "https://amzn.to/4vpze6G", brandUrl: "https://www.sovol3d.com/", code: "", note: "Budget CoreXY (Prime Day pick, W26)." },
    { id: "sovol-sv06-plus",     name: "Sovol SV06 Plus",              brand: "Sovol",     category: "Printers", amazonUrl: "https://amzn.to/4xTZzLW", brandUrl: "https://www.sovol3d.com/", code: "", note: "Larger bed-slinger." },
    { id: "creality-k2",         name: "Creality K2 Plus",             brand: "Creality",  category: "Printers", amazonUrl: "https://amzn.to/4f7kHWz", brandUrl: "https://www.creality.com/", code: "", note: "CoreXY (Prime Day pick, W26)." },
    { id: "prusa-mk4s",          name: "Prusa MK4S",                   brand: "Prusa",     category: "Printers", amazonUrl: "https://amzn.to/44sINWz", brandUrl: "https://www.prusa3d.com/", code: "", note: "Workhorse bed-slinger (kit available on Amazon)." },
    { id: "qidi-plus4",          name: "Qidi Plus 4",                  brand: "Qidi",      category: "Printers", amazonUrl: "https://amzn.to/3SkLdUC", brandUrl: "https://qidi3d.com/", code: "", note: "High-temp enclosed CoreXY." },
    { id: "qidi-q2",             name: "Qidi Q2",                      brand: "Qidi",      category: "Printers", amazonUrl: "https://amzn.to/4vpyEG2", brandUrl: "https://qidi3d.com/", code: "", note: "Enclosed speed machine." },
    { id: "qidi-max-4",          name: "Qidi Max 4",                   brand: "Qidi",      category: "Printers", amazonUrl: "https://amzn.to/4g714zW", brandUrl: "https://qidi3d.com/", code: "", note: "Large format High-temp enclosed machine." },

    /* ---------------- Filament & Materials ---------------- */
    { id: "pla",                     name: "PLA",                           brand: "",          category: "Filament & Materials", amazonUrl: "https://amzn.to/4oLk2y6", brandUrl: "", code: "", note: "" },
    { id: "petg",                     name: "PETG",                           brand: "",          category: "Filament & Materials", amazonUrl: "https://amzn.to/4anR7uh", brandUrl: "", code: "", note: "" },
    { id: "pctg",                     name: "PCTG",                           brand: "",          category: "Filament & Materials", amazonUrl: "https://amzn.to/3Suhpou", brandUrl: "", code: "", note: "" },
    { id: "tpu",                     name: "TPU",                           brand: "",          category: "Filament & Materials", amazonUrl: "https://amzn.to/44sLpnl", brandUrl: "", code: "", note: "" },
    { id: "abs",                     name: "ABS",                           brand: "",          category: "Filament & Materials", amazonUrl: "https://amzn.to/4f4zIt6", brandUrl: "", code: "", note: "" },
    { id: "asa",                     name: "ASA",                           brand: "",          category: "Filament & Materials", amazonUrl: "https://amzn.to/4eGoIRo", brandUrl: "", code: "", note: "" },
    { id: "nylon",                     name: "Nylon",                           brand: "",          category: "Filament & Materials", amazonUrl: "https://amzn.to/3QqACa6", brandUrl: "", code: "", note: "" },
    { id: "pc",                     name: "PC",                           brand: "",          category: "Filament & Materials", amazonUrl: "https://amzn.to/3Sx8iTY", brandUrl: "", code: "", note: "" },
    { id: "pps",                     name: "PPS",                           brand: "",          category: "Filament & Materials", amazonUrl: "https://amzn.to/4eLiYpA", brandUrl: "", code: "", note: "" },
    { id: "ppa",                     name: "PPA",                           brand: "",          category: "Filament & Materials", amazonUrl: "https://amzn.to/4oOI6jD", brandUrl: "", code: "", note: "" },
    { id: "bambu-pla-pure",          name: "Bambu Lab PLA Pure",            brand: "Bambu Lab", category: "Filament & Materials", amazonUrl: "https://amzn.to/43Sa0St", brandUrl: "https://us.store.bambulab.com/collections/bambu-lab-3d-printer-filament", code: "", note: "Food-/toy-safe, low-VOC PLA (covered W26)." },
    { id: "prusament-pla-highspeed", name: "Prusament PLA High-Speed",      brand: "Prusa",     category: "Filament & Materials", amazonUrl: "https://amzn.to/4oT6y3I", brandUrl: "https://www.prusa3d.com/", code: "", note: "Up to 40% faster PLA (covered W26)." },
    { id: "prusament-pc",            name: "Prusament PC Orange",           brand: "Prusa",     category: "Filament & Materials", amazonUrl: "https://amzn.to/4w9oRDW", brandUrl: "https://blog.prusa3d.com/prusament-pc-space-grade-black_121877/", code: "", note: "ESD-safe, low-outgassing PC (covered W24)." },
    { id: "ecogenesis-pha",           name: "Ecogenesis PHA",               brand: "Ecogenesis", category: "Filament & Materials", amazonUrl: "https://amzn.to/3SroEO1", brandUrl: "https://polarfilament.com/products/biodegradable-gray-pha-1kg-1-75mm?_pos=3&_sid=5489efdb9&_ss=r", code: "", note: "Plant-based PHA filament (covered W22)." },

    /* ---------------- Accessories (dryers, AMS, enclosures) ---------------- */
    { id: "sovol-sh03",     name: "Sovol SH03 Filament Dryer", brand: "Sovol",      category: "Accessories", amazonUrl: "https://amzn.to/4w4U8b5", brandUrl: "https://www.sovol3d.com/products/sovol-sh03-filament-dryer", code: "", note: "4-spool dryer, up to 85°C/24h. Max runs two (covered W24/W25)." },
    { id: "bondtech-indx",  name: "Bondtech INDX (CORE One)",  brand: "Bondtech",   category: "Accessories", amazonUrl: "https://amzn.to/4uWBykA", brandUrl: "https://www.bondtech.se/indx-by-bondtech/", code: "", note: "8-tool purgeless changer for Prusa CORE One (covered W25/W26) — likely brand-store only." },

    /* ---------------- Tools ---------------- */
    { id: "flush-cutters",      name: "Flush / Side Cutters",          brand: "", category: "Tools", amazonUrl: "https://amzn.to/4xJRf13", brandUrl: "", code: "", note: "Clean filament snips + flush support removal." },
    { id: "deburring-tool",     name: "Deburring Tool (+ blades)",     brand: "", category: "Tools", amazonUrl: "https://amzn.to/3Sp0nIt", brandUrl: "", code: "", note: "Swivel head; shaves sharp edge brims." },
    { id: "digital-calipers",   name: "Digital Calipers",              brand: "", category: "Tools", amazonUrl: "https://amzn.to/4eE0IhK", brandUrl: "", code: "", note: "0.1mm accuracy, mm/inch; dial in tolerances." },
    { id: "nozzle-clean-kit",   name: "Nozzle Cleaning Needle Kit",    brand: "", category: "Tools", amazonUrl: "https://amzn.to/44u6Fcj", brandUrl: "", code: "", note: "Clear partial clogs on 0.4mm nozzles." },
    { id: "scraper-set",        name: "Plastic + Steel Scraper Set",   brand: "", category: "Tools", amazonUrl: "https://amzn.to/43YJVBb", brandUrl: "", code: "", note: "Lift prints without gouging the plate." },
    { id: "craft-knife",        name: "Craft / Hobby Knife (+ blades)", brand: "", category: "Tools", amazonUrl: "https://amzn.to/4ancImv", brandUrl: "", code: "", note: "Trim wisps and layer artifacts." },
    { id: "precision-tweezers", name: "Precision Tweezers Set",        brand: "", category: "Tools", amazonUrl: "https://amzn.to/43Ww8es", brandUrl: "", code: "", note: "Straight/curved/flat for supports + fragile parts." },
    { id: "ptfe-tube-cutter",   name: "PTFE Tube Cutter",              brand: "", category: "Tools", amazonUrl: "https://amzn.to/3Sk0d5b", brandUrl: "", code: "", note: "Square 90° cuts on Bowden/guide tube." },
    { id: "filament-hygrometer", name: "Mini Digital Hygrometer",      brand: "", category: "Tools", amazonUrl: "https://amzn.to/3QKGET1", brandUrl: "", code: "", note: "Track dry-box / ambient humidity." },

    /* ---------------- Electronics & Upgrades ---------------- */
    { id: "adxl345",        name: "ADXL345 Accelerometer",      brand: "", category: "Electronics & Upgrades", amazonUrl: "https://amzn.to/4eRijDc", brandUrl: "", code: "", note: "Cheap input-shaping sensor for Klipper (quick tip, W26)." },
    { id: "ldo-unicorn",    name: "LDO 'Unicorn' Chasing Kit",  brand: "LDO Motors", category: "Electronics & Upgrades", amazonUrl: "", brandUrl: "https://docs.ldomotors.com/en/voron/unicorn", code: "", note: "Resonance kit, accelerometer-in-nozzle (covered W26) — likely distributor-only." },
    { id: "ldo-stealthchanger", name: "LDO Stealthchanger Kit", brand: "LDO Motors", category: "Electronics & Upgrades", amazonUrl: "", brandUrl: "https://ldomotion.com/products/stealth-changer", code: "", note: "Voron toolchanger kit — likely distributor-only." }

];
