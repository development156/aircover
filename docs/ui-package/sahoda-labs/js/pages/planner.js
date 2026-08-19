/*  Planner — calendar and board views over the same scheduled work.     */

const Planner = {
    view: 'calendar',
    month: 6,          // July
    year: 2026,
    today: 19,

    monthName() {
        return new Date(this.year, this.month, 1).toLocaleString('en', { month: 'long' });
    },

    /** Monday-first grid including the leading/trailing days of adjacent months. */
    grid() {
        const first = new Date(this.year, this.month, 1);
        const lead = (first.getDay() + 6) % 7;               // Mon = 0
        const days = new Date(this.year, this.month + 1, 0).getDate();
        const prev = new Date(this.year, this.month, 0).getDate();
        const cells = [];
        for (let i = lead - 1; i >= 0; i--) cells.push({ n: prev - i, out: true });
        for (let d = 1; d <= days; d++) cells.push({ n: d, out: false });
        while (cells.length % 7) cells.push({ n: cells.length - lead - days + 1, out: true });
        return cells;
    },

    eventsOn(day) {
        return DB.events.filter((e) => e.d === day);
    },

    move(dir) {
        this.month += dir;
        if (this.month > 11) { this.month = 0; this.year++; }
        if (this.month < 0) { this.month = 11; this.year--; }
        App.refresh();
    },

    openEvent(e) {
        drawer({
            title: e.title,
            sub: `${PLATFORM_LABEL[e.platform]} · ${e.kind}`,
            body: `
                <div class="row g2 mb4">${statusBadge(e.stage)}<span class="badge badge--soft">${e.time}</span></div>
                <div class="card card--line mb4">
                    <div style="aspect-ratio:16/9;background:var(--surface-2);display:grid;place-items:center">
                        ${icon('image', 't-3')}</div>
                    <div style="padding:12px"><p class="t-13 t-2">Scheduled for ${this.monthName()} ${e.d}, ${e.time}. Content is ready and the channel is connected.</p></div>
                </div>
                <div class="eyebrow mb2">Details</div>
                <div class="card card--line">
                    ${[['Channel', PLATFORM_LABEL[e.platform]], ['Format', e.kind], ['Stage', e.stage], ['Time', e.time]]
                        .map(([k, v]) => `<div class="row between" style="padding:9px 12px;border-bottom:1px solid var(--border-soft)">
                            <span class="t-12 t-2">${k}</span><span class="t-12 w-500">${v}</span></div>`).join('')}
                </div>`,
            foot: `<button class="btn btn--ghost" data-close>Close</button>
                   <button class="btn grow" onclick="toast('Opened for editing')">${icon('edit')}Edit</button>
                   <button class="btn btn--primary grow" onclick="toast('Rescheduled')">${icon('calendar')}Reschedule</button>`,
        });
    },
};

PAGES.planner = {
    skeleton() {
        return `<div class="page__in">
            <div class="sk sk--title mb4" style="height:20px;width:150px"></div>
            <div class="sk sk--block" style="height:420px"></div></div>`;
    },

    render() {
        const P = Planner;

        return `<div class="page__in">
            <div class="page__hd">
                <div>
                    <div class="page-title">Planner</div>
                    <div class="page-sub">Plan, schedule &amp; stay ahead.</div>
                </div>
                <div class="page__tools">
                    ${contextualAI('planner')}
                    <button class="btn btn--sm btn--ghost" id="pl-share">${icon('share')}Share</button>
                    <button class="btn btn--sm" id="pl-range">${icon('calendar')}This week ${icon('down')}</button>
                </div>
            </div>

            <div class="toolbar">
                <div class="seg">
                    <button class="seg__i ${P.view === 'calendar' ? 'is-on' : ''}" data-v="calendar">${icon('calendar')}Calendar</button>
                    <button class="seg__i ${P.view === 'board' ? 'is-on' : ''}" data-v="board">${icon('columns')}Board</button>
                </div>
                <div class="push row g2">
                    <button class="btn btn--sm" id="pl-profiles">${icon('user')}All profiles ${icon('down')}</button>
                    <button class="btn btn--sm" id="pl-sort">${icon('sort')}Newest ${icon('down')}</button>
                </div>
            </div>

            ${P.view === 'calendar' ? this.calendar() : this.board()}

            <!-- upcoming -->
            <section class="card mt4">
                <div class="card__head">
                    <span class="sec-title">Upcoming</span>
                    <span class="t-12 t-3">This week</span>
                    <span class="count">5</span>
                    <a class="link push" href="#/approvals">View all ${icon('right')}</a>
                </div>
                ${DB.events.slice(0, 5).map((e) => `
                    <div class="lrow" data-ev="${e.d}">
                        ${platformTile(e.platform)}
                        <div class="grow" style="min-width:0">
                            <div class="t-13 w-600 truncate">${PLATFORM_LABEL[e.platform]} ${e.kind}</div>
                            <div class="t-12 t-2 truncate">${e.title}</div>
                        </div>
                        <span class="t-12 t-2 row g1" style="flex:none">${icon('calendar')}Jul ${e.d}, ${e.time}</span>
                        ${statusBadge(e.stage)}
                        ${icon('right', 't-3')}
                    </div>`).join('')}
            </section>
        </div>`;
    },

    calendar() {
        const P = Planner;
        const cells = P.grid();
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        return `<section class="card">
            <div class="card__head">
                <span class="sec-title">${P.monthName()} ${P.year}</span>
                <div class="row g1">
                    <button class="iconbtn" id="pl-prev">${icon('left')}</button>
                    <button class="iconbtn" id="pl-next">${icon('right')}</button>
                </div>
                <div class="push row g2">
                    <button class="btn btn--sm" id="pl-today">Today</button>
                    <button class="btn btn--sm btn--primary" onclick="App.createMenu()">${icon('plus')}Create</button>
                </div>
            </div>
            <div class="card__body" style="padding:12px">
                <div class="cal">
                    <div class="cal__hd">${dayNames.map((d) => `<div class="cal__dn">${d}</div>`).join('')}</div>
                    <div class="cal__grid">
                        ${cells.map((c) => {
                            const evs = c.out ? [] : P.eventsOn(c.n);
                            const isToday = !c.out && c.n === P.today;
                            return `<div class="cal__c ${c.out ? 'cal__c--out' : ''} ${isToday ? 'cal__c--today' : ''}"
                                    ${c.out ? '' : `data-day="${c.n}"`}>
                                <div class="cal__n">${c.n}</div>
                                ${evs.map((e) => `
                                    <div class="cal__e" data-ev="${e.d}" draggable="true" tabindex="0"
                                        role="button" aria-label="${esc(e.kind)} at ${e.time}">
                                        ${brandIcon(e.platform)}
                                        <b class="truncate grow">${e.kind}</b>
                                        <span>${e.time.replace(':00', '')}</span>
                                    </div>`).join('')}
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            </div>
        </section>`;
    },

    board() {
        const byStage = (s) => DB.events.filter((e) => e.stage === s);
        return `<section class="kb">
            ${STAGES.map((s) => `
                <div class="kb__col">
                    <div class="kb__hd">
                        <span class="t-12 w-600">${s}</span>
                        <span class="count count--ink">${byStage(s).length}</span>
                        <button class="iconbtn push" style="width:24px;height:24px" onclick="App.createMenu()">${icon('plus')}</button>
                    </div>
                    <div class="kb__body" data-stage="${s}">
                        ${byStage(s).map((e) => `
                            <div class="kb__card" draggable="true" data-ev="${e.d}">
                                <div class="row g2 mb2">
                                    ${brandIcon(e.platform, 'bic--sm')}
                                    <span class="t-11 t-3 truncate grow">${PLATFORM_LABEL[e.platform]}</span>
                                </div>
                                <div class="t-12 w-600 clamp-2">${e.title}</div>
                                <div class="row g2 mt2">
                                    <span class="t-11 t-3">Jul ${e.d}</span>
                                    <span class="t-11 t-3 push">${e.time}</span>
                                </div>
                            </div>`).join('')
                            || `<div class="t-11 t-3" style="padding:14px 8px;text-align:center">Nothing here yet</div>`}
                    </div>
                </div>`).join('')}
        </section>`;
    },

    mount(host) {
        host.querySelectorAll('[data-v]').forEach((b) => {
            b.onclick = () => { Planner.view = b.dataset.v; App.refresh(); };
        });

        host.querySelector('#pl-prev')?.addEventListener('click', () => Planner.move(-1));
        host.querySelector('#pl-next')?.addEventListener('click', () => Planner.move(1));
        host.querySelector('#pl-today')?.addEventListener('click', () => {
            Planner.month = 6; Planner.year = 2026; App.refresh();
        });

        host.querySelectorAll('[data-ev]').forEach((el) => {
            el.onclick = (e) => {
                e.stopPropagation();
                const ev = DB.events.find((x) => x.d === +el.dataset.ev);
                if (ev) Planner.openEvent(ev);
            };
            el.onkeydown = (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                const ev = DB.events.find((x) => x.d === +el.dataset.ev);
                if (ev) Planner.openEvent(ev);
            };
        });

        /*  Calendar drag to reschedule. A clash is surfaced as a decision,
            never resolved silently — two posts at the same hour on the same
            channel is exactly the mistake a planner should catch.        */
        let calDrag = null;
        host.querySelectorAll('.cal__e').forEach((el) => {
            el.ondragstart = (e) => {
                calDrag = DB.events.find((x) => x.d === +el.dataset.ev);
                el.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'move';
            };
            el.ondragend = () => { el.style.opacity = ''; calDrag = null; };
        });

        host.querySelectorAll('.cal__c[data-day]').forEach((cell) => {
            cell.ondragover = (e) => { e.preventDefault(); cell.style.background = 'var(--orange-06)'; };
            cell.ondragleave = () => { cell.style.background = ''; };
            cell.ondrop = (e) => {
                e.preventDefault();
                cell.style.background = '';
                if (!calDrag) return;

                const day = +cell.dataset.day;
                const from = calDrag.d;
                if (day === from) return;

                const ev = calDrag;
                const clash = DB.events.find((x) => x !== ev && x.d === day && x.time === ev.time && x.platform === ev.platform);

                const commit = (time = ev.time) => {
                    ev.d = day;
                    ev.time = time;
                    App.refresh();
                    notify.success(`Scheduled for ${Planner.monthName()} ${day}, ${time}`, {
                        action: { label: 'Undo', on: () => { ev.d = from; App.refresh(); } },
                    });
                };

                if (!clash) return commit();

                modal({
                    title: 'Schedule conflict',
                    body: `<div class="banner banner--alert mb3">${icon('alert')}
                            <div><div class="banner__t">${PLATFORM_LABEL[ev.platform]} already has a post at ${ev.time}</div>
                            <div class="banner__d">“${esc(clash.title)}” is scheduled for ${Planner.monthName()} ${day} at ${clash.time}. Posting twice in the same hour splits your reach.</div></div>
                        </div>
                        <div class="field"><label class="label">Move “${esc(ev.title)}” to</label>
                            <select class="select" id="pc-time">
                                ${['09:00 AM', '11:00 AM', '01:00 PM', '04:00 PM', '06:00 PM']
                                    .map((t) => `<option>${t}</option>`).join('')}
                            </select></div>`,
                    foot: `<button class="btn" data-close>Cancel</button>
                           <button class="btn btn--ghost" id="pc-anyway">Schedule anyway</button>
                           <button class="btn btn--primary" id="pc-ok">Choose this time</button>`,
                    onMount(el) {
                        el.querySelector('#pc-ok').onclick = () => {
                            const t = el.querySelector('#pc-time').value;
                            Overlay.close();
                            commit(t);
                        };
                        el.querySelector('#pc-anyway').onclick = () => { Overlay.close(); commit(); };
                    },
                });
            };
        });

        host.querySelector('#pl-share')?.addEventListener('click', () => modal({
            title: 'Share planner',
            sub: 'Anyone with the link can view this month',
            body: `<div class="field mb3">
                    <label class="label">Share link</label>
                    <div class="row g2">
                        <input class="input" value="https://app.sahodalabs.com/p/sunrise-jul26" readonly>
                        <button class="btn" id="sh-copy">${icon('copy')}Copy</button>
                    </div></div>
                <div class="row between card card--line" style="padding:10px 12px">
                    <div><div class="t-13 w-600">Allow comments</div>
                    <div class="t-11 t-3">Viewers can leave notes on scheduled items</div></div>
                    <input type="checkbox" class="switch" checked></div>`,
            foot: `<button class="btn" data-close>Done</button>`,
            onMount: (el) => { el.querySelector('#sh-copy').onclick = () => toast('Link copied to clipboard'); },
        }));

        host.querySelector('#pl-range')?.addEventListener('click', (e) => menu(e.currentTarget,
            ['This week', 'Next week', 'This month', 'This quarter'].map((p, i) => ({ label: p, active: i === 0, on: () => toast(`Showing ${p.toLowerCase()}`) }))));
        host.querySelector('#pl-profiles')?.addEventListener('click', (e) => menu(e.currentTarget,
            ['All profiles', 'Sunrise Dental', 'Kalinga Cafe'].map((p, i) => ({ label: p, active: i === 0, on: () => toast(`Showing ${p}`) }))));
        host.querySelector('#pl-sort')?.addEventListener('click', (e) => menu(e.currentTarget,
            ['Newest', 'Oldest', 'Channel', 'Stage'].map((p, i) => ({ label: p, active: i === 0, on: () => toast(`Sorted by ${p.toLowerCase()}`) }))));

        /*  Board drag & drop. The card being dragged dims, the column under
            the pointer lights up, and the drop confirms what happened —
            a silent move leaves the user unsure it worked.               */
        let dragged = null;
        host.querySelectorAll('.kb__card').forEach((c) => {
            c.ondragstart = (e) => {
                dragged = c;
                c.classList.add('is-drag');
                e.dataTransfer.effectAllowed = 'move';
                // A compact drag image, rather than a full translucent card.
                const ghost = c.cloneNode(true);
                ghost.style.cssText = 'position:absolute;top:-9999px;width:220px;opacity:.95;box-shadow:0 8px 24px rgba(0,0,0,.18)';
                document.body.append(ghost);
                e.dataTransfer.setDragImage(ghost, 20, 20);
                setTimeout(() => ghost.remove(), 0);
            };
            c.ondragend = () => { dragged = null; c.classList.remove('is-drag'); };
        });

        host.querySelectorAll('.kb__body').forEach((col) => {
            col.ondragover = (e) => { e.preventDefault(); col.classList.add('is-over'); };
            col.ondragleave = () => col.classList.remove('is-over');
            col.ondrop = (e) => {
                e.preventDefault();
                col.classList.remove('is-over');
                if (!dragged) return;
                const ev = DB.events.find((x) => x.d === +dragged.dataset.ev);
                if (!ev || ev.stage === col.dataset.stage) return;
                const from = ev.stage;
                ev.stage = col.dataset.stage;
                App.refresh();
                notify.success(`Moved to ${col.dataset.stage}`, {
                    action: { label: 'Undo', on: () => { ev.stage = from; App.refresh(); } },
                });
            };
        });

        Keys.setScope({
            n: () => Planner.move(1),
            p: () => Planner.move(-1),
            t: () => { Planner.month = 6; Planner.year = 2026; App.refresh(); },
        }, [
            ['N', 'Next month'],
            ['P', 'Previous month'],
            ['T', 'Jump to today'],
        ]);
    },
};
