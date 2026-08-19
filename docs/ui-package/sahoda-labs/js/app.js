/*  Application shell — sidebar, header, mobile navigation, command
    palette, notifications, theme, and the router that ties them together. */

/*  Brand lockup. The dark file is the black wordmark for light surfaces;
    the white file is for dark ones — so the name reads by theme, not by
    the ink colour of the file.                                          */
const LOGO = {
    light: 'logo/dark%20logo.png',        // black lockup, for light surfaces
    dark: 'logo/white%20logo.png',        // white lockup, for dark surfaces
    markLight: 'logo/favicondark.png',    // black mark alone
    markDark: 'logo/favicon%20white.png', // white mark alone

    get isDark() { return document.documentElement.dataset.theme === 'dark'; },
    src() { return this.isDark ? this.dark : this.light; },
    mark() { return this.isDark ? this.markDark : this.markLight; },
};

const NAV = [
    { k: 'home', label: 'Home', icon: 'home' },
    { k: 'approvals', label: 'Approvals', icon: 'approvals', badge: () => DB.approvals.filter((a) => a.status === 'pending').length },
    { k: 'planner', label: 'Planner', icon: 'calendar' },
    { k: 'brand', label: 'Brand Brain', icon: 'brain' },
    { k: 'analytics', label: 'Analytics', icon: 'analytics' },
    { k: 'campaigns', label: 'Campaigns', icon: 'campaigns' },
    { k: 'conversations', label: 'Conversations', icon: 'conversations', badge: () => DB.conversations.reduce((n, c) => n + c.unread, 0) },
    { k: 'assets', label: 'Assets', icon: 'assets' },
    { k: 'connections', label: 'Connections', icon: 'connections' },
];

const CREATE_ITEMS = [
    { k: 'post', label: 'Post', icon: 'image', desc: 'Publish to one or more channels' },
    { k: 'story', label: 'Story', icon: 'video', desc: '24-hour vertical content' },
    { k: 'campaign', label: 'Campaign', icon: 'campaigns', desc: 'Multi-channel, budgeted' },
    { k: 'ad', label: 'Ad', icon: 'target', desc: 'Paid placement' },
    { k: 'broadcast', label: 'Broadcast', icon: 'send', desc: 'WhatsApp or email blast' },
    { k: 'article', label: 'Article', icon: 'file', desc: 'Long-form for LinkedIn' },
    { k: 'email', label: 'Email', icon: 'mail', desc: 'Newsletter or sequence' },
    { k: 'report', label: 'Report', icon: 'analytics', desc: 'Performance summary' },
    { k: 'automation', label: 'Automation', icon: 'repeat', desc: 'Trigger-based workflow' },
];

const App = {
    route: 'home',
    params: [],
    booted: false,
    trail: [],        // where the user came from, for context-preserving back

    start() {
        this.applyTheme(localStorage.getItem('sahoda-theme') || 'light');
        this.renderShell();
        window.addEventListener('hashchange', () => this.navigate());
        this.navigate();
        Keys.init();
        Chat.init();
    },

    /* ------------------------------------------------------------ theme */
    applyTheme(mode) {
        document.documentElement.dataset.theme = mode;
        localStorage.setItem('sahoda-theme', mode);
    },

    toggleTheme() {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme(next);
        this.renderShell();
        this.render();
        toast(`Switched to ${next} theme`, { icon: next === 'dark' ? 'moon' : 'sun' });
    },

    /* ----------------------------------------------------------- router */
    navigate() {
        const raw = (location.hash || '#/home').replace(/^#\/?/, '');
        const parts = raw.split('/').filter(Boolean);
        const nextRoute = PAGES[parts[0]] ? parts[0] : 'home';
        const here = this.route + (this.params.length ? '/' + this.params.join('/') : '');

        // Record the trail so a detail view can return to the list it came
        // from rather than dumping the user on Home.
        if (this.booted && here !== raw) {
            this.trail.push(here);
            if (this.trail.length > 20) this.trail.shift();
        }

        this.route = nextRoute;
        this.params = parts.slice(1);

        Overlay.closeAll();
        closePopovers();
        Keys.clearScope();
        this.syncNav();
        this.render({ withLoading: true });
        $('.page')?.scrollTo(0, 0);
    },

    go(path) {
        location.hash = '#/' + path.replace(/^\/?/, '');
    },

    /** Back that preserves context: the previous route if we have one. */
    goBack(fallback = 'home') {
        const prev = this.trail.pop();
        // Don't bounce straight back into the page we're already on.
        const target = prev && prev !== this.route + '/' + this.params.join('/') ? prev : fallback;
        this.go(target);
    },

    /** Breadcrumb-style back link that names where it returns to. */
    backLink(fallbackLabel, fallbackRoute) {
        const prev = this.trail[this.trail.length - 1];
        const label = prev ? this.labelFor(prev) : fallbackLabel;
        return `<button class="link" data-back="${esc(fallbackRoute || 'home')}">${icon('left')}${esc(label)}</button>`;
    },

    labelFor(path) {
        const [head, ...rest] = path.split('/');
        const nav = NAV.find((n) => n.k === head);
        const base = nav ? nav.label : head === 'settings' ? 'Settings' : head;
        if (!rest.length) return base;
        if (head === 'campaigns' && rest[0] === 'new') return 'New campaign';
        const c = DB.campaigns.find((x) => x.id === rest[0]);
        return c ? c.name : base;
    },

    /* ----------------------------------------------------------- render */
    render({ withLoading = false } = {}) {
        const host = $('#page');
        if (!host) return;
        const page = PAGES[this.route];

        // Conversations takes over the full viewport height; undo that for
        // every other route rather than leaking the override forward.
        host.style.height = '';
        host.parentElement.style.overflow = '';

        const paint = (animate) => {
            host.innerHTML = page.render(this.params);
            // Only the content area transitions — the shell stays put, so
            // navigation reads as continuous rather than as a page load.
            if (animate && !reducedMotion()) {
                host.classList.remove('page-in');
                void host.offsetWidth;
                host.classList.add('page-in');
            }
            page.mount?.(host, this.params);
            bindContextualAI(host, this.route);
            host.querySelectorAll('[data-back]').forEach((b) => {
                b.onclick = () => this.goBack(b.dataset.back);
            });
        };

        // A brief skeleton pass, so navigation never flashes an empty box.
        if (withLoading && page.skeleton) {
            host.innerHTML = page.skeleton();
            setTimeout(() => paint(true), this.booted ? 90 : 220);
        } else {
            paint(true);
        }
        this.booted = true;
    },

    /** Re-render the current page in place, without the entry animation —
     *  a state change is not a navigation and shouldn't look like one. */
    refresh() {
        const host = $('#page');
        const page = PAGES[this.route];
        host.classList.remove('page-in');
        host.innerHTML = page.render(this.params);
        page.mount?.(host, this.params);
        bindContextualAI(host, this.route);
        host.querySelectorAll('[data-back]').forEach((b) => {
            b.onclick = () => this.goBack(b.dataset.back);
        });
        this.syncNav();
    },

    syncNav() {
        Chat.paintFab?.();
        $$('[data-nav]').forEach((el) => {
            const on = el.dataset.nav === this.route;
            el.classList.toggle('is-on', on);
            // Screen readers get the same "you are here" the accent gives.
            on ? el.setAttribute('aria-current', 'page') : el.removeAttribute('aria-current');
        });
        $$('[data-navcount]').forEach((el) => {
            const item = NAV.find((n) => n.k === el.dataset.navcount);
            const n = item?.badge?.() || 0;
            el.textContent = n;
            el.classList.toggle('hide', !n);
        });
    },

    /* ------------------------------------------------------------ shell */
    renderShell() {
        const ws = DB.workspace;
        const c = DB.credits;
        const pct = Math.round((c.left / c.total) * 100);

        $('#shell').innerHTML = `
        <aside class="side" aria-label="Sidebar">
            <div class="side__brand">
                <a class="brandmark" href="#/home" aria-label="Sahoda Labs — home">
                    <img src="${LOGO.src()}" alt="Sahoda Labs">
                </a>
            </div>

            <nav class="side__nav" aria-label="Main">
                <button class="wsbtn" id="ws-btn" style="margin-bottom:8px">
                    <span class="av av--accent">${ws.initial}</span>
                    <span class="grow" style="min-width:0">
                        <span class="wsbtn__t truncate" style="display:block">${ws.name}</span>
                        <span class="wsbtn__s truncate" style="display:block">${ws.location}</span>
                    </span>
                    ${icon('down')}
                </button>

                ${NAV.map((n) => `
                    <a class="nav__i" data-nav="${n.k}" href="#/${n.k}">
                        ${icon(n.icon)}<span>${n.label}</span>
                        ${n.badge ? `<em class="nav__n ${n.badge() ? '' : 'hide'}" data-navcount="${n.k}" style="font-style:normal">${n.badge()}</em>` : ''}
                    </a>`).join('')}

                <div class="side__sec">Workspace</div>
                <a class="nav__i" data-nav="settings" href="#/settings">${icon('settings')}<span>Settings</span></a>
            </nav>

            <div class="side__foot">
                <div class="credits">
                    <div class="row between">
                        <span class="credits__n">${c.left}</span>
                        <span class="credits__of">of ${c.total}</span>
                    </div>
                    <div class="bar mt2"><div class="bar__f" style="width:${pct}%"></div></div>
                    <div class="row between mt2">
                        <span class="t-11 t-3">Credits left</span>
                        <a class="link t-11" href="#/settings/credits">Usage</a>
                    </div>
                </div>
                <button class="wsbtn mt2" id="user-btn">
                    <span class="av">${DB.user.initials}</span>
                    <span class="grow" style="min-width:0">
                        <span class="wsbtn__t truncate" style="display:block">${DB.user.name}</span>
                        <span class="wsbtn__s truncate" style="display:block">${DB.user.role}</span>
                    </span>
                    ${icon('down')}
                </button>
            </div>
        </aside>

        <div class="main">
            <!-- desktop header -->
            <header class="hdr">
                <button class="hdr__ws" id="ws-btn-2">
                    <span class="av av--accent av--lg">${ws.initial}</span>
                    <span style="text-align:left">
                        <span class="t-13 w-600" style="display:block">${ws.name}</span>
                        <span class="t-11 t-3" style="display:block">${ws.location}</span>
                    </span>
                    ${icon('down')}
                </button>

                <button class="hdr__search" id="search-btn">
                    ${icon('search')}<span class="grow" style="text-align:left">Search anything…</span>
                    <span class="kbd">⌘K</span>
                </button>

                <div class="row g1">
                    <button class="iconbtn tip" data-tip="Notifications" id="notif-btn">
                        ${icon('bell')}<span class="iconbtn__dot">${DB.notifications.filter((n) => n.unread).length}</span>
                    </button>
                    <button class="iconbtn tip" data-tip="Conversations" onclick="App.go('conversations')">${icon('chat')}</button>
                    <button class="iconbtn tip" data-tip="Ask AI" id="ai-btn" aria-label="Ask AI" style="color:var(--orange)">${icon('sparkle')}</button>
                    <button class="iconbtn tip" data-tip="Theme" id="theme-btn">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
                    <button class="iconbtn" id="user-btn-2" style="width:auto;padding:0 2px">
                        <span class="av">${DB.user.initials}</span>
                    </button>
                </div>
            </header>

            <!-- mobile header -->
            <header class="mhdr">
                <button class="iconbtn" id="m-menu">${icon('menu')}</button>
                <span class="av av--accent av--lg">${ws.initial}</span>
                <div class="grow" style="min-width:0">
                    <div class="t-13 w-600 truncate">${ws.name}</div>
                    <div class="t-11 t-3 truncate">${DB.user.short} · Workspace</div>
                </div>
                <button class="iconbtn" id="m-search">${icon('search')}</button>
                <button class="iconbtn" id="m-notif">
                    ${icon('bell')}<span class="iconbtn__dot">${DB.notifications.filter((n) => n.unread).length}</span>
                </button>
            </header>

            <main class="page" id="main" tabindex="-1"><div id="page"></div></main>
        </div>

        <!-- mobile bottom navigation -->
        <nav class="mbar" aria-label="Main">
            <a class="mbar__i" data-nav="home" href="#/home">${icon('home')}<span>Home</span></a>
            <a class="mbar__i" data-nav="approvals" href="#/approvals">
                ${icon('approvals')}<span>Approvals</span>
                <em class="nav__n" data-navcount="approvals" style="font-style:normal">2</em>
            </a>
            <button class="mbar__fab" id="m-create" aria-label="Create">${icon('plus')}</button>
            <a class="mbar__i" data-nav="planner" href="#/planner">${icon('calendar')}<span>Planner</span></a>
            <button class="mbar__i" id="m-more">${icon('grid')}<span>More</span></button>
        </nav>`;

        this.bindShell();
        this.syncNav();
    },

    bindShell() {
        $('#theme-btn').onclick = () => this.toggleTheme();
        $('#search-btn').onclick = () => this.commandPalette();
        $('#m-search').onclick = () => this.commandPalette();
        $('#notif-btn').onclick = () => this.notifications();
        $('#m-notif').onclick = () => this.notifications();
        $('#ai-btn').onclick = () => this.askAI();
        $('#m-create').onclick = () => this.createMenu();
        $('#m-more').onclick = () => this.moreSheet();
        $('#m-menu').onclick = () => this.moreSheet();

        const wsMenu = (e) => menu(e.currentTarget, [
            { label: 'Switch workspace', heading: true },
            ...DB.workspaces.map((w) => ({
                label: w.name, icon: 'layout', active: w.name === DB.workspace.name,
                on: () => {
                    DB.workspace = w;
                    this.renderShell();
                    this.render();
                    toast(`Switched to ${w.name}`);
                },
            })),
            { sep: true },
            { label: 'Workspace settings', icon: 'settings', on: () => this.go('settings') },
        ], { align: 'left' });

        $('#ws-btn').onclick = wsMenu;
        $('#ws-btn-2').onclick = wsMenu;

        const userMenu = (e) => menu(e.currentTarget, [
            { label: 'Profile', icon: 'user', on: () => this.go('settings/profile') },
            { label: 'Team', icon: 'users', on: () => this.go('settings/team') },
            { label: 'Billing', icon: 'card', on: () => this.go('settings/billing') },
            { sep: true },
            { label: 'Sign out', icon: 'logout', on: () => toast('Signed out') },
        ]);

        $('#user-btn').onclick = userMenu;
        $('#user-btn-2').onclick = userMenu;
    },

    /* -------------------------------------------------- command palette */

    recent: JSON.parse(localStorage.getItem('sahoda-recent') || '[]'),

    remember(label) {
        this.recent = [label, ...this.recent.filter((r) => r !== label)].slice(0, 4);
        localStorage.setItem('sahoda-recent', JSON.stringify(this.recent));
    },

    commandPalette() {
        const nav = NAV.concat([{ k: 'settings', label: 'Settings', icon: 'settings' }])
            .map((n) => ({ group: 'Pages', label: n.label, icon: n.icon, on: () => this.go(n.k) }));

        const actions = [
            { group: 'Actions', label: 'Create post', icon: 'image', on: () => this.createFlow('post') },
            { group: 'Actions', label: 'Create campaign', icon: 'campaigns', on: () => this.go('campaigns/new') },
            { group: 'Actions', label: 'Create story', icon: 'video', on: () => this.createFlow('story') },
            { group: 'Actions', label: 'Create ad', icon: 'target', on: () => this.createFlow('ad') },
            { group: 'Actions', label: 'Ask AI', icon: 'sparkle', on: () => this.askAI() },
            { group: 'Actions', label: 'Keyboard shortcuts', icon: 'help', on: () => Keys.help() },
        ];

        const content = [
            ...DB.campaigns.map((c) => ({ group: 'Campaigns', label: c.name, icon: 'campaigns', on: () => this.go('campaigns/' + c.id) })),
            ...DB.approvals.filter((a) => a.status === 'pending')
                .map((a) => ({ group: 'Content', label: a.title, icon: 'image', on: () => this.go('approvals/' + a.id) })),
            ...DB.conversations.map((c) => ({ group: 'Customers', label: c.name, icon: 'user', on: () => this.go('conversations/' + c.id) })),
            ...DB.assets.map((a) => ({ group: 'Assets', label: a.name, icon: 'image', on: () => this.go('assets/' + encodeURIComponent(a.name)) })),
            ...DB.brand.knowledge.map((k) => ({ group: 'Brand documents', label: k.name, icon: 'file', on: () => this.go('brand/knowledge') })),
        ];

        const all = [...actions, ...nav, ...content];

        // With an empty query the palette is a launcher, not a search box:
        // what you used last, then what is worth doing now.
        const suggested = [
            DB.approvals.filter((a) => a.status === 'pending').length
                ? { group: 'Suggested', label: `Review ${DB.approvals.filter((a) => a.status === 'pending').length} pending approvals`, icon: 'approvals', on: () => this.go('approvals') }
                : null,
            DB.connections.some((c) => c.status === 'error')
                ? { group: 'Suggested', label: 'Fix a broken connection', icon: 'alert', on: () => this.go('connections') }
                : null,
            { group: 'Suggested', label: 'Create post', icon: 'image', on: () => this.createFlow('post') },
            { group: 'Suggested', label: 'Open planner', icon: 'calendar', on: () => this.go('planner') },
        ].filter(Boolean);

        const recentItems = this.recent
            .map((label) => all.find((i) => i.label === label))
            .filter(Boolean)
            .map((i) => ({ ...i, group: 'Recent' }));

        let query = '';
        let filtered = [...recentItems, ...suggested];
        let cursor = 0;

        const listHTML = (items) => {
            if (!items.length) {
                return `<div class="state" style="padding:30px 20px">
                    <div class="state__ic">${icon('search')}</div>
                    <div class="state__t">No results for “${esc(query)}”</div>
                    <div class="state__d">Try a shorter term, a page name, or an action like “create post”.</div></div>`;
            }
            let last = '';
            return items.map((it, i) => {
                const head = it.group !== last ? `<div class="pop__lbl">${it.group}</div>` : '';
                last = it.group;
                return `${head}<button class="cmdk__i ${i === cursor ? 'is-on' : ''}" data-i="${i}" role="option"
                        aria-selected="${i === cursor}">
                    ${icon(it.icon)}<span class="cmdk__t grow">${highlight(it.label, query)}</span>
                    ${i === cursor ? '<span class="kbd">↵</span>' : ''}</button>`;
            }).join('');
        };

        Overlay.open(`
            <div class="cmdk__in">
                ${icon('search')}
                <input id="cmdk-q" placeholder="Search pages, campaigns, customers, assets…"
                    autocomplete="off" role="combobox" aria-expanded="true" aria-controls="cmdk-list">
                <span class="kbd">ESC</span>
            </div>
            <div class="cmdk__list" id="cmdk-list" role="listbox">${listHTML(filtered)}</div>
            <div class="cmdk__foot">
                <span class="row g1"><span class="kbd">↑</span><span class="kbd">↓</span>navigate</span>
                <span class="row g1"><span class="kbd">↵</span>open</span>
                <span class="row g1"><span class="kbd">ESC</span>close</span>
            </div>`,
            {
                kind: 'cmdk',
                label: 'Search',
                onMount: (el) => {
                    el.className = 'cmdk';
                    const input = el.querySelector('#cmdk-q');
                    const list = el.querySelector('#cmdk-list');
                    input.focus();

                    const choose = (item) => {
                        if (!item) return;
                        this.remember(item.label);
                        Overlay.close();
                        item.on();
                    };

                    const paint = () => {
                        list.innerHTML = listHTML(filtered);
                        list.querySelectorAll('.cmdk__i').forEach((b) => {
                            b.onclick = () => choose(filtered[+b.dataset.i]);
                            b.onmousemove = () => {
                                const i = +b.dataset.i;
                                if (i === cursor) return;
                                cursor = i;
                                list.querySelectorAll('.cmdk__i').forEach((n, j) => {
                                    n.classList.toggle('is-on', j === cursor);
                                    n.setAttribute('aria-selected', j === cursor);
                                });
                            };
                        });
                        list.querySelector('.is-on')?.scrollIntoView({ block: 'nearest' });
                    };

                    input.oninput = () => {
                        query = input.value.trim();
                        const q = query.toLowerCase();
                        filtered = q
                            ? all.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q))
                                 // exact prefix matches first — they are almost always the intent
                                 .sort((a, b) => a.label.toLowerCase().indexOf(q) - b.label.toLowerCase().indexOf(q))
                            : [...recentItems, ...suggested];
                        cursor = 0;
                        paint();
                    };

                    input.onkeydown = (e) => {
                        if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, filtered.length - 1); paint(); }
                        if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); paint(); }
                        if (e.key === 'Enter') { e.preventDefault(); choose(filtered[cursor]); }
                    };
                    paint();
                },
            });
    },

    /* ---------------------------------------------------- notifications */
    notifications() {
        const cats = ['All', 'Approvals', 'AI', 'Campaigns', 'Connections', 'System'];
        const body = `
            <div class="chips mb3" id="nt-cats">
                ${cats.map((c, i) => `<button class="chip ${i === 0 ? 'is-on' : ''}" data-c="${c}">${c}</button>`).join('')}
            </div>
            <div id="nt-list"></div>`;

        drawer({
            title: 'Notifications',
            sub: `${DB.notifications.filter((n) => n.unread).length} unread`,
            body,
            foot: `<button class="btn btn--ghost grow" id="nt-read">Mark all as read</button>`,
            onMount(el) {
                const list = el.querySelector('#nt-list');
                const paint = (cat) => {
                    const items = cat === 'All' ? DB.notifications : DB.notifications.filter((n) => n.cat === cat);
                    list.innerHTML = items.length ? items.map((n) => `
                        <div class="row-t g3" style="padding:11px 0;border-bottom:1px solid var(--border-soft)">
                            <span class="act__ic ${n.urgent ? 'act__ic--ai' : ''}" style="margin-top:2px">
                                ${icon(n.urgent ? 'alert' : n.cat === 'AI' ? 'sparkle' : 'check')}</span>
                            <div class="grow">
                                <div class="row g2">
                                    <span class="t-13 w-600">${n.t}</span>
                                    ${n.unread ? '<span class="dot dot--off"></span>' : ''}
                                </div>
                                <div class="t-12 t-2 mt1">${n.d}</div>
                                <div class="t-11 t-3 mt1">${n.cat} · ${n.ago}</div>
                            </div>
                        </div>`).join('')
                        : emptyState({ ic: 'bell', title: 'Nothing here', desc: `No ${cat.toLowerCase()} notifications right now.` });
                };
                paint('All');
                el.querySelectorAll('#nt-cats .chip').forEach((b) => {
                    b.onclick = () => {
                        el.querySelectorAll('#nt-cats .chip').forEach((x) => x.classList.remove('is-on'));
                        b.classList.add('is-on');
                        paint(b.dataset.c);
                    };
                });
                el.querySelector('#nt-read').onclick = () => {
                    DB.notifications.forEach((n) => (n.unread = false));
                    Overlay.close();
                    App.renderShell();
                    toast('All notifications marked as read');
                };
            },
        });
    },

    /* --------------------------------------------------------- ask AI */

    /*  One conversational AI surface, not two. The header sparkle, the
        per-page contextual buttons, the command palette and Home's ask bar
        all land in the same place — the mascot chat.                     */
    askAI(prefill = '') {
        Chat.toggle(true, prefill);
    },

    /* --------------------------------------------------- create system */
    createMenu() {
        modal({
            title: 'Create',
            sub: 'What do you want to make?',
            body: `<div class="grid g-3 g-1-m">
                ${CREATE_ITEMS.map((c) => `
                    <button class="card card--pad col g2" data-k="${c.k}" style="text-align:left;align-items:flex-start">
                        <span class="tile">${icon(c.icon)}</span>
                        <span class="t-13 w-600">${c.label}</span>
                        <span class="t-11 t-3">${c.desc}</span>
                    </button>`).join('')}
            </div>`,
            large: true,
            onMount: (el) => {
                el.querySelectorAll('[data-k]').forEach((b) => {
                    b.onclick = () => {
                        Overlay.close();
                        const k = b.dataset.k;
                        if (k === 'campaign') return this.go('campaigns/new');
                        this.createFlow(k);
                    };
                });
            },
        });
    },

    createFlow(kind) {
        CreateFlow.open(kind);
    },

    /* ------------------------------------------------------ mobile more */
    moreSheet() {
        const items = [
            { k: 'brand', label: 'Brand Brain', icon: 'brain' },
            { k: 'analytics', label: 'Analytics', icon: 'analytics' },
            { k: 'campaigns', label: 'Campaigns', icon: 'campaigns' },
            { k: 'conversations', label: 'Conversations', icon: 'conversations' },
            { k: 'assets', label: 'Assets', icon: 'assets' },
            { k: 'connections', label: 'Connections', icon: 'connections' },
            { k: 'settings', label: 'Settings', icon: 'settings' },
        ];
        const el = Overlay.open(`
            <div class="sheet__grip"></div>
            <div class="drawer__head">
                <div class="grow"><div class="sec-title">More</div></div>
                <button class="iconbtn" data-close>${icon('x')}</button>
            </div>
            <div class="drawer__body">
                <div class="col">
                    ${items.map((i) => `<a class="lrow" href="#/${i.k}" style="padding-left:0;padding-right:0">
                        <span class="tile tile--sm">${icon(i.icon)}</span>
                        <span class="grow t-13 w-500">${i.label}</span>
                        ${icon('right', 't-3')}</a>`).join('')}
                </div>
                <div class="sep mt4 mb4"></div>
                <div class="credits">
                    <div class="row between">
                        <span class="credits__n">${DB.credits.left}</span>
                        <span class="credits__of">of ${DB.credits.total} credits</span>
                    </div>
                    <div class="bar mt2"><div class="bar__f" style="width:${Math.round(DB.credits.left / DB.credits.total * 100)}%"></div></div>
                </div>
                <button class="btn btn--block mt3" id="ms-theme">
                    ${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}
                    Switch theme
                </button>
            </div>`, { kind: 'sheet' });
        el.className = 'sheet';
        el.querySelectorAll('a').forEach((a) => (a.onclick = () => Overlay.close()));
        el.querySelector('#ms-theme').onclick = () => { Overlay.close(); this.toggleTheme(); };
    },
};

document.addEventListener('DOMContentLoaded', () => App.start());
