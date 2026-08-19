/*  Analytics — what happened, and what the AI thinks you should do next. */

const Analytics = {
    metric: 'Revenue',
    range: 'Last 30 days',
    channel: 'All channels',

    series() {
        return { Revenue: DB.revenueSeries, Reach: DB.reachSeries, Conversions: DB.convSeries, Engagement: DB.engageSeries }[this.metric];
    },

    /** Formats a raw series value the way the selected metric reads. */
    format(v) {
        if (this.metric === 'Revenue') return `₹${(v * 1000).toLocaleString('en-IN')}`;
        if (this.metric === 'Engagement') return `${v / 10}%`;
        return `${(v * 100).toLocaleString('en-IN')}`;
    },

    /*  Swap the series without re-rendering the page: the old line fades,
        the new one draws. Re-rendering would restart every other card too. */
    swapMetric(m, host) {
        this.metric = m;
        host.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('is-on', b.dataset.m === m));
        const box = host.querySelector('#an-chart');
        if (!box) return;
        box.style.opacity = '0';
        setTimeout(() => {
            box.innerHTML = lineChart(this.series(), LABELS);
            box.style.opacity = '1';
            PAGES.analytics.bindChart(box);
        }, reducedMotion() ? 0 : 130);
    },
};

const LABELS = ['1', '3', '5', '7', '9', '11', '13', '15', '17', '19', '21', '23', '25', '27'];

PAGES.analytics = {
    skeleton() {
        return `<div class="page__in">
            <div class="sk sk--title mb4" style="height:20px;width:150px"></div>
            ${skeletonCards(5)}
            <div class="mt4 sk sk--block" style="height:260px"></div></div>`;
    },

    render() {
        return `<div class="page__in">
            <div class="page__hd">
                <div>
                    <div class="page-title">Analytics</div>
                    <div class="page-sub">Understand what is working.</div>
                </div>
                <div class="page__tools">
                    ${contextualAI('analytics')}
                    <button class="btn btn--sm" id="an-range">${icon('calendar')}${Analytics.range} ${icon('down')}</button>
                    <button class="btn btn--sm" id="an-channel">${icon('filter')}${Analytics.channel} ${icon('down')}</button>
                    <button class="btn btn--sm" id="an-export">${icon('download')}Export</button>
                </div>
            </div>

            <!-- KPI row -->
            <div class="card mb4">
                <div class="row" style="align-items:stretch;overflow-x:auto">
                    ${DB.metrics.map((m) => `
                        <div class="metric grow" style="min-width:132px">
                            <div class="metric__l">${m.label}</div>
                            <div class="row g2" style="align-items:baseline">
                                <span class="metric__v">${m.value}</span>${deltaTag(m.delta, m.dir)}
                            </div>
                            <div class="metric__spark ${m.dir === 'up' ? 't-accent' : 't-2'}">${sparkline(m.spark)}</div>
                        </div>`).join('')}
                </div>
            </div>

            <div class="split">
                <div class="col g4">
                    <!-- main chart -->
                    <section class="card">
                        <div class="card__head">
                            <span class="sec-title">Performance over time</span>
                            <div class="seg push">
                                ${['Revenue', 'Reach', 'Conversions', 'Engagement'].map((m) => `
                                    <button class="seg__i ${Analytics.metric === m ? 'is-on' : ''}" data-m="${m}">${m}</button>`).join('')}
                            </div>
                        </div>
                        <div class="card__body">
                            <div id="an-chart" style="transition:opacity 130ms var(--ease)">
                                ${lineChart(Analytics.series(), LABELS)}
                            </div>
                            <div class="t-11 t-3 mt2 row g1">${icon('info')}Hover a point for detail · click to open the campaigns behind it</div>
                        </div>
                    </section>

                    <!-- channel performance -->
                    <section class="card">
                        <div class="card__head">
                            <span class="sec-title">Channel performance</span>
                            <span class="t-11 t-3 push">Share of revenue</span>
                        </div>
                        <div class="table-wrap">
                            <table class="table">
                                <thead><tr><th>Channel</th><th class="num">Reach</th><th class="num">Engagement</th>
                                    <th class="num">Conversions</th><th class="num">Revenue</th><th style="width:120px">Share</th></tr></thead>
                                <tbody>
                                    ${DB.channelPerf.map((p) => `
                                        <tr data-ch="${p.k}" style="cursor:pointer">
                                            <td><div class="row g2">${platformTile(p.k, 'tile--sm')}<span class="t-13 w-500">${PLATFORM_LABEL[p.k]}</span></div></td>
                                            <td class="num tabnum">${p.reach}</td>
                                            <td class="num tabnum">${p.eng}</td>
                                            <td class="num tabnum">${p.conv}</td>
                                            <td class="num tabnum w-600">${p.rev}</td>
                                            <td><div class="row g2">${shareBar(p.share)}<span class="t-11 t-3 tabnum" style="width:26px">${p.share}%</span></div></td>
                                        </tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>

                <!-- AI insights: the point of the page -->
                <aside class="col g4">
                    <section class="card">
                        <div class="card__head">
                            <span class="ai-mark">${icon('sparkle')}</span>
                            <span class="sec-title">AI insights</span>
                            <span class="count push">${DB.insights.length}</span>
                        </div>
                        <div class="card__body col g4">
                            ${DB.insights.map((i, n) => `
                                <div data-ins="${n}">
                                    <div class="t-13 w-600">${i.t}</div>
                                    <div class="t-12 t-2 mt1">${i.d}</div>
                                    <div class="ai-note mt2">
                                        <span class="ai-mark">${icon('bulb')}</span>
                                        <div><div class="ai-note__t">Recommendation</div>
                                        <div class="ai-note__d">${i.rec}</div></div>
                                    </div>
                                    <div class="row g2 mt2">
                                        <button class="btn btn--sm btn--primary" data-apply="${n}">${i.act}</button>
                                        <button class="btn btn--sm btn--ghost" data-why="${n}">Why?</button>
                                    </div>
                                    <div class="ai-sig mt2">${icon('sparkle')}Generated by Sahoda AI · 92% confidence</div>
                                </div>`).join('<div class="sep"></div>')}
                        </div>
                    </section>

                    <section class="card">
                        <div class="card__head"><span class="sec-title">Best performing</span></div>
                        <div class="card__body col g3">
                            ${[['Whitening launch reel', 'Instagram', '18.4K reach'],
                               ['Corporate plans article', 'LinkedIn', '4.2K reach'],
                               ['Weekend offer broadcast', 'WhatsApp', '31% reply rate']].map(([t, ch, m]) => `
                                <div class="row g3">
                                    <span class="tile tile--sm">${icon('image')}</span>
                                    <div class="grow" style="min-width:0">
                                        <div class="t-12 w-600 truncate">${t}</div>
                                        <div class="t-11 t-3">${ch} · ${m}</div>
                                    </div>
                                </div>`).join('')}
                        </div>
                    </section>
                </aside>
            </div>
        </div>`;
    },

    /*  Hover readout + drill-down. A spike in revenue should be one click
        away from the campaigns that caused it, or the chart is decoration. */
    bindChart(box) {
        bindChartTips(box, {
            series: Analytics.series(),
            labels: LABELS,
            format: (v) => Analytics.format(v),
            compare: 'Click to see campaigns',
        });
        box.querySelectorAll('.chart-hit').forEach((hit) => {
            const open = () => {
                const i = +hit.dataset.i;
                drawer({
                    title: `${Analytics.metric} on Jul ${LABELS[i]}`,
                    sub: `${Analytics.format(Analytics.series()[i])} · ${Analytics.range.toLowerCase()}`,
                    body: `<div class="eyebrow mb2">Campaigns running that day</div>
                        <div class="card card--line mb4">
                            ${DB.campaigns.filter((c) => c.status === 'Active').map((c) => `
                                <div class="lrow" data-cid="${c.id}">
                                    <div class="row g1">${c.channels.map((ch) => platformTile(ch, 'tile--sm')).join('')}</div>
                                    <div class="grow"><div class="t-13 w-600">${c.name}</div>
                                    <div class="t-11 t-3">${c.objective} · ${c.dates}</div></div>
                                    <span class="t-12 w-600 tabnum">${c.revenue}</span>
                                    ${icon('right', 't-3')}
                                </div>`).join('')}
                        </div>
                        <div class="ai-note">
                            <span class="ai-mark">${icon('sparkle')}</span>
                            <div><div class="ai-note__t">What moved it</div>
                            <div class="ai-note__d">The Whitening Launch reel published that morning carried 62% of the lift.</div></div>
                        </div>`,
                    onMount(el) {
                        el.querySelectorAll('[data-cid]').forEach((r) => (r.onclick = () => {
                            Overlay.close();
                            App.go('campaigns/' + r.dataset.cid);
                        }));
                    },
                });
            };
            hit.onclick = open;
            hit.onkeydown = (e) => { if (e.key === 'Enter') open(); };
        });
    },

    mount(host) {
        host.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => Analytics.swapMetric(b.dataset.m, host)));

        const box = host.querySelector('#an-chart');
        if (box) this.bindChart(box);

        host.querySelector('#an-range').onclick = (e) => menu(e.currentTarget,
            ['Last 7 days', 'Last 30 days', 'Last 90 days', 'This year', 'Custom range'].map((r) => ({
                label: r, active: r === Analytics.range,
                on: () => { Analytics.range = r; App.refresh(); notify.info(`Showing ${r.toLowerCase()}`); },
            })));

        host.querySelector('#an-channel').onclick = (e) => menu(e.currentTarget, [
            { label: 'All channels', icon: 'globe', active: Analytics.channel === 'All channels',
              on: () => { Analytics.channel = 'All channels'; App.refresh(); } },
            { sep: true },
            ...DB.channelPerf.map((p) => ({
                label: PLATFORM_LABEL[p.k], icon: 'globe', active: Analytics.channel === PLATFORM_LABEL[p.k],
                on: () => { Analytics.channel = PLATFORM_LABEL[p.k]; App.refresh(); },
            })),
        ]);

        host.querySelector('#an-export').onclick = (e) => runAction(e.currentTarget, {
            busy: 'Preparing…', done: 'Exported',
            onDone: () => notify.success('Report exported as CSV'),
        });

        /*  Applying a recommendation is real work, so it reports real work:
            AI steps, then a durable applied state with an undo path.      */
        host.querySelectorAll('[data-apply]').forEach((b) => (b.onclick = () => {
            const ins = DB.insights[+b.dataset.apply];
            runAction(b, {
                busy: 'Applying…', done: 'Applied', ms: 700, restore: false,
                onDone: () => {
                    DB.activity.unshift({ t: `Applied: ${ins.rec}`, ago: 'just now', kind: 'ai' });
                    notify.ai('Recommendation applied', {
                        action: { label: 'Undo', on: () => { App.refresh(); notify.info('Reverted'); } },
                    });
                },
            });
        }));

        host.querySelectorAll('[data-why]').forEach((b) => (b.onclick = () => {
            const i = DB.insights[+b.dataset.why];
            drawer({
                title: 'Why this recommendation',
                sub: i.t,
                body: `<div class="ai-note mb4"><span class="ai-mark">${icon('sparkle')}</span>
                        <div><div class="ai-note__t">Recommendation</div><div class="ai-note__d">${i.rec}</div></div></div>
                    <div class="eyebrow mb2">Evidence</div>
                    <div class="card card--line mb4">
                        ${[['Sample size', '4,182 sessions'], ['Confidence', '92%'], ['Window', 'Last 30 days'], ['Compared against', 'Prior 30 days']]
                            .map(([k, v]) => `<div class="row between" style="padding:9px 12px;border-bottom:1px solid var(--border-soft)">
                                <span class="t-12 t-2">${k}</span><span class="t-12 w-500">${v}</span></div>`).join('')}
                    </div>
                    <div class="eyebrow mb2">What changes if you apply it</div>
                    <p class="t-13 t-2">${i.d} Applying this shifts budget without exceeding your monthly cap, and can be reverted for 30 days.</p>`,
                foot: `<button class="btn" data-close>Close</button>
                       <button class="btn btn--primary grow" onclick="Overlay.close();toast('Recommendation applied')">${i.act}</button>`,
            });
        }));

        host.querySelectorAll('[data-ch]').forEach((row) => (row.onclick = () => {
            const p = DB.channelPerf.find((x) => x.k === row.dataset.ch);
            drawer({
                title: PLATFORM_LABEL[p.k],
                sub: 'Channel performance · last 30 days',
                body: `<div class="grid g-2 mb4" style="gap:8px">
                        ${[['Reach', p.reach], ['Engagement', p.eng], ['Conversions', p.conv], ['Revenue', p.rev]].map(([k, v]) => `
                            <div class="card card--line" style="padding:10px 12px">
                                <div class="t-11 t-3">${k}</div><div class="t-16 w-650 mt1 tabnum">${v}</div></div>`).join('')}
                    </div>
                    <div class="eyebrow mb2">Trend</div>
                    <div class="card card--line" style="padding:12px">${lineChart(DB.reachSeries, ['1', '5', '9', '13', '17', '21', '25'], { h: 160 })}</div>`,
                foot: `<button class="btn" data-close>Close</button>
                       <button class="btn btn--primary grow" onclick="Overlay.close();App.go('campaigns')">View campaigns</button>`,
            });
        }));
    },
};
