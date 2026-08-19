/*  Approvals — the supervision surface.

    This is the page a user spends the most repetitive time in, so it is
    built as a review *queue*, not a list: decide, the row leaves, the next
    one takes focus, and the counter tells you how far through you are.
    Everything is reachable from the keyboard (A / E / R / J / K).        */

const Approvals = {
    filter: 'All',
    selected: new Set(),
    cursor: 0,
    session: null,      // { done, total } — starts at the first decision

    list() {
        const f = this.filter;
        return DB.approvals.filter((a) => {
            if (a.status !== 'pending') return false;
            if (f === 'All') return true;
            if (f === 'Urgent') return a.priority === 'High';
            if (f === 'Content') return ['Post', 'Story'].includes(a.kind);
            if (f === 'Campaigns') return ['Campaign', 'Broadcast'].includes(a.kind);
            if (f === 'Ads') return a.kind === 'Ad';
            return true;
        }).sort((a, b) => a.dueSort - b.dueSort);
    },

    at(i) { return this.list()[i]; },

    /* ---------------------------------------------------- single decision */

    /*  Optimistic: the row animates out immediately and the counts update
        in place. Nothing re-renders, so the rows below do not jump.       */
    decide(id, verb, btn) {
        const row = document.querySelector(`.lrow[data-id="${id}"]`);
        const item = DB.approvals.find((a) => a.id === id);
        if (!item || item.status !== 'pending') return;

        if (!this.session) this.session = { done: 0, total: this.list().length };

        const commit = () => {
            item.status = verb === 'approve' ? 'approved' : 'rejected';
            this.selected.delete(id);
            this.session.done += 1;

            DB.activity.unshift({
                t: `${verb === 'approve' ? 'Approved' : 'Rejected'} ${item.title}`,
                ago: 'just now', kind: 'done',
            });

            removeRow(row, () => {
                this.syncAfterDecision();
                App.renderShell();       // sidebar + header badges
            });
        };

        if (btn) runAction(btn, { busy: verb === 'approve' ? 'Approving…' : 'Rejecting…', done: verb === 'approve' ? 'Approved' : 'Rejected', ms: 420, restore: false, onDone: commit });
        else commit();
    },

    /*  Repaint only the parts that changed: the counter, the chips, the
        cursor position — or the empty state if the queue is now clear.    */
    syncAfterDecision() {
        const left = this.list();
        const host = $('#page');
        if (!host) return;

        if (!left.length) { App.refresh(); return; }

        const counter = host.querySelector('#ap-progress');
        if (counter && this.session) {
            counter.classList.remove('hide');
            tickValue(counter.querySelector('b'), `${this.session.done} of ${this.session.total}`);
        }

        const n = host.querySelector('#ap-count');
        if (n) tickValue(n, `${left.length} awaiting review`);

        host.querySelectorAll('[data-f]').forEach((chip) => {
            const k = chip.dataset.f;
            const el = chip.querySelector('.chip__n');
            if (el) el.textContent = this.countFor(k);
        });

        this.cursor = Math.min(this.cursor, left.length - 1);
        this.paintCursor();
        this.syncBulk();
    },

    countFor(k) {
        const p = DB.approvals.filter((a) => a.status === 'pending');
        if (k === 'All') return p.length;
        if (k === 'Urgent') return p.filter((a) => a.priority === 'High').length;
        if (k === 'Content') return p.filter((a) => ['Post', 'Story'].includes(a.kind)).length;
        if (k === 'Campaigns') return p.filter((a) => ['Campaign', 'Broadcast'].includes(a.kind)).length;
        if (k === 'Ads') return p.filter((a) => a.kind === 'Ad').length;
        return 0;
    },

    bulk(verb) {
        const ids = [...this.selected];
        if (!ids.length) return;
        if (!this.session) this.session = { done: 0, total: this.list().length };
        ids.forEach((id, i) => setTimeout(() => this.decide(id, verb), i * 70));
        notify.success(`${ids.length} item${ids.length > 1 ? 's' : ''} ${verb === 'approve' ? 'approved' : 'rejected'}`);
        this.selected.clear();
    },

    /* -------------------------------------------------------- keyboard */

    move(delta) {
        const list = this.list();
        if (!list.length) return;
        this.cursor = Math.max(0, Math.min(this.cursor + delta, list.length - 1));
        this.paintCursor(true);
    },

    paintCursor(scroll) {
        const rows = $$('.lrow[data-id]');
        rows.forEach((r, i) => r.classList.toggle('is-cursor', i === this.cursor));
        if (scroll) rows[this.cursor]?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    },

    syncBulk() {
        const bulk = $('#ap-bulk');
        if (!bulk) return;
        const n = this.selected.size;
        bulk.classList.toggle('hide', !n);
        const label = $('#ap-bulk-n');
        if (label) label.textContent = `${n} selected`;
    },

    /* ---------------------------------------------------------- detail */

    openDetail(id) {
        const a = DB.approvals.find((x) => x.id === id);
        if (!a) return;

        drawer({
            title: a.title,
            sub: `${PLATFORM_LABEL[a.platform]} · ${a.kind} · ${a.due}`,
            wide: true,
            body: `
                <div class="row g2 mb4">${statusBadge(a.priority)}${statusBadge('Review')}</div>

                <div class="ai-note mb4">
                    <span class="ai-mark">${icon('sparkle')}</span>
                    <div>
                        <div class="ai-note__t">AI reasoning</div>
                        <div class="ai-note__d">${a.ai}</div>
                    </div>
                </div>

                <div class="eyebrow mb2">Preview</div>
                <div class="card card--line mb4">
                    <div class="row g2" style="padding:10px 12px;border-bottom:1px solid var(--border-soft)">
                        ${platformTile(a.platform, 'tile--sm')}
                        <span class="t-12 w-600">${DB.workspace.name}</span>
                        <span class="t-11 t-3 push">${a.schedule}</span>
                    </div>
                    <div style="aspect-ratio:16/9;background:var(--surface-2);display:grid;place-items:center">
                        ${icon('image', 't-3')}
                    </div>
                    <div style="padding:12px">
                        <p class="t-13" style="white-space:pre-wrap">${esc(a.caption)}</p>
                    </div>
                </div>

                <div class="eyebrow mb2">Details</div>
                <div class="card card--line mb4">
                    ${[['Platform', PLATFORM_LABEL[a.platform]], ['Format', a.kind],
                       ['Audience', a.audience], ['Schedule', a.schedule], ['Cost', a.credits + ' credits']]
                        .map(([k, v]) => `<div class="row between" style="padding:9px 12px;border-bottom:1px solid var(--border-soft)">
                            <span class="t-12 t-2">${k}</span><span class="t-12 w-500">${v}</span></div>`).join('')}
                </div>

                <div class="eyebrow mb2">Predicted performance</div>
                <div class="grid g-3" style="gap:8px">
                    ${[['Reach', a.predict.reach], ['Engagement', a.predict.engage], ['Conversions', a.predict.conv]]
                        .map(([k, v]) => `<div class="card card--line" style="padding:10px 12px">
                            <div class="t-11 t-3">${k}</div>
                            <div class="t-14 w-650 mt1 tabnum">${v}</div></div>`).join('')}
                </div>`,
            foot: `
                <button class="btn btn--ghost" id="ad-reject">${icon('x')}Reject</button>
                <button class="btn" id="ad-edit">${icon('edit')}Edit</button>
                <button class="btn btn--primary grow" id="ad-approve">${icon('check')}Approve & schedule</button>`,
            onMount: (el) => {
                el.querySelector('#ad-approve').onclick = (e) => runAction(e.currentTarget, {
                    busy: 'Approving…', done: 'Approved', ms: 420, restore: false,
                    onDone: () => setTimeout(() => { Overlay.close(); this.decide(id, 'approve'); }, 380),
                });
                el.querySelector('#ad-reject').onclick = () => {
                    confirmDialog({
                        title: 'Reject this item?',
                        message: 'It goes back to draft. The AI treats your rejection as a signal for the next batch.',
                        confirmLabel: 'Reject',
                        destructive: true,
                        onConfirm: () => { Overlay.close(); this.decide(id, 'reject'); },
                    });
                };
                el.querySelector('#ad-edit').onclick = () => { Overlay.close(); CreateFlow.open('post', a); };
            },
        });
    },
};

PAGES.approvals = {
    skeleton() {
        return `<div class="page__in">
            <div class="sk sk--title mb4" style="height:20px;width:180px"></div>
            <div class="card">${skeletonList(5)}</div></div>`;
    },

    render(params) {
        const A = Approvals;
        const items = A.list();
        const counts = {};
        ['All', 'Urgent', 'Content', 'Campaigns', 'Ads'].forEach((k) => (counts[k] = A.countFor(k)));
        const activeFilters = A.filter === 'All' ? 0 : 1;

        return `<div class="page__in">
            <div class="page__hd">
                <div>
                    <div class="page-title">Approvals</div>
                    <div class="page-sub">Review AI-generated work before it goes live.</div>
                </div>
                <div class="page__tools">
                    ${contextualAI('approvals')}
                    <button class="btn btn--sm" id="ap-filter">
                        ${icon('filter')}Filter${activeFilters ? ` · <b>${activeFilters}</b>` : ''}</button>
                    <button class="btn btn--sm" id="ap-sort">${icon('sort')}Due date</button>
                </div>
            </div>

            <div class="toolbar">
                <div class="chips" role="tablist">
                    ${Object.keys(counts).map((k) => `
                        <button class="chip ${A.filter === k ? 'is-on' : ''}" data-f="${k}" role="tab"
                            aria-selected="${A.filter === k}">${k}<span class="chip__n">${counts[k]}</span></button>`).join('')}
                </div>
                ${A.filter !== 'All' ? `<button class="link" id="ap-clearf">Clear filter</button>` : ''}
                <span class="push t-11 t-3 row g1 ${A.session ? '' : 'hide'}" id="ap-progress" aria-live="polite">
                    ${icon('check')}Reviewed <b>${A.session ? `${A.session.done} of ${A.session.total}` : ''}</b>
                </span>
            </div>

            <!-- bulk bar appears only with a selection -->
            <div class="card card--line row g3 mb3 bulkbar hide" id="ap-bulk" style="padding:8px 14px">
                <span class="t-13 w-600" id="ap-bulk-n">0 selected</span>
                <div class="push row g2">
                    <button class="btn btn--sm btn--ghost" id="ap-clear">Clear</button>
                    <button class="btn btn--sm" id="ap-bulk-reject">${icon('x')}Reject selected</button>
                    <button class="btn btn--sm btn--primary" id="ap-bulk-ok">${icon('check')}Approve selected</button>
                </div>
            </div>

            ${items.length ? `
            <section class="card">
                <div class="card__head">
                    <input type="checkbox" class="check ap-check" id="ap-all" aria-label="Select all">
                    <span class="sec-title" id="ap-count">${items.length} awaiting review</span>
                    <span class="t-11 t-3 push row g2 ap-hint">
                        <span class="kbd">A</span> approve
                        <span class="kbd">R</span> reject
                        <span class="kbd">J</span><span class="kbd">K</span> move
                    </span>
                </div>
                <div class="stagger">
                ${items.map((a, i) => `
                    <div class="lrow lrow--ap ${i === A.cursor ? 'is-cursor' : ''}" data-id="${a.id}" tabindex="0"
                        role="button" aria-label="${esc(a.title)}">
                        <input type="checkbox" class="check ap-check" data-sel="${a.id}" aria-label="Select ${esc(a.title)}">
                        <span class="ap-tile">${platformTile(a.platform)}</span>
                        <div class="ap-main grow" style="min-width:0">
                            <div class="row g2 wrap">
                                <span class="t-13 w-600 truncate">${a.title}</span>
                                ${statusBadge(a.priority)}
                            </div>
                            <div class="t-12 t-2 truncate mt1">${a.desc}</div>
                            <div class="row g2 mt2 ap-ai">
                                <span class="ai-mark">${icon('sparkle')}</span>
                                <span class="t-11 t-3 truncate">${a.ai}</span>
                            </div>
                        </div>
                        <div class="ap-meta col g1" style="align-items:flex-end;flex:none">
                            <span class="t-11 t-3">${a.due}</span>
                            <span class="t-11 t-3 row g1">${icon('eye')}${a.reach}</span>
                        </div>
                        <div class="ap-acts row g2" style="flex:none">
                            <button class="btn btn--sm" data-act="edit" data-id="${a.id}">Edit</button>
                            <button class="btn btn--sm btn--primary" data-act="approve" data-id="${a.id}">Approve</button>
                            <button class="iconbtn" data-act="more" data-id="${a.id}" aria-label="More actions">${icon('dots')}</button>
                        </div>
                    </div>`).join('')}
                </div>
            </section>`
            : A.filter === 'All'
                /*  Clearing the queue is the good outcome, so the assistant
                    shows up pleased rather than the page just going blank. */
                ? `<div class="state">
                        ${mascot('happy', 'mface--xl')}
                        <div class="state__t mt3">${A.session ? `All caught up — ${A.session.done} reviewed` : 'Nothing to approve'}</div>
                        <div class="state__d">${A.session
                            ? 'The queue is clear. New work lands here as the AI produces it.'
                            : 'Everything AI produced has been reviewed. New work will land here as it is generated.'}</div>
                        <div class="state__a">
                            <button class="btn btn--sm" onclick="App.go('planner')">${icon('calendar')}Open planner</button>
                            <button class="btn btn--sm btn--primary" onclick="App.createMenu()">${icon('plus')}Create something</button>
                        </div>
                   </div>`
                : emptyState({
                    ic: 'filter', accent: true,
                    title: `No ${A.filter.toLowerCase()} items`,
                    desc: 'Try a different filter, or clear it to see the full queue.',
                    action: `<button class="btn btn--sm" data-f="All">Clear filter</button>`,
                })}
        </div>`;
    },

    mount(host, params) {
        const A = Approvals;

        // Deep link: /approvals/:id opens straight into the detail drawer.
        if (params[0]) {
            const item = DB.approvals.find((x) => x.id === params[0]);
            if (item) setTimeout(() => A.openDetail(params[0]), 60);
            else notify.error('That approval no longer exists');
        }

        host.querySelectorAll('[data-f]').forEach((b) => {
            b.onclick = () => { A.filter = b.dataset.f; A.selected.clear(); A.cursor = 0; App.refresh(); };
        });
        host.querySelector('#ap-clearf')?.addEventListener('click', () => {
            A.filter = 'All'; A.cursor = 0; App.refresh();
        });

        host.querySelectorAll('.lrow[data-id]').forEach((row, i) => {
            row.onclick = (e) => {
                if (e.target.closest('button, input')) return;
                A.cursor = i;
                A.paintCursor();
                App.go('approvals/' + row.dataset.id);
            };
            row.onkeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); A.openDetail(row.dataset.id); }
            };
            row.onfocus = () => { A.cursor = i; A.paintCursor(); };
        });

        host.querySelectorAll('[data-sel]').forEach((cb) => {
            cb.checked = A.selected.has(cb.dataset.sel);
            cb.onchange = () => {
                cb.checked ? A.selected.add(cb.dataset.sel) : A.selected.delete(cb.dataset.sel);
                A.syncBulk();
            };
        });

        const all = host.querySelector('#ap-all');
        if (all) {
            all.onchange = () => {
                host.querySelectorAll('[data-sel]').forEach((cb) => {
                    cb.checked = all.checked;
                    cb.checked ? A.selected.add(cb.dataset.sel) : A.selected.delete(cb.dataset.sel);
                });
                A.syncBulk();
            };
        }

        host.querySelector('#ap-clear')?.addEventListener('click', () => { A.selected.clear(); App.refresh(); });
        host.querySelector('#ap-bulk-ok')?.addEventListener('click', () => A.bulk('approve'));
        host.querySelector('#ap-bulk-reject')?.addEventListener('click', () => {
            confirmDialog({
                title: `Reject ${A.selected.size} items?`,
                message: 'They return to draft and the AI treats each rejection as training signal.',
                confirmLabel: 'Reject all', destructive: true,
                onConfirm: () => A.bulk('reject'),
            });
        });

        host.querySelectorAll('[data-act]').forEach((b) => {
            b.onclick = (e) => {
                e.stopPropagation();
                const id = b.dataset.id;
                if (b.dataset.act === 'approve') return A.decide(id, 'approve', b);
                if (b.dataset.act === 'edit') return CreateFlow.open('post', DB.approvals.find((a) => a.id === id));
                menu(b, [
                    { label: 'Open details', icon: 'expand', on: () => A.openDetail(id) },
                    { label: 'Reschedule', icon: 'calendar', on: () => App.go('planner') },
                    { sep: true },
                    { label: 'Reject', icon: 'x', on: () => A.decide(id, 'reject') },
                ]);
            };
        });

        host.querySelector('#ap-filter')?.addEventListener('click', (e) => menu(e.currentTarget, [
            { label: 'Priority', heading: true },
            ...['Urgent', 'Content', 'Campaigns', 'Ads'].map((k) => ({
                label: k, icon: 'flag', active: A.filter === k,
                on: () => { A.filter = k; App.refresh(); },
            })),
            { sep: true },
            { label: 'Clear filter', icon: 'x', on: () => { A.filter = 'All'; App.refresh(); } },
        ]));

        host.querySelector('#ap-sort')?.addEventListener('click', (e) => menu(e.currentTarget,
            ['Due date', 'Priority', 'Newest', 'Platform'].map((s, i) => ({
                label: s, active: i === 0, on: () => notify.info(`Sorted by ${s.toLowerCase()}`),
            }))));

        A.syncBulk();

        /*  Rapid review from the keyboard. Decide, and the queue advances on
            its own — the hands never have to leave the home row.          */
        Keys.setScope({
            j: () => A.move(1),
            k: () => A.move(-1),
            a: () => {
                const item = A.at(A.cursor);
                if (item) A.decide(item.id, 'approve', document.querySelector(`[data-act="approve"][data-id="${item.id}"]`));
            },
            r: () => {
                const item = A.at(A.cursor);
                if (item) A.decide(item.id, 'reject');
            },
            e: () => {
                const item = A.at(A.cursor);
                if (item) CreateFlow.open('post', item);
            },
            enter: () => {
                const item = A.at(A.cursor);
                if (item) A.openDetail(item.id);
            },
        }, [
            ['A', 'Approve the focused item'],
            ['R', 'Reject the focused item'],
            ['E', 'Edit the focused item'],
            ['J', 'Next item'],
            ['K', 'Previous item'],
        ]);
    },
};
