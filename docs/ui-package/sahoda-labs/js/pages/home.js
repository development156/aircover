/*  Home — answers four questions in order: what happened, what is
    happening, what needs me, what should I do next.                     */

/*  Drop artwork at this path and the greeting banner picks it up. Two
    optional files: the second is used in dark mode if it exists, so a
    light-background illustration never has to survive a dark surface.
    With neither present the banner falls back to its palette wash.      */

const GREET_ART = {
    light: 'logo/banner.png',
    dark: 'logo/banner-dark.png',   // optional; falls back to the light art
};

PAGES.home = {
    skeleton() {
        return `<div class="page__in">
            <div class="sk sk--title mb4" style="height:20px;width:260px"></div>
            ${skeletonCards(4)}
            <div class="mt4"><div class="card">${skeletonList(3)}</div></div>
        </div>`;
    },

    render() {
        const pending = DB.approvals.filter((a) => a.status === 'pending');
        const done = DB.activity.length + 2;   // feed shows the notable ones only

        return `<div class="page__in">

        <!-- greeting: one line of state on a banner, not a hero card -->
        <div class="greet" id="h-greet">
            <div class="greet__bg" aria-hidden="true"></div>
            <div class="greet__art" aria-hidden="true"></div>
            <div class="page__hd">
                <div>
                    <div class="greet__t">Good evening, ${DB.user.short}.</div>
                    <div class="greet__s">AI completed ${done + 4} marketing tasks today.</div>
                </div>
                <div class="page__tools">
                    ${contextualAI('home')}
                    <button class="btn btn--sm" id="h-activity">${icon('activity')}View activity</button>
                    <button class="btn btn--primary btn--sm" id="h-create">${icon('plus')}Create</button>
                </div>
            </div>
        </div>

        <div class="split split--wide">
            <div class="col g4">

                <!-- performance -->
                <section class="card">
                    <div class="card__head">
                        <span class="sec-title">Performance</span>
                        <div class="push row g2">
                            <button class="btn btn--sm btn--ghost" id="h-period">This week ${icon('down')}</button>
                            <a class="link" href="#/analytics">Details ${icon('right')}</a>
                        </div>
                    </div>
                    <div class="row" style="align-items:stretch;overflow-x:auto">
                        ${DB.metrics.slice(0, 4).map((m) => `
                            <div class="metric grow" style="min-width:132px">
                                <div class="metric__l">${m.label}</div>
                                <div class="row g2" style="align-items:baseline">
                                    <span class="metric__v">${m.value}</span>
                                    ${deltaTag(m.delta, m.dir)}
                                </div>
                                <div class="metric__spark ${m.dir === 'up' ? 't-accent' : 't-2'}">${sparkline(m.spark)}</div>
                            </div>`).join('')}
                        <div class="metric row g3" style="min-width:150px">
                            ${ring(DB.score.value, { size: 46, stroke: 4, label: DB.score.value })}
                            <div>
                                <div class="metric__l">Marketing Score</div>
                                <div class="t-13 w-600 mt1">${DB.score.label}</div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- needs your attention -->
                <section class="card">
                    <div class="card__head">
                        <span class="sec-title">Needs your attention</span>
                        <span class="count" id="h-pending" aria-live="polite">${pending.length}</span>
                        <a class="link push" href="#/approvals">View all ${icon('right')}</a>
                    </div>
                    <div class="card__body grid g-2 att-grid" style="gap:12px" id="h-att">
                        ${pending.slice(0, 2).map((a) => `
                            <div class="att" data-ap="${a.id}">
                                ${platformTile(a.platform)}
                                <div class="grow att__main">
                                    <div class="row g2 mb2">
                                        ${statusBadge(a.priority)}
                                        <span class="t-11 t-3 push">${a.due}</span>
                                    </div>
                                    <div class="t-13 w-600">${a.title}</div>
                                    <div class="t-12 t-2 clamp-2 mt1 att__desc">${a.desc}</div>
                                    <div class="row g2 att__acts">
                                        <button class="btn btn--sm btn--primary" data-approve="${a.id}">Approve</button>
                                        <button class="btn btn--sm" data-review="${a.id}">Review</button>
                                        <span class="t-11 t-3 row g1 push">${icon('eye')}${a.reach}</span>
                                    </div>
                                </div>
                                <span class="tip" data-tip="${a.progress}% ready to publish"
                                    aria-label="${a.progress}% ready to publish">
                                    ${ring(a.progress, { size: 38, stroke: 3 })}</span>
                            </div>`).join('')}
                    </div>
                </section>

                <!-- weekly planner -->
                <section class="card">
                    <div class="card__head">
                        <span class="sec-title">This week</span>
                        <a class="link push" href="#/planner">Open planner ${icon('right')}</a>
                    </div>
                    <div class="card__body">
                        <div class="week">
                            ${DB.week.map((d) => `
                                <div class="week__d ${d.today ? 'is-today' : ''}">
                                    <div class="week__n">${d.day}</div>
                                    <div class="week__dt">${d.date}</div>
                                    ${d.items.map((i) => `
                                        <div class="week__e">
                                            ${brandIcon(i.platform)}
                                            <span class="truncate grow">${i.kind}</span>
                                        </div>
                                        <div class="t-11 t-3" style="padding-left:2px">${i.time}</div>`).join('')
                                        || '<div class="t-11 t-3 mt2">Rest day</div>'}
                                </div>`).join('')}
                        </div>
                    </div>
                </section>
            </div>

            <!-- right rail -->
            <div class="col g4">

                <!-- AI activity -->
                <section class="card">
                    <div class="card__head">
                        ${mascot(workspaceMood(), 'mface--sm')}
                        <span class="sec-title">AI activity</span>
                        <span class="thinking push" role="status"><span>Working</span><i></i><i></i><i></i></span>
                    </div>
                    <div class="card__body--tight" style="padding:6px 16px" id="h-feed">
                        ${DB.activity.slice(0, 4).map((a) => `
                            <div class="act">
                                <span class="act__ic ${a.kind === 'ai' ? 'act__ic--ai' : ''}">
                                    ${icon(a.kind === 'ai' ? 'sparkle' : 'check')}</span>
                                <span class="grow t-12">${a.t}</span>
                                <span class="t-11 t-3">${a.ago}</span>
                            </div>`).join('')}
                    </div>
                    <div class="card__foot">
                        <div class="askbar">
                            <input id="h-ask" placeholder="Ask anything…">
                            <button class="askbar__go" id="h-ask-go">${icon('mic')}</button>
                        </div>
                    </div>
                </section>

                <!-- brand brain -->
                <section class="card">
                    <div class="card__head">
                        <span class="sec-title">Brand Brain</span>
                        <a class="link push" href="#/brand">View all ${icon('right')}</a>
                    </div>
                    <div class="card__body grid g-3" style="gap:8px">
                        ${[['Brand Voice', DB.brand.voice, 'mic'], ['Writing Style', DB.brand.style, 'type'],
                           ['Primary Color', DB.brand.color, 'palette'], ['Audience', DB.brand.audience, 'users'],
                           ['Competitors', DB.brand.competitors + ' tracked', 'target'],
                           ['Knowledge', DB.brand.docs + ' docs', 'book']].map(([l, v, ic]) => `
                            <a class="bb" href="#/brand">
                                <span class="ai-mark t-3">${icon(ic)}</span>
                                <div class="bb__l mt1">${l}</div>
                                <div class="bb__v truncate">${v}</div>
                            </a>`).join('')}
                    </div>
                </section>

                <!-- connections -->
                <section class="card">
                    <div class="card__head">
                        <span class="sec-title">Connections</span>
                        <a class="link push" href="#/connections">Manage ${icon('right')}</a>
                    </div>
                    <div class="card__body grid g-4" style="gap:8px">
                        ${DB.connections.filter((c) => ['instagram', 'facebook', 'linkedin', 'googleads', 'metaads', 'shopify', 'whatsapp', 'tiktok'].includes(c.k))
                            .map((c) => `
                            <a class="conn" href="#/connections">
                                ${brandIcon(c.k, 'bic--md')}
                                <span class="conn__n truncate">${PLATFORM_LABEL[c.k]}</span>
                                <span class="conn__s">
                                    <span class="dot ${c.status === 'connected' ? 'dot--on' : 'dot--off'}"></span>
                                    ${c.status === 'connected' ? 'Connected' : c.status === 'error' ? 'Reauth' : 'Off'}
                                </span>
                            </a>`).join('')}
                    </div>
                </section>
            </div>
        </div></div>`;
    },

    mount(host) {
        /*  Probe for the banner art rather than assuming it exists — with no
            file the wash stands on its own and nothing looks broken.      */
        const greet = host.querySelector('#h-greet');
        const art = host.querySelector('.greet__art');
        if (greet && art) {
            const dark = document.documentElement.dataset.theme === 'dark';
            const tryLoad = (src, fallback) => {
                const probe = new Image();
                probe.onload = () => {
                    /*  Set background-image inline, not through a custom
                        property. A url() inside a custom property that is
                        consumed in css/layout.css resolves relative to that
                        stylesheet — i.e. css/logo/… — and silently 404s.
                        Inline styles resolve against the document instead. */
                    art.style.backgroundImage = `url("${src}")`;
                    greet.classList.add('has-art');
                };
                probe.onerror = () => fallback?.();
                probe.src = src;
            };
            dark
                ? tryLoad(GREET_ART.dark, () => tryLoad(GREET_ART.light))
                : tryLoad(GREET_ART.light);
        }

        host.querySelector('#h-create').onclick = () => App.createMenu();

        host.querySelectorAll('[data-ap]').forEach((el) => {
            el.onclick = (e) => {
                if (e.target.closest('button')) return;
                Approvals.openDetail(el.dataset.ap);
            };
        });

        host.querySelectorAll('[data-review]').forEach((b) => {
            b.onclick = (e) => { e.stopPropagation(); Approvals.openDetail(b.dataset.review); };
        });

        /*  Approving from the dashboard updates the dashboard — the count
            ticks down, the card leaves, and the activity feed gains a line.
            Nothing reloads, because nothing else on the page changed.     */
        host.querySelectorAll('[data-approve]').forEach((b) => {
            b.onclick = (e) => {
                e.stopPropagation();
                const id = b.dataset.approve;
                const item = DB.approvals.find((a) => a.id === id);
                if (!item) return;

                runAction(b, {
                    busy: 'Approving…', done: 'Approved', ms: 420, restore: false,
                    onDone: () => {
                        item.status = 'approved';
                        DB.activity.unshift({ t: `Approved ${item.title}`, ago: 'just now', kind: 'done' });

                        const card = b.closest('.att');
                        card?.classList.add('is-leaving');

                        setTimeout(() => {
                            // Backfill from the queue so the panel never empties
                            // to a blank box while work is still pending.
                            const left = DB.approvals.filter((a) => a.status === 'pending');
                            tickValue(host.querySelector('#h-pending'), left.length);

                            const feed = host.querySelector('#h-feed');
                            if (feed) {
                                const row = document.createElement('div');
                                row.className = 'act num-tick';
                                row.innerHTML = `<span class="act__ic">${icon('check')}</span>
                                    <span class="grow t-12">Approved ${esc(item.title)}</span>
                                    <span class="t-11 t-3">just now</span>`;
                                feed.prepend(row);
                                if (feed.children.length > 4) feed.lastElementChild.remove();
                            }

                            App.renderShell();
                            if (!left.length || !host.querySelector('#h-att .att:not(.is-leaving)')) App.refresh();
                            else card?.remove();
                        }, 240);

                        notify.success('Post approved and scheduled', {
                            action: { label: 'Undo', on: () => { item.status = 'pending'; App.refresh(); App.renderShell(); } },
                        });
                    },
                });
            };
        });

        host.querySelector('#h-activity').onclick = () => {
            drawer({
                title: 'AI activity',
                sub: 'Everything the assistant did today',
                body: DB.activity.map((a) => `
                    <div class="act" style="padding:10px 0;border-bottom:1px solid var(--border-soft)">
                        <span class="act__ic ${a.kind === 'ai' ? 'act__ic--ai' : ''}">
                            ${icon(a.kind === 'ai' ? 'sparkle' : 'check')}</span>
                        <span class="grow t-13">${a.t}</span>
                        <span class="t-11 t-3">${a.ago}</span>
                    </div>`).join(''),
            });
        };

        const ask = () => App.askAI(host.querySelector('#h-ask').value);
        host.querySelector('#h-ask-go').onclick = ask;
        host.querySelector('#h-ask').onkeydown = (e) => { if (e.key === 'Enter') ask(); };

        host.querySelector('#h-period').onclick = (e) => menu(e.currentTarget,
            ['This week', 'Last week', 'This month', 'Last 90 days'].map((p, i) => ({
                label: p, active: i === 0, on: () => toast(`Period set to ${p.toLowerCase()}`),
            })));
    },
};
