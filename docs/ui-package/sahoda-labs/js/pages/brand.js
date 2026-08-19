/*  Brand Brain — what the system knows about the brand. Every section is
    editable, because this is the input that makes the AI output good.   */

const BRAND_TABS = [
    { k: 'overview', label: 'Overview' },
    { k: 'identity', label: 'Identity' },
    { k: 'voice', label: 'Voice & Tone' },
    { k: 'audience', label: 'Audience' },
    { k: 'competitors', label: 'Competitors' },
    { k: 'knowledge', label: 'Knowledge' },
];

PAGES.brand = {
    skeleton() {
        return `<div class="page__in">
            <div class="sk sk--title mb4" style="height:20px;width:170px"></div>
            ${skeletonCards(3)}</div>`;
    },

    render(params) {
        const tab = params[0] && BRAND_TABS.some((t) => t.k === params[0]) ? params[0] : 'overview';
        const B = DB.brand;

        return `<div class="page__in">
            <div class="page__hd">
                <div>
                    <div class="page-title">Brand Brain</div>
                    <div class="page-sub">What Sahoda knows about your brand — and uses in everything it writes.</div>
                </div>
                <div class="page__tools">
                    ${contextualAI("brand")}
                    <button class="btn btn--sm" id="bb-export">${icon('download')}Export</button>
                    <button class="btn btn--sm btn--primary" id="bb-train">${icon('sparkle')}Retrain</button>
                </div>
            </div>

            <div class="utabs mb4">
                ${BRAND_TABS.map((t) => `<a class="utabs__i ${tab === t.k ? 'is-on' : ''}" href="#/brand/${t.k}">${t.label}</a>`).join('')}
            </div>

            ${this[tab](B)}
        </div>`;
    },

    overview(B) {
        const sections = [
            ['Brand identity', 100, 'Logo, colours, typography and positioning are complete.', 'identity'],
            ['Voice & tone', 95, 'Four traits defined with 12 approved examples.', 'voice'],
            ['Audience', 90, 'Primary audience defined. Secondary audience is missing.', 'audience'],
            ['Competitors', 88, `${B.competitors} tracked, refreshed 4 hours ago.`, 'competitors'],
            ['Knowledge', 84, `${B.docs} documents indexed, 1 pending.`, 'knowledge'],
        ];

        return `<div class="split">
            <div class="col g4">
                <section class="card">
                    <div class="card__head"><span class="sec-title">Brand completeness</span>
                        <span class="badge badge--active push">${B.completeness}%</span></div>
                    <div class="card__body">
                        ${shareBar(B.completeness)}
                        <p class="t-12 t-2 mt3">The more complete this is, the less you have to correct. Sections below feed directly into every generated post, ad and reply.</p>
                    </div>
                </section>

                <section class="card">
                    <div class="card__head"><span class="sec-title">Sections</span></div>
                    ${sections.map(([t, pct, d, k]) => `
                        <a class="lrow" href="#/brand/${k}">
                            <div class="grow">
                                <div class="row g2"><span class="t-13 w-600">${t}</span>
                                <span class="t-11 t-3">${pct}%</span></div>
                                <div class="t-12 t-2 mt1">${d}</div>
                                <div class="bar mt2" style="max-width:220px"><div class="bar__f" style="width:${pct}%"></div></div>
                            </div>
                            ${icon('right', 't-3')}
                        </a>`).join('')}
                </section>
            </div>

            <aside class="col g4">
                <section class="card">
                    <div class="card__head"><span class="sec-title">At a glance</span></div>
                    <div class="card__body grid g-2" style="gap:8px">
                        ${[['Brand Voice', B.voice], ['Writing Style', B.style], ['Primary Color', B.color],
                           ['Audience', B.audience], ['Competitors', B.competitors + ' tracked'], ['Knowledge', B.docs + ' docs']]
                            .map(([l, v]) => `<div class="bb"><div class="bb__l">${l}</div><div class="bb__v truncate">${v}</div></div>`).join('')}
                    </div>
                </section>
                <section class="card">
                    <div class="card__head"><span class="ai-mark">${icon('sparkle')}</span><span class="sec-title">Suggested improvement</span></div>
                    <div class="card__body">
                        <div class="t-13 w-600">Add a secondary audience</div>
                        <p class="t-12 t-2 mt1">28% of your bookings come from parents aged 30–40 booking for children, but that group is not described anywhere. Adding it would sharpen paediatric content.</p>
                        <button class="btn btn--sm btn--primary mt3" id="bb-add-aud">Add audience</button>
                    </div>
                </section>
            </aside>
        </div>`;
    },

    identity(B) {
        return `<div class="split">
            <div class="col g4">
                <section class="card">
                    <div class="card__head"><span class="sec-title">Logo</span>
                        <button class="btn btn--sm push" data-edit="Logo">${icon('upload')}Replace</button></div>
                    <div class="card__body row g4">
                        <div style="width:96px;height:96px;border-radius:var(--r);background:var(--surface-2);display:grid;place-items:center;box-shadow:inset 0 0 0 1px var(--border-soft)">
                            <img src="${LOGO.mark()}" alt="" style="width:52px;height:auto">
                        </div>
                        <div class="grow">
                            <div class="t-13 w-600">Sahoda Labs mark</div>
                            <div class="t-12 t-2 mt1">PNG · light and dark variants · used across all channels</div>
                            <div class="row g2 mt3">
                                <button class="btn btn--sm" data-edit="Logo">Download</button>
                                <button class="btn btn--sm" data-edit="Logo">Variants</button>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="card">
                    <div class="card__head"><span class="sec-title">Colours</span>
                        <button class="btn btn--sm push" data-edit="Colours">${icon('edit')}Edit</button></div>
                    <div class="card__body row g3 wrap">
                        ${B.colors.map((c, i) => `
                            <div style="text-align:center">
                                <div style="width:56px;height:56px;border-radius:var(--r);background:${c};box-shadow:inset 0 0 0 1px var(--border)"></div>
                                <div class="t-11 w-600 mt2">${i === 0 ? 'Primary' : i === 1 ? 'Text' : i === 2 ? 'Muted' : i === 3 ? 'Border' : 'Surface'}</div>
                                <div class="t-11 t-3 tabnum">${c}</div>
                            </div>`).join('')}
                    </div>
                </section>

                <section class="card">
                    <div class="card__head"><span class="sec-title">Typography</span>
                        <button class="btn btn--sm push" data-edit="Typography">${icon('edit')}Edit</button></div>
                    <div class="card__body col g3">
                        <div><div class="t-11 t-3">Headings</div>
                        <div style="font-size:22px;font-weight:600;letter-spacing:-.02em">${B.typography.heading}</div></div>
                        <div class="sep"></div>
                        <div><div class="t-11 t-3">Body</div>
                        <div style="font-size:15px">${B.typography.body} — the quick brown fox jumps over the lazy dog.</div></div>
                    </div>
                </section>
            </div>

            <aside class="col g4">
                <section class="card">
                    <div class="card__head"><span class="sec-title">Positioning</span>
                        <button class="btn btn--sm push" data-edit="Positioning">${icon('edit')}Edit</button></div>
                    <div class="card__body col g3">
                        <div><div class="eyebrow mb1">Description</div><p class="t-13 t-2">${B.description}</p></div>
                        <div><div class="eyebrow mb1">Mission</div><p class="t-13 t-2">${B.mission}</p></div>
                        <div><div class="eyebrow mb1">Positioning</div><p class="t-13 t-2">${B.positioning}</p></div>
                    </div>
                </section>
            </aside>
        </div>`;
    },

    voice(B) {
        return `<div class="split">
            <div class="col g4">
                <section class="card">
                    <div class="card__head"><span class="sec-title">Voice traits</span>
                        <button class="btn btn--sm push" data-edit="Voice">${icon('plus')}Add trait</button></div>
                    <div class="card__body row g2 wrap">
                        ${B.traits.map((t) => `<span class="badge badge--lg badge--calm">${t}
                            <button style="color:inherit;display:flex" data-rm="${t}">${icon('x')}</button></span>`).join('')}
                    </div>
                </section>

                <section class="card">
                    <div class="card__head"><span class="sec-title">Tone</span></div>
                    <div class="card__body col g5">
                        ${[['formal', 'Formal', 'Casual'], ['playful', 'Serious', 'Playful'], ['detail', 'Concise', 'Detailed']]
                            .map(([k, a, b]) => `
                            <div class="field">
                                <div class="row between"><span class="label">${a}</span><span class="label">${b}</span></div>
                                <input type="range" class="slider" data-tone="${k}" min="0" max="100" value="${B.tone[k]}">
                            </div>`).join('')}
                    </div>
                </section>
            </div>

            <aside class="col g4">
                <section class="card">
                    <div class="card__head"><span class="ai-mark">${icon('sparkle')}</span>
                        <span class="sec-title">How Sahoda would write this</span></div>
                    <div class="card__body">
                        <div class="t-11 t-3 mb2">Appointment confirmation</div>
                        <p class="t-13" id="bb-example">${B.example}</p>
                        <button class="btn btn--sm mt3" id="bb-regen">${icon('refresh')}Regenerate example</button>
                    </div>
                </section>
                <div class="banner">${icon('info')}
                    <div><div class="banner__t">Tone applies everywhere</div>
                    <div class="banner__d">Posts, ad copy, customer replies and reports all inherit these settings.</div></div>
                </div>
            </aside>
        </div>`;
    },

    audience(B) {
        const A = B.aud;
        return `<div class="split">
            <div class="col g4">
                <section class="card">
                    <div class="card__head"><span class="sec-title">Primary audience</span>
                        <button class="btn btn--sm push" data-edit="Audience">${icon('edit')}Edit</button></div>
                    <div class="card__body grid g-2" style="gap:12px">
                        ${[['Age', A.age], ['Location', A.location], ['Household income', A.income], ['Buying behaviour', A.behaviour]]
                            .map(([k, v]) => `<div><div class="eyebrow mb1">${k}</div><div class="t-13">${v}</div></div>`).join('')}
                    </div>
                </section>

                <div class="grid g-3">
                    ${[['Interests', A.interests, 'star'], ['Pain points', A.pains, 'alert'], ['Goals', A.goals, 'target']].map(([t, list, ic]) => `
                        <section class="card">
                            <div class="card__head">${icon(ic, 't-3')}<span class="sec-title">${t}</span></div>
                            <div class="card__body col g2">
                                ${list.map((i) => `<div class="row g2"><span class="dot"></span><span class="t-12">${i}</span></div>`).join('')}
                            </div>
                        </section>`).join('')}
                </div>
            </div>

            <aside class="col g4">
                <section class="card">
                    <div class="card__head"><span class="ai-mark">${icon('sparkle')}</span><span class="sec-title">AI insight</span></div>
                    <div class="card__body">
                        <p class="t-13 t-2">Fear of hidden costs is the strongest signal in your inbox — it appears in 34% of first messages. Content that leads with pricing converts 2.1× better than content that leads with technology.</p>
                        <button class="btn btn--sm btn--primary mt3" id="bb-brief">Create content brief</button>
                    </div>
                </section>
            </aside>
        </div>`;
    },

    competitors(B) {
        return `<section class="card">
            <div class="card__head">
                <span class="sec-title">Tracked competitors</span>
                <span class="count count--ink">${B.rivals.length}</span>
                <button class="btn btn--sm btn--primary push" data-edit="Competitor">${icon('plus')}Track competitor</button>
            </div>
            <div class="table-wrap">
                <table class="table">
                    <thead><tr><th>Company</th><th>Position</th><th>Strength</th><th>Weakness</th><th>Activity</th><th class="num">Posts / mo</th><th></th></tr></thead>
                    <tbody>
                        ${B.rivals.map((r) => `
                            <tr>
                                <td><div class="row g2"><span class="av av--sm">${initials(r.name)}</span><span class="t-13 w-600">${r.name}</span></div></td>
                                <td class="t-12 t-2">${r.pos}</td>
                                <td class="t-12 t-2">${r.strength}</td>
                                <td class="t-12 t-2">${r.weak}</td>
                                <td>${statusBadge(r.activity === 'High' ? 'Active' : r.activity === 'Medium' ? 'Review' : 'Low')}</td>
                                <td class="num tabnum">${r.posts}</td>
                                <td><button class="iconbtn" data-rival="${r.name}">${icon('dots')}</button></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div class="card__foot">
                <div class="ai-note">
                    <span class="ai-mark">${icon('sparkle')}</span>
                    <div><div class="ai-note__t">Comparison</div>
                    <div class="ai-note__d">You publish 18 posts a month against a tracked average of 12.7. Your gap is not volume — it is video, where Smile Studio publishes 3× more.</div></div>
                </div>
            </div>
        </section>`;
    },

    knowledge(B) {
        return `<section class="card">
            <div class="card__head">
                <span class="sec-title">Knowledge library</span>
                <span class="count count--ink">${B.knowledge.length}</span>
                <div class="push row g2">
                    <div class="input-wrap" style="width:200px">${icon('search')}
                        <input class="input" id="kb-q" placeholder="Search documents…"></div>
                    <button class="btn btn--sm btn--primary" id="kb-up">${icon('upload')}Upload</button>
                </div>
            </div>
            <div id="kb-list">
                ${B.knowledge.map((d) => `
                    <div class="lrow" data-doc="${d.name}">
                        <span class="tile tile--sm">${icon('file')}</span>
                        <div class="grow" style="min-width:0">
                            <div class="t-13 w-600 truncate">${d.name}</div>
                            <div class="t-11 t-3">${d.cat} · ${d.size} · ${d.when}</div>
                        </div>
                        ${d.indexed ? statusBadge('Approved').replace('Approved', 'Indexed') : statusBadge('Review').replace('Review', 'Indexing')}
                        <button class="iconbtn" data-docmenu="${d.name}">${icon('dots')}</button>
                    </div>`).join('')}
            </div>
        </section>`;
    },

    mount(host, params) {
        const tab = params[0] || 'overview';

        host.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
            const what = b.dataset.edit;
            modal({
                title: `Edit ${what.toLowerCase()}`,
                sub: 'Changes apply to everything the AI generates from now on',
                body: `<div class="field mb3"><label class="label">${what}</label>
                        <textarea class="textarea" rows="4" placeholder="Describe ${what.toLowerCase()}…"></textarea></div>
                    <div class="banner">${icon('info')}<div><div class="banner__d">Existing scheduled content is not rewritten automatically.</div></div></div>`,
                foot: `<button class="btn" data-close>Cancel</button>
                       <button class="btn btn--primary" id="be-save">Save changes</button>`,
                onMount: (el) => { el.querySelector('#be-save').onclick = () => { Overlay.close(); toast(`${what} updated`); }; },
            });
        }));

        host.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = (e) => {
            e.stopPropagation();
            DB.brand.traits = DB.brand.traits.filter((t) => t !== b.dataset.rm);
            App.refresh();
        }));

        host.querySelectorAll('[data-tone]').forEach((s) => (s.onchange = () => {
            DB.brand.tone[s.dataset.tone] = +s.value;
            toast('Tone updated — examples regenerated', { icon: 'sparkle' });
        }));

        host.querySelector('#bb-regen')?.addEventListener('click', () => {
            const p = host.querySelector('#bb-example');
            p.innerHTML = `<span class="thinking"><span>Writing</span><i></i><i></i><i></i></span>`;
            setTimeout(() => {
                p.textContent = 'You are all set for Thursday at 4 PM. We have blocked 45 minutes so there is no rush, and the full cost is on your confirmation — no surprises at the desk.';
            }, 800);
        });

        host.querySelector('#bb-train')?.addEventListener('click', () => {
            modal({
                title: 'Retraining Brand Brain',
                body: `<div id="bt-steps" class="col g3"></div>`,
                foot: `<button class="btn" data-close>Run in background</button>`,
                onMount: (el) => {
                    // Long AI work reports what it is doing rather than spinning.
                    const steps = ['Reading 120 documents…', 'Analysing your last 90 days of content…',
                                   'Comparing against 12 competitors…', 'Updating voice model…', 'Done.'];
                    const box = el.querySelector('#bt-steps');
                    let i = 0;
                    const tick = () => {
                        box.innerHTML = steps.slice(0, i + 1).map((s, n) => `
                            <div class="row g2">
                                <span class="act__ic ${n < i ? '' : 'act__ic--ai'}">${icon(n < i ? 'check' : 'sparkle')}</span>
                                <span class="t-13 ${n < i ? 't-2' : 'w-600'}">${s}</span>
                            </div>`).join('');
                        if (++i < steps.length) setTimeout(tick, 700);
                        else toast('Brand Brain retrained', { icon: 'sparkle' });
                    };
                    tick();
                },
            });
        });

        host.querySelector('#bb-export')?.addEventListener('click', () => toast('Brand profile exported'));
        host.querySelector('#bb-add-aud')?.addEventListener('click', () => App.go('brand/audience'));
        host.querySelector('#bb-brief')?.addEventListener('click', () => toast('Content brief created', { icon: 'sparkle' }));

        if (tab === 'knowledge') {
            const q = host.querySelector('#kb-q');
            q.oninput = () => {
                const term = q.value.toLowerCase();
                const rows = host.querySelectorAll('[data-doc]');
                let shown = 0;
                rows.forEach((r) => {
                    const hit = r.dataset.doc.toLowerCase().includes(term);
                    r.classList.toggle('hide', !hit);
                    if (hit) shown++;
                });
                let none = host.querySelector('#kb-none');
                if (!shown && !none) {
                    none = document.createElement('div');
                    none.id = 'kb-none';
                    none.innerHTML = emptyState({ ic: 'search', title: 'No documents match', desc: `Nothing found for “${esc(q.value)}”. Try a shorter term.` });
                    host.querySelector('#kb-list').append(none);
                } else if (shown && none) none.remove();
            };
            host.querySelector('#kb-up').onclick = () => modal({
                title: 'Upload documents',
                sub: 'PDF, DOCX, XLSX, MD · up to 25 MB each',
                body: `<div class="state" style="padding:32px;border:1.5px dashed var(--border);border-radius:var(--r)">
                        <div class="state__ic">${icon('upload')}</div>
                        <div class="state__t">Drop files here</div>
                        <div class="state__d">or browse from your computer. AI indexes them within a minute.</div>
                        <div class="state__a"><button class="btn btn--sm">Browse files</button></div></div>`,
                foot: `<button class="btn" data-close>Cancel</button>
                       <button class="btn btn--primary" onclick="Overlay.close();toast('2 documents queued for indexing')">Upload</button>`,
            });
            host.querySelectorAll('[data-docmenu]').forEach((b) => (b.onclick = (e) => {
                e.stopPropagation();
                menu(b, [
                    { label: 'Preview', icon: 'eye', on: () => toast('Preview opened') },
                    { label: 'Re-index', icon: 'refresh', on: () => toast('Re-indexing started', { icon: 'sparkle' }) },
                    { label: 'Download', icon: 'download', on: () => toast('Downloading') },
                    { sep: true },
                    { label: 'Delete', icon: 'trash', on: () => confirmDialog({
                        title: 'Delete document?',
                        message: 'AI will stop using it as a source immediately.',
                        confirmLabel: 'Delete', destructive: true,
                        onConfirm: () => {
                            DB.brand.knowledge = DB.brand.knowledge.filter((d) => d.name !== b.dataset.docmenu);
                            App.refresh();
                            toast('Document deleted');
                        },
                    }) },
                ]);
            }));
        }

        host.querySelectorAll('[data-rival]').forEach((b) => (b.onclick = () => menu(b, [
            { label: 'View analysis', icon: 'analytics', on: () => toast('Opening analysis') },
            { label: 'Compare content', icon: 'columns', on: () => toast('Comparison ready') },
            { sep: true },
            { label: 'Stop tracking', icon: 'x', on: () => toast('Stopped tracking') },
        ])));
    },
};
