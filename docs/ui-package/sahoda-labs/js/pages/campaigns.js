/*  Campaigns — list, an 8-step builder with an AI gate before launch,
    and a detail view. All three live on one route.                      */

const Campaigns = {
    filter: 'All',

    list() {
        return this.filter === 'All' ? DB.campaigns : DB.campaigns.filter((c) => c.status === this.filter);
    },
};

/* ------------------------------------------------------------- builder */

const Builder = {
    step: 0,
    STEPS: ['Objective', 'Audience', 'Channels', 'Budget', 'Creative', 'Schedule', 'AI Review', 'Launch'],
    state: { objective: '', audience: 'existing', channels: [], budget: 45000, days: 30, creative: 'ai', start: '2026-08-01' },

    render() {
        return `<div class="page__in">
            <div class="page__hd">
                <div>
                    <div class="row g2">
                        ${App.backLink('Campaigns', 'campaigns')}
                    </div>
                    <div class="page-title mt1">New campaign</div>
                    <div class="page-sub">Step ${this.step + 1} of ${this.STEPS.length} · ${this.STEPS[this.step]}</div>
                </div>
            </div>

            <div class="card card--pad mb4">
                <div class="steps">
                    ${this.STEPS.map((s, i) => `
                        ${i ? '<span class="step__line"></span>' : ''}
                        <div class="step ${i === this.step ? 'is-on' : ''} ${i < this.step ? 'is-done' : ''}">
                            <span class="step__n">${i < this.step ? '✓' : i + 1}</span>
                            <span class="step__l">${s}</span>
                        </div>`).join('')}
                </div>
            </div>

            <div class="split">
                <section class="card card--pad">${this.body()}</section>
                <aside class="card">
                    <div class="card__head"><span class="sec-title">Summary</span></div>
                    <div class="card__body col g3">
                        ${[['Objective', this.state.objective || '—'],
                           ['Channels', this.state.channels.length ? this.state.channels.map((c) => PLATFORM_LABEL[c]).join(', ') : '—'],
                           ['Budget', '₹' + this.state.budget.toLocaleString('en-IN')],
                           ['Duration', this.state.days + ' days'],
                           ['Starts', this.state.start]].map(([k, v]) => `
                            <div class="row between g3">
                                <span class="t-12 t-2">${k}</span>
                                <span class="t-12 w-500" style="text-align:right">${v}</span></div>`).join('')}
                        <div class="sep"></div>
                        <div class="row between">
                            <span class="t-12 t-2">Est. daily spend</span>
                            <span class="t-13 w-650 tabnum">₹${Math.round(this.state.budget / this.state.days).toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                </aside>
            </div>

            <div class="row g2 mt4">
                ${this.step > 0 ? `<button class="btn" id="b-back">${icon('left')}Back</button>` : ''}
                <div class="push row g2">
                    <button class="btn btn--ghost" id="b-cancel">Cancel</button>
                    ${this.step === this.STEPS.length - 1
                        ? `<button class="btn btn--primary" id="b-launch">${icon('send')}Launch campaign</button>`
                        : `<button class="btn btn--primary" id="b-next">Continue${icon('right')}</button>`}
                </div>
            </div>
        </div>`;
    },

    body() {
        const S = this.state;

        if (this.step === 0) {
            const objs = [['Awareness', 'eye', 'Get seen by new people'], ['Traffic', 'trend', 'Send visitors to your site'],
                          ['Engagement', 'heart' in UI_PATHS ? 'heart' : 'star', 'Drive likes, saves and comments'],
                          ['Leads', 'target', 'Collect enquiries'], ['Sales', 'money', 'Drive bookings and revenue']];
            return `<div class="sec-title mb3">What is this campaign for?</div>
                <div class="grid g-2 g-1-m" style="gap:10px">
                    ${objs.map(([o, ic, d]) => `
                        <button class="card card--pad row g3" data-o="${o}" style="text-align:left;${S.objective === o ? 'box-shadow:inset 0 0 0 1.5px var(--orange);background:var(--orange-06)' : ''}">
                            <span class="tile">${icon(ic)}</span>
                            <span class="grow"><span class="t-13 w-600" style="display:block">${o}</span>
                            <span class="t-11 t-3">${d}</span></span>
                        </button>`).join('')}
                </div>`;
        }

        if (this.step === 1) {
            return `<div class="sec-title mb3">Who should see it?</div>
                <div class="col g2 mb4">
                    ${[['existing', 'Use Brand Brain audience', `${DB.brand.aud.age} · ${DB.brand.aud.location}`],
                       ['lookalike', 'Lookalike of past converters', 'Built from 842 conversions in the last 90 days'],
                       ['custom', 'Define a custom audience', 'Set age, location and interests yourself']].map(([k, t, d]) => `
                        <button class="card card--pad row g3" data-a="${k}" style="text-align:left;${S.audience === k ? 'box-shadow:inset 0 0 0 1.5px var(--orange);background:var(--orange-06)' : ''}">
                            <span class="tile">${icon('users')}</span>
                            <span class="grow"><span class="t-13 w-600" style="display:block">${t}</span>
                            <span class="t-11 t-3">${d}</span></span>
                        </button>`).join('')}
                </div>
                <div class="ai-note">
                    <span class="ai-mark">${icon('sparkle')}</span>
                    <div><div class="ai-note__t">Estimated audience size</div>
                    <div class="ai-note__d">About 214,000 people match. That is wide enough to learn quickly without wasting spend.</div></div>
                </div>`;
        }

        if (this.step === 2) {
            const opts = ['instagram', 'facebook', 'linkedin', 'googleads', 'whatsapp'];
            return `<div class="sec-title mb3">Where should it run?</div>
                <div class="grid g-3 g-1-m" style="gap:8px">
                    ${opts.map((p) => `
                        <button class="card card--pad row g2" data-c="${p}" style="text-align:left;${S.channels.includes(p) ? 'box-shadow:inset 0 0 0 1.5px var(--orange);background:var(--orange-06)' : ''}">
                            ${brandIcon(p, 'b-ic')}<span class="t-13 w-500 grow">${PLATFORM_LABEL[p]}</span>
                            ${S.channels.includes(p) ? `<span class="ai-mark">${icon('check')}</span>` : ''}
                        </button>`).join('')}
                </div>`;
        }

        if (this.step === 3) {
            return `<div class="sec-title mb3">How much can it spend?</div>
                <div class="field mb4">
                    <label class="label">Total budget · ₹${S.budget.toLocaleString('en-IN')}</label>
                    <input type="range" class="slider" id="b-budget" min="5000" max="200000" step="1000" value="${S.budget}">
                    <div class="row between"><span class="hint">₹5,000</span><span class="hint">₹2,00,000</span></div>
                </div>
                <div class="field mb4">
                    <label class="label">Duration · ${S.days} days</label>
                    <input type="range" class="slider" id="b-days" min="7" max="90" step="1" value="${S.days}">
                </div>
                <div class="banner">${icon('info')}
                    <div><div class="banner__t">₹${Math.round(S.budget / S.days).toLocaleString('en-IN')} per day</div>
                    <div class="banner__d">Comparable campaigns returned 3.4x–4.8x at this level.</div></div>
                </div>`;
        }

        if (this.step === 4) {
            return `<div class="sec-title mb3">Creative</div>
                <div class="grid g-3 g-1-m" style="gap:10px">
                    ${[['ai', 'sparkle', 'Generate with AI', '6 credits'], ['assets', 'assets', 'Pick from assets', '8 available'],
                       ['upload', 'upload', 'Upload new', 'Up to 5 MB']].map(([k, ic, t, d]) => `
                        <button class="card card--pad col g2" data-cr="${k}" style="align-items:flex-start;text-align:left;${S.creative === k ? 'box-shadow:inset 0 0 0 1.5px var(--orange);background:var(--orange-06)' : ''}">
                            <span class="tile">${icon(ic)}</span>
                            <span class="t-13 w-600">${t}</span><span class="t-11 t-3">${d}</span>
                        </button>`).join('')}
                </div>`;
        }

        if (this.step === 5) {
            return `<div class="sec-title mb3">When does it run?</div>
                <div class="grid g-2 g-1-m">
                    <div class="field"><label class="label">Start date</label>
                        <input class="input" type="date" id="b-start" value="${S.start}"></div>
                    <div class="field"><label class="label">Daily schedule</label>
                        <select class="select"><option>All day</option><option selected>8 AM – 9 PM</option><option>Weekends only</option></select></div>
                </div>
                <div class="ai-note mt4">
                    <span class="ai-mark">${icon('bulb')}</span>
                    <div><div class="ai-note__t">Dayparting recommended</div>
                    <div class="ai-note__d">Conversion rate between 1–5 AM is 0.4%. Restricting hours saves roughly ₹6,200.</div></div>
                </div>`;
        }

        if (this.step === 6) {
            const checks = [
                ['Audience defined', true, `${S.audience === 'existing' ? 'Brand Brain audience' : 'Custom'} · ~214K people`],
                ['Budget appropriate', true, `₹${Math.round(S.budget / S.days).toLocaleString('en-IN')}/day is within a healthy range`],
                ['Creative ready', true, '3 variants prepared'],
                ['Channels connected', S.channels.length > 0, S.channels.length ? 'All selected channels are authorised' : 'No channels selected yet'],
                ['Improve CTA', false, 'The call to action repeats the headline — make it specific'],
            ];
            const score = Math.round((checks.filter((c) => c[1]).length / checks.length) * 100);
            return `<div class="row g3 mb4">
                    ${ring(score, { size: 56, stroke: 5, label: score })}
                    <div><div class="sec-title">Campaign health</div>
                    <div class="t-12 t-2">AI checked this campaign against ${checks.length} readiness rules.</div></div>
                </div>
                <div class="col">
                    ${checks.map(([t, ok, d]) => `
                        <div class="row-t g3" style="padding:11px 0;border-bottom:1px solid var(--border-soft)">
                            <span class="act__ic ${ok ? '' : 'act__ic--ai'}" style="margin-top:1px">${icon(ok ? 'check' : 'alert')}</span>
                            <div class="grow"><div class="t-13 w-600">${t}</div>
                            <div class="t-12 t-2 mt1">${d}</div></div>
                            ${ok ? '' : '<button class="btn btn--sm" data-fix>Fix</button>'}
                        </div>`).join('')}
                </div>`;
        }

        return `<div class="sec-title mb3">Ready to launch</div>
            <p class="t-13 t-2 mb4">The campaign goes live on ${S.start}. AI monitors performance and will flag anything that needs your decision — it will not change budget without asking.</p>
            <div class="banner banner--alert">${icon('alert')}
                <div><div class="banner__t">This spends real money</div>
                <div class="banner__d">₹${S.budget.toLocaleString('en-IN')} over ${S.days} days across ${S.channels.length || 0} channel${S.channels.length === 1 ? '' : 's'}.</div></div>
            </div>`;
    },

    mount(host) {
        host.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => { this.state.objective = b.dataset.o; App.refresh(); }));
        host.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { this.state.audience = b.dataset.a; App.refresh(); }));
        host.querySelectorAll('[data-cr]').forEach((b) => (b.onclick = () => { this.state.creative = b.dataset.cr; App.refresh(); }));
        host.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => {
            const i = this.state.channels.indexOf(b.dataset.c);
            i > -1 ? this.state.channels.splice(i, 1) : this.state.channels.push(b.dataset.c);
            App.refresh();
        }));
        host.querySelector('#b-budget')?.addEventListener('input', (e) => { this.state.budget = +e.target.value; App.refresh(); });
        host.querySelector('#b-days')?.addEventListener('input', (e) => { this.state.days = +e.target.value; App.refresh(); });
        host.querySelector('#b-start')?.addEventListener('change', (e) => (this.state.start = e.target.value));
        host.querySelector('[data-fix]')?.addEventListener('click', () => toast('Opened CTA for editing', { icon: 'wand' }));

        host.querySelector('#b-back')?.addEventListener('click', () => { this.step--; App.refresh(); });
        host.querySelector('#b-cancel')?.addEventListener('click', () => { this.step = 0; App.go('campaigns'); });
        host.querySelector('#b-next')?.addEventListener('click', () => {
            if (this.step === 0 && !this.state.objective) return toast('Pick an objective', { icon: 'alert' });
            if (this.step === 2 && !this.state.channels.length) return toast('Pick at least one channel', { icon: 'alert' });
            this.step++;
            App.refresh();
        });
        host.querySelector('#b-launch')?.addEventListener('click', () => {
            confirmDialog({
                title: 'Launch this campaign?',
                message: `₹${this.state.budget.toLocaleString('en-IN')} will be committed across ${this.state.days} days. You can pause at any time.`,
                confirmLabel: 'Launch',
                onConfirm: () => {
                    // Launching is real, multi-part work — it reports each part
                    // rather than freezing on a spinner.
                    AITask.modal(
                        ['Validating channels', 'Creating ad sets', 'Uploading creative', 'Setting budget pacing', 'Going live'],
                        {
                            title: 'Launching campaign',
                            sub: this.state.objective + ' · ' + this.state.channels.length + ' channels',
                            stepMs: 620,
                            done: {
                                title: 'Campaign is live',
                                desc: 'AI will monitor pacing and flag anything that needs your decision.',
                                action: {
                                    label: 'Review campaign',
                                    on: () => App.go('campaigns/' + newId),
                                },
                                on: () => {
                                    DB.activity.unshift({ t: `Launched ${this.state.objective} Campaign`, ago: 'just now', kind: 'done' });
                                    notify.success('Campaign launched');
                                },
                            },
                        });

                    const newId = 'c' + (DB.campaigns.length + 1);
                    DB.campaigns.unshift({
                        id: newId, name: this.state.objective + ' Campaign', status: 'Active',
                        objective: this.state.objective, channels: this.state.channels, dates: 'Starts ' + this.state.start,
                        budget: this.state.budget, spent: 0, reach: '—', conv: 0, revenue: '—', roas: '—', health: 80,
                    });
                    this.step = 0;
                },
            });
        });
    },
};

/* ---------------------------------------------------------------- page */

PAGES.campaigns = {
    skeleton() {
        return `<div class="page__in">
            <div class="sk sk--title mb4" style="height:20px;width:170px"></div>
            ${skeletonCards(3)}</div>`;
    },

    render(params) {
        if (params[0] === 'new') return Builder.render();
        if (params[0]) return this.detail(params[0]);

        const items = Campaigns.list();
        const counts = { All: DB.campaigns.length };
        ['Active', 'Draft', 'Completed'].forEach((s) => (counts[s] = DB.campaigns.filter((c) => c.status === s).length));

        return `<div class="page__in">
            <div class="page__hd">
                <div>
                    <div class="page-title">Campaigns</div>
                    <div class="page-sub">Plan, launch and optimize campaigns.</div>
                </div>
                <div class="page__tools">
                    ${contextualAI("campaigns")}
                    <button class="btn btn--sm" id="cp-filter">${icon('filter')}Filter</button>
                    <a class="btn btn--sm btn--primary" href="#/campaigns/new">${icon('plus')}Create campaign</a>
                </div>
            </div>

            <div class="toolbar">
                <div class="chips">
                    ${Object.keys(counts).map((k) => `
                        <button class="chip ${Campaigns.filter === k ? 'is-on' : ''}" data-f="${k}">
                            ${k}<span class="chip__n">${counts[k]}</span></button>`).join('')}
                </div>
            </div>

            ${items.length ? `<div class="grid g-3">
                ${items.map((c) => `
                    <article class="card card--int" data-c="${c.id}">
                        <div class="card__head">
                            <span class="sec-title truncate grow">${c.name}</span>
                            ${statusBadge(c.status)}
                        </div>
                        <div class="card__body col g3">
                            <div class="row between">
                                <div class="row g1">${c.channels.map((ch) => platformTile(ch, 'tile--sm')).join('')}</div>
                                <span class="t-11 t-3">${c.dates}</span>
                            </div>
                            <div>
                                <div class="row between mb2">
                                    <span class="t-11 t-3">Spent</span>
                                    <span class="t-11 w-600 tabnum">₹${c.spent.toLocaleString('en-IN')} / ₹${c.budget.toLocaleString('en-IN')}</span>
                                </div>
                                ${shareBar(Math.round((c.spent / c.budget) * 100))}
                            </div>
                            <div class="grid g-3" style="gap:8px">
                                ${[['Reach', c.reach], ['Conv.', c.conv || '—'], ['ROAS', c.roas]].map(([k, v]) => `
                                    <div><div class="t-11 t-3">${k}</div>
                                    <div class="t-13 w-600 tabnum">${v}</div></div>`).join('')}
                            </div>
                        </div>
                        <div class="card__foot row g2">
                            <span class="t-11 t-3 row g1">${icon('sparkle')}Health ${c.health}</span>
                            <div class="push row g1">
                                <button class="btn btn--sm" data-open="${c.id}">Open</button>
                                <button class="iconbtn" data-more="${c.id}">${icon('dots')}</button>
                            </div>
                        </div>
                    </article>`).join('')}
            </div>`
            : emptyState({
                ic: 'campaigns', accent: true,
                title: `No ${Campaigns.filter === 'All' ? '' : Campaigns.filter.toLowerCase() + ' '}campaigns yet`,
                desc: 'Create your first campaign and let Sahoda AI handle the execution — audience, creative, budget pacing and reporting.',
                action: `<a class="btn btn--primary btn--sm" href="#/campaigns/new">${icon('plus')}Create campaign</a>`,
            })}
        </div>`;
    },

    detail(id) {
        const c = DB.campaigns.find((x) => x.id === id);
        if (!c) {
            return `<div class="page__in">${errorState({
                title: 'Campaign not found',
                desc: 'It may have been deleted, or the link is out of date.',
                action: `<a class="btn btn--sm" href="#/campaigns">Back to campaigns</a>`,
            })}</div>`;
        }

        return `<div class="page__in">
            <div class="page__hd">
                <div>
                    ${App.backLink('Campaigns', 'campaigns')}
                    <div class="row g2 mt1">
                        <span class="page-title">${c.name}</span>
                        ${statusBadge(c.status)}
                    </div>
                    <div class="page-sub">${c.objective} · ${c.dates}</div>
                </div>
                <div class="page__tools">
                    <button class="btn btn--sm" id="cd-pause">${icon(c.status === 'Active' ? 'pause' : 'play')}${c.status === 'Active' ? 'Pause' : 'Resume'}</button>
                    <button class="btn btn--sm" id="cd-dup">${icon('copy')}Duplicate</button>
                    <button class="btn btn--sm btn--primary" id="cd-edit">${icon('edit')}Edit</button>
                </div>
            </div>

            <div class="card mb4">
                <div class="row" style="align-items:stretch;overflow-x:auto">
                    ${[['Spend', '₹' + c.spent.toLocaleString('en-IN')], ['Reach', c.reach], ['Clicks', '12.4K'],
                       ['Conversions', c.conv || '—'], ['Revenue', c.revenue], ['ROAS', c.roas]].map(([k, v]) => `
                        <div class="metric grow" style="min-width:110px">
                            <div class="metric__l">${k}</div>
                            <div class="metric__v">${v}</div>
                        </div>`).join('')}
                </div>
            </div>

            <div class="split">
                <div class="col g4">
                    <section class="card">
                        <div class="card__head">
                            <span class="sec-title">Performance over time</span>
                            <span class="badge badge--soft push">Revenue</span>
                        </div>
                        <div class="card__body">${lineChart(DB.revenueSeries, ['1 Jul', '3', '5', '7', '9', '11', '13', '15', '17', '19', '21', '23', '25', '27'])}</div>
                    </section>

                    <section class="card">
                        <div class="card__head"><span class="sec-title">Channel performance</span></div>
                        <div class="table-wrap">
                            <table class="table">
                                <thead><tr><th>Channel</th><th class="num">Reach</th><th class="num">Eng.</th><th class="num">Conv.</th><th class="num">Revenue</th></tr></thead>
                                <tbody>${DB.channelPerf.filter((p) => c.channels.includes(p.k)).map((p) => `
                                    <tr><td><div class="row g2">${platformTile(p.k, 'tile--sm')}<span class="t-13">${PLATFORM_LABEL[p.k]}</span></div></td>
                                    <td class="num">${p.reach}</td><td class="num">${p.eng}</td>
                                    <td class="num">${p.conv}</td><td class="num w-600">${p.rev}</td></tr>`).join('')
                                    || `<tr><td colspan="5" class="t-12 t-3" style="text-align:center;padding:20px">No channel data yet</td></tr>`}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section class="card">
                        <div class="card__head"><span class="sec-title">Creative performance</span></div>
                        <div class="card__body grid g-3">
                            ${['Variant A', 'Variant B', 'Variant C'].map((v, i) => `
                                <div class="card card--line">
                                    <div style="aspect-ratio:4/3;background:var(--surface-2);display:grid;place-items:center">${icon('image', 't-3')}</div>
                                    <div style="padding:10px">
                                        <div class="row between"><span class="t-12 w-600">${v}</span>
                                        ${i === 1 ? '<span class="badge badge--active">Best</span>' : ''}</div>
                                        <div class="t-11 t-3 mt1">CTR ${[2.1, 3.4, 1.8][i]}% · ${[210, 388, 144][i]} conv.</div>
                                    </div>
                                </div>`).join('')}
                        </div>
                    </section>
                </div>

                <aside class="col g4">
                    <section class="card">
                        <div class="card__head">
                            <span class="ai-mark">${icon('sparkle')}</span>
                            <span class="sec-title">AI insights</span>
                        </div>
                        <div class="card__body col g3">
                            ${DB.insights.slice(0, 2).map((i) => `
                                <div>
                                    <div class="t-12 w-600">${i.t}</div>
                                    <div class="t-12 t-2 mt1">${i.d}</div>
                                    <div class="ai-note mt2">
                                        <span class="ai-mark">${icon('bulb')}</span>
                                        <div class="ai-note__d">${i.rec}</div>
                                    </div>
                                    <button class="btn btn--sm btn--primary mt2" data-apply>${i.act}</button>
                                </div>`).join('<div class="sep"></div>')}
                        </div>
                    </section>

                    <section class="card">
                        <div class="card__head"><span class="sec-title">Campaign health</span></div>
                        <div class="card__body row g3">
                            ${ring(c.health, { size: 52, stroke: 5, label: c.health })}
                            <div><div class="t-13 w-600">${c.health >= 85 ? 'Healthy' : c.health >= 60 ? 'Needs attention' : 'At risk'}</div>
                            <div class="t-12 t-2">Pacing, creative freshness and audience overlap all checked hourly.</div></div>
                        </div>
                    </section>
                </aside>
            </div>
        </div>`;
    },

    mount(host, params) {
        if (params[0] === 'new') return Builder.mount(host);

        if (params[0]) {
            host.querySelector('#cd-pause')?.addEventListener('click', () => {
                const c = DB.campaigns.find((x) => x.id === params[0]);
                c.status = c.status === 'Active' ? 'Draft' : 'Active';
                App.refresh();
                toast(`Campaign ${c.status === 'Active' ? 'resumed' : 'paused'}`);
            });
            host.querySelector('#cd-dup')?.addEventListener('click', () => toast('Campaign duplicated'));
            host.querySelector('#cd-edit')?.addEventListener('click', () => App.go('campaigns/new'));
            host.querySelectorAll('[data-apply]').forEach((b) => (b.onclick = () => {
                b.textContent = 'Applied';
                b.setAttribute('aria-disabled', 'true');
                toast('Recommendation applied', { icon: 'sparkle' });
            }));
            return;
        }

        host.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { Campaigns.filter = b.dataset.f; App.refresh(); }));
        host.querySelectorAll('[data-c]').forEach((el) => (el.onclick = (e) => {
            if (e.target.closest('[data-more]')) return;
            App.go('campaigns/' + el.dataset.c);
        }));
        host.querySelectorAll('[data-more]').forEach((b) => (b.onclick = (e) => {
            e.stopPropagation();
            const id = b.dataset.more;
            menu(b, [
                { label: 'Open', icon: 'expand', on: () => App.go('campaigns/' + id) },
                { label: 'Edit', icon: 'edit', on: () => App.go('campaigns/new') },
                { label: 'Duplicate', icon: 'copy', on: () => toast('Campaign duplicated') },
                { sep: true },
                { label: 'Pause', icon: 'pause', on: () => toast('Campaign paused') },
            ]);
        }));
        host.querySelector('#cp-filter')?.addEventListener('click', (e) => menu(e.currentTarget, [
            { label: 'Objective', heading: true },
            ...['Awareness', 'Traffic', 'Leads', 'Sales'].map((o) => ({ label: o, icon: 'target', on: () => toast(`Filtered to ${o}`) })),
        ]));
    },
};
