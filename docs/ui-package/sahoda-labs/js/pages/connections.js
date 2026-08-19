/*  Connections — the marketing ecosystem. A broken connection is the most
    expensive thing on this page, so it is stated plainly, never inferred
    from a colour alone.                                                 */

const GROUPS = ['Social', 'Advertising', 'Commerce', 'Messaging', 'Analytics'];

const Connections = {
    /*  Search Console needs a verified domain property, so the first attempt
        realistically fails. Keeping one honest failure in the flow means the
        recovery path is designed rather than theoretical.                 */
    failOnce: new Set(['searchconsole']),

    /*  Connecting is a guided sequence, not a single opaque click. Each step
        says what is happening; a failure explains itself and keeps the user
        exactly where they were.                                           */
    connect(k) {
        const c = DB.connections.find((x) => x.k === k);
        const label = PLATFORM_LABEL[k];
        const willFail = this.failOnce.has(k);

        modal({
            title: `Connect ${label}`,
            sub: 'This opens a secure authorisation window',
            body: `<div id="cn-flow"></div>`,
            foot: `<button class="btn" data-close>Cancel</button>`,
            onMount: (el) => {
                const host = el.querySelector('#cn-flow');
                const steps = ['Opening secure window', 'Authenticating account', 'Granting permissions', 'Syncing data'];

                const task = AITask.mount(host, steps, {
                    title: `Connecting ${label}`,
                    stepMs: 700,
                    auto: false,
                });

                let i = 0;
                const tick = () => setTimeout(() => {
                    if (!document.contains(host)) return;

                    // Fail on the permissions step, where a real one would.
                    if (willFail && i === 2) return fail();

                    const finished = task.advance();
                    i += 1;
                    if (!finished) tick();
                    else succeed();
                }, 700);

                const succeed = () => {
                    this.failOnce.delete(k);
                    c.status = 'connected';
                    c.sync = 'just now';
                    if (c.account === '—') c.account = '@sunrisedental';
                    host.innerHTML = `
                        <div class="state" style="padding:20px">
                            <div class="state__ic state__ic--accent">${icon('check')}</div>
                            <div class="state__t">${label} connected</div>
                            <div class="state__d">Data is syncing now. Scheduled content for this channel will publish normally.</div>
                        </div>`;
                    el.querySelector('.modal__foot').innerHTML =
                        `<button class="btn btn--primary" data-close>Done</button>`;
                    el.querySelector('[data-close]').onclick = () => {
                        Overlay.close();
                        App.refresh();
                        notify.success(`${label} connected`);
                    };
                };

                const fail = () => {
                    task.stop();
                    host.innerHTML = `
                        <div class="row g3 mb3">${mascot('alert', 'mface--lg')}
                            <div class="t-13 t-2">The connection stopped at the permissions step.</div></div>
                        <div class="banner banner--alert mb3">${icon('alert')}
                            <div>
                                <div class="banner__t">${label} couldn’t be connected</div>
                                <div class="banner__d">We reached your account, but no verified property was found for
                                    <b>sunrisedental.in</b>. Verify the domain in ${label}, then try again — nothing on your
                                    side has been changed.</div>
                            </div>
                        </div>
                        <div class="eyebrow mb2">What you can do</div>
                        <div class="col g2">
                            ${[['Verify the domain, then retry', 'Takes about two minutes in ' + label],
                               ['Connect a different account', 'Use an account that already owns the property']]
                                .map(([t, d]) => `<div class="card card--line" style="padding:10px 12px">
                                    <div class="t-13 w-600">${t}</div><div class="t-11 t-3 mt1">${d}</div></div>`).join('')}
                        </div>`;
                    el.querySelector('.modal__foot').innerHTML = `
                        <button class="btn btn--ghost" id="cn-support">Contact support</button>
                        <button class="btn" data-close>Cancel</button>
                        <button class="btn btn--primary" id="cn-retry">${icon('refresh')}Try again</button>`;
                    el.querySelector('[data-close]').onclick = () => Overlay.close();
                    el.querySelector('#cn-support').onclick = () => notify.info('Support conversation opened');
                    el.querySelector('#cn-retry').onclick = () => { Overlay.close(); this.connect(k); };
                    notify.error(`${label} couldn’t be connected`);
                };

                tick();
            },
        });
    },

    open(k) {
        const c = DB.connections.find((x) => x.k === k);
        const label = PLATFORM_LABEL[k];

        drawer({
            title: label,
            sub: c.group,
            body: `
                <div class="row g3 mb4">
                    <span class="tile tile--brand tile--lg">${brandIcon(k)}</span>
                    <div class="grow">
                        <div class="t-14 w-600">${label}</div>
                        <div class="t-12 t-2">${c.account}</div>
                    </div>
                    ${statusBadge(c.status)}
                </div>

                ${c.status === 'error' ? `
                    <div class="banner banner--alert mb4">${icon('alert')}
                        <div>
                            <div class="banner__t">${label} couldn’t be reached</div>
                            <div class="banner__d">Your authorization expired ${c.sync}. Scheduled posts to this channel are paused until you reconnect — nothing has been lost.</div>
                        </div>
                    </div>` : ''}

                ${c.status === 'disconnected' ? `
                    <div class="banner mb4">${icon('info')}
                        <div>
                            <div class="banner__t">Not connected</div>
                            <div class="banner__d">Connect ${label} to publish, read performance and pull audience data into Brand Brain.</div>
                        </div>
                    </div>` : ''}

                <div class="eyebrow mb2">Connection</div>
                <div class="card card--line mb4">
                    ${[['Account', c.account], ['Status', c.status === 'connected' ? 'Connected' : c.status === 'error' ? 'Action needed' : 'Not connected'],
                       ['Last synced', c.sync], ['Group', c.group]].map(([kk, v]) => `
                        <div class="row between" style="padding:9px 12px;border-bottom:1px solid var(--border-soft)">
                            <span class="t-12 t-2">${kk}</span><span class="t-12 w-500">${v}</span></div>`).join('')}
                </div>

                ${c.status === 'connected' ? `
                    <div class="eyebrow mb2">Permissions</div>
                    <div class="col g2">
                        ${['Read performance data', 'Publish content', 'Read messages', 'Manage ads'].map((p, i) => `
                            <div class="row between card card--line" style="padding:9px 12px">
                                <span class="t-12">${p}</span>
                                <input type="checkbox" class="switch" ${i < 3 ? 'checked' : ''}></div>`).join('')}
                    </div>` : ''}`,
            foot: c.status === 'connected'
                ? `<button class="btn btn--ghost" id="cn-dis">Disconnect</button>
                   <button class="btn grow" id="cn-sync">${icon('refresh')}Sync now</button>`
                : `<button class="btn" data-close>Cancel</button>
                   <button class="btn btn--primary grow" id="cn-connect">${icon('connections')}${c.status === 'error' ? 'Reconnect' : 'Connect'} ${label}</button>`,
            onMount: (el) => {
                el.querySelector('#cn-sync')?.addEventListener('click', (e) => runAction(e.currentTarget, {
                    busy: 'Syncing…', done: 'Synced',
                    onDone: () => { c.sync = 'just now'; notify.success(`${label} synced`); },
                }));
                el.querySelector('#cn-connect')?.addEventListener('click', () => {
                    Overlay.close();
                    this.connect(k);
                });
                el.querySelector('#cn-dis')?.addEventListener('click', () => confirmDialog({
                    title: `Disconnect ${label}?`,
                    message: 'Scheduled content on this channel will be paused and performance data stops updating.',
                    confirmLabel: 'Disconnect', destructive: true,
                    onConfirm: () => {
                        c.status = 'disconnected';
                        c.sync = '—';
                        Overlay.close();
                        App.refresh();
                        toast(`${label} disconnected`);
                    },
                }));
            },
        });
    },
};

PAGES.connections = {
    skeleton() {
        return `<div class="page__in">
            <div class="sk sk--title mb4" style="height:20px;width:170px"></div>
            ${skeletonCards(4)}</div>`;
    },

    render() {
        const broken = DB.connections.filter((c) => c.status === 'error');

        return `<div class="page__in">
            <div class="page__hd">
                <div>
                    <div class="page-title">Connections</div>
                    <div class="page-sub">Connect your marketing ecosystem.</div>
                </div>
                <div class="page__tools">
                    ${contextualAI("connections")}
                    <button class="btn btn--sm" id="cn-sync-all">${icon('refresh')}Sync all</button>
                    <button class="btn btn--sm btn--primary" id="cn-add">${icon('plus')}Add connection</button>
                </div>
            </div>

            ${broken.length ? `
                <div class="banner banner--alert mb4">${icon('alert')}
                    <div class="grow">
                        <div class="banner__t">${broken.length} connection${broken.length > 1 ? 's need' : ' needs'} attention</div>
                        <div class="banner__d">${broken.map((b) => PLATFORM_LABEL[b.k]).join(', ')} — authorization expired. Publishing to ${broken.length > 1 ? 'these channels is' : 'this channel is'} paused.</div>
                    </div>
                    <button class="btn btn--sm btn--primary" data-fix="${broken[0].k}">Reconnect</button>
                </div>` : ''}

            ${GROUPS.map((g) => {
                const items = DB.connections.filter((c) => c.group === g);
                if (!items.length) return '';
                return `<section class="mb5">
                    <div class="row g2 mb3">
                        <span class="sec-title">${g}</span>
                        <span class="count count--ink">${items.length}</span>
                    </div>
                    <div class="grid g-4">
                        ${items.map((c) => `
                            <article class="card card--pad col g3 card--int" data-k="${c.k}">
                                <div class="row g2">
                                    <span class="tile tile--brand">${brandIcon(c.k)}</span>
                                    <div class="grow" style="min-width:0">
                                        <div class="t-13 w-600 truncate">${PLATFORM_LABEL[c.k]}</div>
                                        <div class="t-11 t-3 truncate">${c.account}</div>
                                    </div>
                                </div>
                                <div class="row between">
                                    ${statusBadge(c.status)}
                                    <span class="t-11 t-3">${c.status === 'connected' ? 'Synced ' + c.sync : ''}</span>
                                </div>
                                <div class="row g2">
                                    ${c.status === 'connected'
                                        ? `<button class="btn btn--sm grow" data-manage="${c.k}">Manage</button>`
                                        : `<button class="btn btn--sm btn--primary grow" data-connect="${c.k}">
                                            ${c.status === 'error' ? 'Reconnect' : 'Connect'}</button>`}
                                </div>
                            </article>`).join('')}
                    </div>
                </section>`;
            }).join('')}
        </div>`;
    },

    mount(host) {
        host.querySelectorAll('[data-k]').forEach((el) => (el.onclick = (e) => {
            if (e.target.closest('button')) return;
            Connections.open(el.dataset.k);
        }));
        host.querySelectorAll('[data-manage]').forEach((b) => (b.onclick = (e) => {
            e.stopPropagation();
            Connections.open(b.dataset.manage);
        }));
        // Connect / Reconnect go straight into the guided flow — one click
        // less than opening the panel first.
        host.querySelectorAll('[data-connect],[data-fix]').forEach((b) => (b.onclick = (e) => {
            e.stopPropagation();
            Connections.connect(b.dataset.connect || b.dataset.fix);
        }));
        host.querySelector('#cn-sync-all').onclick = (e) => runAction(e.currentTarget, {
            busy: 'Syncing…', done: 'Synced', ms: 900,
            onDone: () => {
                DB.connections.filter((c) => c.status === 'connected').forEach((c) => (c.sync = 'just now'));
                notify.success('All connections synced');
            },
        });
        host.querySelector('#cn-add').onclick = () => modal({
            title: 'Add connection',
            sub: 'Pick a platform to authorise',
            body: `<div class="grid g-3 g-1-m" style="gap:8px">
                ${DB.connections.filter((c) => c.status !== 'connected').map((c) => `
                    <button class="card card--pad row g2" data-add="${c.k}" style="text-align:left">
                        <span class="tile tile--brand tile--sm">${brandIcon(c.k)}</span>
                        <span class="t-13 w-500 grow">${PLATFORM_LABEL[c.k]}</span>
                    </button>`).join('')
                || emptyState({ ic: 'check', title: 'Everything is connected', desc: 'There are no remaining platforms to add.' })}
            </div>`,
            onMount: (el) => el.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => {
                Overlay.close();
                Connections.open(b.dataset.add);
            })),
        });
    },
};
