/*  Icons
    ---------------------------------------------------------------------
    UI icons are stroked and inherit currentColor, so they follow the five
    colour palette everywhere. Platform marks are filled with their own
    brand colours — a channel is identity, not chrome, and a monochrome
    Instagram glyph would cost recognition for no design gain.           */

const UI_PATHS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-5.5h5V20"/>',
    approvals: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 12.2l2.6 2.6L16.2 9"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
    brain: '<rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M12 4v16M7.5 9h1.5M7.5 13h1.5M15 9h1.5M15 13h1.5"/>',
    analytics: '<path d="M4 20V10M9.5 20V4M15 20v-7M20.5 20v-11"/>',
    campaigns: '<path d="M21 4 3 11l7 3 3 7 8-17Z"/><path d="m10 14 4.5-4.5"/>',
    conversations: '<path d="M20.5 12.5c0 4-3.8 7-8.5 7a10 10 0 0 1-2.7-.36L4 21l1.2-3.6A6.6 6.6 0 0 1 3.5 12.5c0-4 3.8-7 8.5-7s8.5 3 8.5 7Z"/>',
    assets: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.2l2 2.4h7.8a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>',
    connections: '<path d="M10 13.5a4 4 0 0 0 5.7.3l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.6 1.6"/><path d="M14 10.5a4 4 0 0 0-5.7-.3l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.6-1.6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.2a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.1 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.2 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5 8.9L4.9 8a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',

    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    bell: '<path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5Z"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
    chat: '<path d="M20.5 11.5a7.5 7.5 0 0 1-8 7.5 8.6 8.6 0 0 1-2.6-.4L5 21l1.4-3.6A7.3 7.3 0 0 1 4.5 12a7.5 7.5 0 0 1 8-7.5 7.5 7.5 0 0 1 8 7Z"/>',
    sparkle: '<path d="M12 3.5 13.9 9l5.6 2-5.6 2-1.9 5.5L10.1 13l-5.6-2 5.6-2Z"/><path d="M18.5 4v3M20 5.5h-3"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',

    down: '<path d="m6 9.5 6 6 6-6"/>',
    up: '<path d="m6 14.5 6-6 6 6"/>',
    right: '<path d="m9.5 6 6 6-6 6"/>',
    left: '<path d="m14.5 6-6 6 6 6"/>',
    arrowRight: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
    arrowUp: '<path d="M12 19.5v-15M6 11l6-6 6 6"/>',
    arrowDown: '<path d="M12 4.5v15M6 13l6 6 6-6"/>',
    arrowUpRight: '<path d="M7 17 17 7M8.5 7H17v8.5"/>',

    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    minus: '<path d="M5 12h14"/>',

    alert: '<path d="M12 3.5 22 20H2Z"/><path d="M12 10v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11.5v5M12 8h.01"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
    edit: '<path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5Z"/><path d="m14.5 6.5 3.5 3.5"/>',
    trash: '<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M7 6.5 8 20h8l1-13.5"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 5.5h-9a2.5 2.5 0 0 0-2.5 2.5v9"/>',
    dots: '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
    filter: '<path d="M3.5 6h17l-6.5 7.5V20l-4-2v-4.5Z"/>',
    sort: '<path d="M7 4.5v15M7 4.5 4 8M7 4.5 10 8M17 19.5v-15M17 19.5 14 16M17 19.5 20 16"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    list: '<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01"/>',
    columns: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15M15 4.5v15"/>',
    upload: '<path d="M12 16V4.5M7.5 9 12 4.5 16.5 9"/><path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>',
    download: '<path d="M12 4.5V16M7.5 11.5 12 16l4.5-4.5"/><path d="M4.5 19.5h15"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/>',
    external: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v4.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4.5"/>',
    users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5"/><path d="M16.5 5.5a3.4 3.4 0 0 1 0 6.6M18 14.6c2.2.5 3.5 2.2 3.5 5.4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c0-4 3.4-6 7.5-6s7.5 2 7.5 6"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4.5 17 4.8-4.4 4 3.4 2.7-2.3 4 3.6"/>',
    video: '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5Z"/>',
    file: '<path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9Z"/><path d="M13.5 3.5V9H19M8.5 13h7M8.5 16.5h5"/>',
    mail: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="m3 7 9 6 9-6"/>',
    shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6Z"/><path d="m9 12 2 2 4-4"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19"/>',
    bolt: '<path d="M13.5 3 5 13.5h6L10.5 21 19 10.5h-6Z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    trend: '<path d="M3.5 16.5 9 11l4 4 7.5-7.5"/><path d="M15 7.5h5.5V13"/>',
    menu: '<path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/>',
    share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4"/>',
    pin: '<path d="M9 3.5h6l-.8 6 3.3 3v1.5H6.5V12.5l3.3-3Z"/><path d="M12 14v6.5"/>',
    expand: '<path d="M9 3.5H3.5V9M15 20.5h5.5V15M3.5 3.5 10 10M20.5 20.5 14 14"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
    send: '<path d="M4 12 20.5 4.5 13 21l-2-7Z"/><path d="m11 14 4-4"/>',
    wand: '<path d="M4 20 15 9M13 5.5 14 3l1 2.5L17.5 6.5 15 7.5 14 10l-1-2.5L10.5 6.5Z"/><path d="M19.5 12.5 20 11l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5Z"/>',
    bulb: '<path d="M9 17.5a5.5 5.5 0 1 1 6 0V19a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 19Z"/><path d="M9.5 21h5"/>',
    book: '<path d="M4.5 4.5h11a3 3 0 0 1 3 3v12h-11a3 3 0 0 0-3 3Z"/><path d="M18.5 19.5h1"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5a13 13 0 0 1 0 17 13 13 0 0 1 0-17Z"/>',
    lock: '<rect x="4.5" y="10" width="15" height="10" rx="2.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
    logout: '<path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5"/><path d="M15 16.5 19.5 12 15 7.5M19.5 12h-11"/>',
    star: '<path d="m12 3.5 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.9l6-.8Z"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-9.5A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.9C19.5 15.4 12 20 12 20Z"/>',
    money: '<path d="M12 3.5v17"/><path d="M16.5 7.5c0-1.7-2-2.5-4.5-2.5S7.5 5.8 7.5 8s2 2.7 4.5 3.2 4.5 1.1 4.5 3.3-2 2.5-4.5 2.5-4.5-.8-4.5-2.5"/>',
    activity: '<path d="M3.5 12h4l2.5-7 4 14 2.5-7h4"/>',
    layout: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M9.5 10v9.5"/>',
    inbox: '<path d="M3.5 12.5h4l1.5 3h6l1.5-3h4"/><path d="M5.6 5.5h12.8l2.1 7v6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-6Z"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-1 2-2s-.7-1.6-.7-2.4c0-.7.6-1.3 1.4-1.3h1.6a4.2 4.2 0 0 0 4.2-4.3c0-3.9-3.8-7-8.5-7Z"/><circle cx="7.5" cy="11" r="1.1"/><circle cx="10" cy="7" r="1.1"/><circle cx="15" cy="7.5" r="1.1"/>',
    type: '<path d="M4.5 7V4.5h15V7M12 4.5v15M8.5 19.5h7"/>',
    flag: '<path d="M5.5 21V4h11l-1.5 3.5L16.5 11h-11"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.7M12 16.5h.01"/>',
    db: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
    key: '<circle cx="8" cy="12" r="4.5"/><path d="M12.5 12h8M18 12v3M15.5 12v2"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    archive: '<rect x="3.5" y="4.5" width="17" height="4" rx="1.5"/><path d="M5.5 8.5v10a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-10M10 12.5h4"/>',
    repeat: '<path d="M4.5 9.5A4 4 0 0 1 8.5 5.5h11M16 2.5l3.5 3-3.5 3"/><path d="M19.5 14.5a4 4 0 0 1-4 4h-11M8 21.5l-3.5-3 3.5-3"/>',
    play: '<path d="M7 4.5 19.5 12 7 19.5Z"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    location: '<path d="M12 21c4-4.4 6.5-7.6 6.5-11a6.5 6.5 0 1 0-13 0c0 3.4 2.5 6.6 6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>',
};

/*  Inline fallbacks for platforms without a supplied logo file. These are
    simplified marks, deliberately kept only where no official asset exists. */

const BRAND = {
    metaads: { d: '<path d="M3 14.4c0-3.6 1.9-6.9 4.3-6.9 1.4 0 2.4.85 3.6 2.7l1.5 2.5c.4.65.7 1.1 1 1.5-.5.75-.9 1.15-1.5 1.15-.7 0-1-.45-1.7-1.65l-1.4-2.4c-.5-.85-.9-1.25-1.4-1.25-.8 0-1.6 1.2-1.6 3.35 0 1.55.5 2.5 1.4 2.5.5 0 .9-.2 1.5-.85l1 1.3c-.9 1-1.7 1.45-2.7 1.45C4.7 18.8 3 16.9 3 14.4Z" fill="#0081FB"/><path d="M11.1 10.2c1.2-1.85 2.5-2.7 4-2.7 2.6 0 4.4 3.15 4.4 6.75 0 2.6-1.6 4.55-3.7 4.55-1 0-1.85-.4-2.8-1.6.55-.65.95-1.1 1.45-1.75.65.8 1 1.05 1.5 1.05.9 0 1.5-.9 1.5-2.4 0-2.25-.8-3.5-1.75-3.5-.55 0-1.1.45-1.8 1.5Z" fill="#0064E0"/>' },
    googleanalytics: { d: '<rect x="15.5" y="3" width="5.5" height="18" rx="2.75" fill="#F9AB00"/><rect x="9.2" y="9" width="5.5" height="12" rx="2.75" fill="#E37400"/><circle cx="5.6" cy="18" r="3" fill="#E37400"/>' },
    searchconsole: { d: '<circle cx="12" cy="12" r="10" fill="#458CF5"/><circle cx="10.6" cy="10.6" r="3.6" fill="none" stroke="#fff" stroke-width="1.8"/><path d="m13.4 13.4 4 4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>' },
    googlebusiness: { d: '<path d="M4 9.5 5.6 4.6h12.8L20 9.5Z" fill="#4285F4"/><path d="M4 9.5h4v1.2a2 2 0 0 1-4 0Z" fill="#34A853"/><path d="M8 9.5h4v1.2a2 2 0 0 1-4 0Z" fill="#FBBC04"/><path d="M12 9.5h4v1.2a2 2 0 0 1-4 0Z" fill="#EA4335"/><path d="M16 9.5h4v1.2a2 2 0 0 1-4 0Z" fill="#4285F4"/><path d="M5.2 12.4v6.9h13.6v-6.9" fill="none" stroke="#4285F4" stroke-width="1.6"/>' },
    email: { d: '<rect x="2" y="4.5" width="20" height="15" rx="3" fill="#575756"/><path d="m3.5 7 8.5 6 8.5-6" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>' },
    website: { d: '<circle cx="12" cy="12" r="9.4" fill="#575756"/><path d="M2.6 12h18.8M12 2.6a14 14 0 0 1 0 18.8 14 14 0 0 1 0-18.8Z" fill="none" stroke="#fff" stroke-width="1.5"/>' },
};

/** UI icon — stroked, inherits currentColor.
 *  The `.ic` class carries a default size; any context rule such as
 *  `.btn svg` is more specific and still wins. */
function icon(name, cls = '') {
    const d = UI_PATHS[name];
    if (!d) return '';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
        stroke-linecap="round" stroke-linejoin="round" class="ic ${cls}" aria-hidden="true">${d}</svg>`;
}

/*  Supplied logo files in /icons. These are the official marks, so they
    take priority over anything drawn by hand. Everything not in this map
    still falls back to the inline SVG set below.                        */

const BRAND_PNG = {
    instagram: 'icons8-instagram-logo-100.png',
    facebook: 'icons8-facebook-logo-100.png',
    linkedin: 'icons8-linkedin-100.png',
    tiktok: 'icons8-tiktok-logo-100.png',
    whatsapp: 'icons8-whatsapp-logo-100.png',
    x: 'icons8-x-100.png',
    youtube: 'icons8-youtube-logo-100.png',
    telegram: 'icons8-telegram-100.png',
    googleads: 'icons8-google-ads-100.png',
    shopify: 'icons8-shopify-100.png',
};

/*  Platform mark. Decorative in every placement — the channel name is
    always written next to it — so it is hidden from assistive tech
    rather than announced twice.                                         */
function brandIcon(name, cls = '') {
    const png = BRAND_PNG[name];
    if (png) {
        return `<img class="bic ${cls}" src="icons/${png}" alt="" aria-hidden="true" decoding="async">`;
    }

    const b = BRAND[name];
    if (!b) return icon('globe', cls);
    return `<svg viewBox="0 0 24 24" class="bic ${cls}" aria-hidden="true">${b.d}</svg>`;
}

const PLATFORM_LABEL = {
    instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', tiktok: 'TikTok',
    youtube: 'YouTube', x: 'X', whatsapp: 'WhatsApp', telegram: 'Telegram', googleads: 'Google Ads',
    metaads: 'Meta Ads', shopify: 'Shopify', googleanalytics: 'Google Analytics',
    searchconsole: 'Search Console', googlebusiness: 'Google Business', email: 'Email',
    website: 'Website',
};
