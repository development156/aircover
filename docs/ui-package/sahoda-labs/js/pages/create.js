/*  Create flow — a six-step wizard held in one modal so the user never
    loses the page behind it. AI is a step in the workflow, not a chatbot. */

const CreateFlow = {
    step: 0,
    kind: 'post',
    editing: null,
    state: { platforms: [], format: 'Post', mode: null, prompt: '', body: '', when: 'schedule', date: '', time: '10:00' },

    STEPS: ['Channel', 'Format', 'Content', 'Preview', 'Schedule', 'Done'],

    dirty: false,
    saver: null,
    draft: null,

    open(kind = 'post', editing = null) {
        this.kind = kind;
        this.editing = editing;
        this.step = editing ? 2 : 0;
        this.dirty = false;
        this.saver?.destroy();
        this.saver = null;

        // Start from what the system already knows rather than from empty.
        this.state = {
            platforms: editing ? [editing.platform] : [...this.SMART.platforms],
            format: editing ? editing.kind : kind === 'story' ? 'Story' : this.SMART.format,
            mode: editing ? 'scratch' : null,
            prompt: '',
            body: editing ? editing.caption : '',
            when: 'schedule', date: '2026-07-22', time: this.SMART.time,
        };
        this.paint();
    },

    /*  AI smart defaults. The user should never have to configure what the
        system already knows — every suggestion is pre-filled and labelled,
        and every one of them can be changed.                             */
    SMART: {
        platforms: ['instagram'],
        format: 'Post',
        time: '10:00',
        reason: {
            platforms: 'Instagram drives 38% of your revenue',
            format: 'Reels outperform static 3.1×, but Post is safest for a launch',
            time: 'Your audience peaks between 9:40 and 10:20',
        },
    },

    paint() {
        // Keep the draft between repaints; only a real close discards it.
        Overlay.closeAll();
        const title = this.editing ? `Edit ${this.editing.title}` : `Create ${this.kind}`;
        modal({
            title,
            sub: this.step < 5 ? `Step ${this.step + 1} of 5 · ${this.STEPS[this.step]}` : 'All set',
            large: true,
            body: `${this.step < 5 ? this.stepper() : ''}<div id="cf-body">${this.bodyFor()}</div>`,
            foot: this.footFor(),
            onMount: (el) => {
                this.bind(el);

                // Autosave: the draft is written on every meaningful change,
                // so closing the flow never loses work.
                const ind = el.querySelector('#cf-saved');
                if (ind) {
                    this.saver?.destroy();
                    this.saver = createAutosave(ind, {
                        onSave: () => { this.draft = JSON.parse(JSON.stringify(this.state)); },
                    });
                }

                // Closing with unsaved edits asks first.
                el.querySelectorAll('[data-close]').forEach((b) => {
                    b.onclick = (e) => {
                        e.stopPropagation();
                        if (!this.dirty || this.step >= 5) return Overlay.close();
                        guardUnsaved(true, {
                            onSave: () => { this.saver?.flush(); Overlay.close(); notify.success('Draft saved to planner'); },
                            onDiscard: () => { this.dirty = false; Overlay.close(); },
                        });
                    };
                });
            },
        });
    },

    /** Mark the draft dirty and nudge the autosave indicator. */
    touch() {
        this.dirty = true;
        this.saver?.touch();
    },

    stepper() {
        return `<div class="steps mb4">
            ${this.STEPS.slice(0, 5).map((s, i) => `
                ${i ? '<span class="step__line"></span>' : ''}
                <div class="step ${i === this.step ? 'is-on' : ''} ${i < this.step ? 'is-done' : ''}">
                    <span class="step__n">${i < this.step ? '✓' : i + 1}</span>
                    <span class="step__l">${s}</span>
                </div>`).join('')}
        </div>`;
    },

    bodyFor() {
        const S = this.state;

        /* 1 — channel */
        if (this.step === 0) {
            const opts = ['instagram', 'facebook', 'linkedin', 'tiktok', 'x', 'youtube', 'whatsapp', 'telegram'];
            return `<p class="t-13 t-2 mb3">Pick one or more channels. AI writes once and adapts the copy per channel.</p>
                <div class="grid g-4 g-1-m" style="gap:8px">
                    ${opts.map((p) => `
                        <button class="card card--pad row g2" data-p="${p}" aria-pressed="${S.platforms.includes(p)}"
                            style="text-align:left;${S.platforms.includes(p) ? 'box-shadow:inset 0 0 0 1.5px var(--orange);background:var(--orange-06)' : ''}">
                            ${brandIcon(p, 'cf-ic')}
                            <span class="t-13 w-500 grow">${PLATFORM_LABEL[p]}
                                ${this.SMART.platforms.includes(p) ? '<span class="ai-sig" style="display:block;margin-top:1px">Recommended</span>' : ''}</span>
                            ${S.platforms.includes(p) ? `<span class="ai-mark">${icon('check')}</span>` : ''}
                        </button>`).join('')}
                </div>
                <div class="ai-note mt4">
                    <span class="ai-mark">${icon('sparkle')}</span>
                    <div><div class="ai-note__t">Pre-selected for you</div>
                    <div class="ai-note__d">${this.SMART.reason.platforms}. Change it if this post is for a different audience.</div></div>
                </div>
                ${S.platforms.length > 1 ? `<div class="ai-note mt4">
                    <span class="ai-mark">${icon('sparkle')}</span>
                    <div><div class="ai-note__t">${S.platforms.length} channels selected</div>
                    <div class="ai-note__d">Generating variants costs 1 credit per channel.</div></div></div>` : ''}`;
        }

        /* 2 — format */
        if (this.step === 1) {
            const formats = ['Post', 'Carousel', 'Story', 'Reel', 'Video'];
            const ics = { Post: 'image', Carousel: 'copy', Story: 'phone', Reel: 'video', Video: 'play' };
            return `<p class="t-13 t-2 mb3">Choose a format. Channel limits are applied automatically.</p>
                <div class="grid g-5 g-1-m" style="gap:8px">
                    ${formats.map((f) => `
                        <button class="card card--pad col g2" data-f="${f}"
                            style="align-items:flex-start;${S.format === f ? 'box-shadow:inset 0 0 0 1.5px var(--orange);background:var(--orange-06)' : ''}">
                            <span class="tile">${icon(ics[f])}</span>
                            <span class="t-13 w-600">${f}</span>
                        </button>`).join('')}
                </div>
                <div class="banner mt4">${icon('info')}
                    <div><div class="banner__t">Limits for this selection</div>
                    <div class="banner__d">Caption up to 2,200 characters · image up to 5 MB · 1:1 or 4:5 recommended.</div></div>
                </div>`;
        }

        /* 3 — content */
        if (this.step === 2) {
            if (!S.mode) {
                return `<p class="t-13 t-2 mb3">How do you want to start?</p>
                    <div class="grid g-3 g-1-m" style="gap:10px">
                        ${[['ai', 'sparkle', 'Generate with AI', 'Uses your brand voice, audience and past winners'],
                           ['template', 'layout', 'Use a template', '14 templates matched to your industry'],
                           ['scratch', 'edit', 'Start from scratch', 'A blank editor with AI on standby']]
                            .map(([k, ic, t, d]) => `
                            <button class="card card--pad col g2" data-m="${k}" style="align-items:flex-start;text-align:left">
                                <span class="tile ${k === 'ai' ? '' : ''}">${icon(ic)}</span>
                                <span class="t-13 w-600">${t}</span>
                                <span class="t-11 t-3">${d}</span>
                            </button>`).join('')}
                    </div>`;
            }
            return `
                <div class="grid" style="grid-template-columns:minmax(0,1fr) 260px;gap:16px" id="cf-editor">
                    <div class="col g3">
                        ${S.mode === 'ai' ? `
                            <div class="field">
                                <label class="label">What do you want to create?</label>
                                <textarea class="textarea" id="cf-prompt" rows="2"
                                    placeholder="e.g. announce our new whitening treatment, friendly tone, mention the free consultation">${esc(S.prompt)}</textarea>
                            </div>
                            <div id="cf-genwrap"></div>
                            <button class="btn btn--primary btn--sm" id="cf-gen" style="align-self:flex-start">
                                ${icon('sparkle')}Generate · 2 credits</button>` : ''}
                        <div class="field">
                            <label class="label">Body</label>
                            <textarea class="textarea" id="cf-body-in" rows="9"
                                placeholder="Write the post once — AI shapes it per channel.">${esc(S.body)}</textarea>
                            <div class="row between">
                                <span class="hint">Select any text to rewrite just that part.</span>
                                <span class="hint tabnum" id="cf-count">${S.body.length} / 2200</span>
                            </div>
                        </div>
                        <div class="row g2 wrap">
                            ${['Rewrite', 'Shorten', 'Expand', 'Change tone', 'Add hashtags'].map((a) => `
                                <button class="btn btn--sm" data-ai="${a}">${icon('wand')}${a}</button>`).join('')}
                        </div>
                    </div>
                    <div class="col g3">
                        <div class="card card--line card--pad">
                            <div class="t-12 w-600 mb2">Media</div>
                            <div style="aspect-ratio:1;border-radius:var(--r);background:var(--surface-2);display:grid;place-items:center;box-shadow:inset 0 0 0 1px var(--border-soft)">
                                ${icon('image', 't-3')}</div>
                            <button class="btn btn--sm btn--block mt3" id="cf-media">${icon('upload')}Add media</button>
                            <button class="btn btn--sm btn--accent-ghost btn--block mt2" id="cf-img">
                                ${icon('sparkle')}Make an image · 6 cr</button>
                        </div>
                        <div class="banner">${icon('bulb')}
                            <div><div class="banner__t">Tip</div>
                            <div class="banner__d">Square images fit every channel you picked.</div></div>
                        </div>
                    </div>
                </div>`;
        }

        /* 4 — preview */
        if (this.step === 3) {
            const chans = S.platforms.length ? S.platforms : ['instagram'];
            return `<p class="t-13 t-2 mb3">This is how the post lands on each channel.</p>
                <div class="grid g-2 g-1-m" style="gap:12px">
                    ${chans.map((p) => `
                        <div class="card card--line">
                            <div class="row g2" style="padding:10px 12px;border-bottom:1px solid var(--border-soft)">
                                ${platformTile(p, 'tile--sm')}
                                <span class="t-12 w-600">${DB.workspace.name}</span>
                                <span class="badge badge--calm push">${PLATFORM_LABEL[p]}</span>
                            </div>
                            <div style="aspect-ratio:1;background:var(--surface-2);display:grid;place-items:center">
                                ${icon('image', 't-3')}</div>
                            <div style="padding:11px">
                                <p class="t-12" style="white-space:pre-wrap">${esc(S.body || 'Your caption will appear here.')}</p>
                                <div class="row g3 mt3 t-3">${icon('heart' in UI_PATHS ? 'heart' : 'star')}${icon('chat')}${icon('send')}</div>
                            </div>
                        </div>`).join('')}
                </div>
                <div class="ai-note mt4">
                    <span class="ai-mark">${icon('sparkle')}</span>
                    <div><div class="ai-note__t">Predicted performance</div>
                    <div class="ai-note__d">Reach 68K–81K · engagement 4.1% · best posting time 10:00 AM.</div></div>
                </div>`;
        }

        /* 5 — schedule */
        if (this.step === 4) {
            return `<div class="grid g-2 g-1-m" style="gap:12px">
                    ${[['now', 'send', 'Publish now', 'Goes live immediately on every selected channel'],
                       ['schedule', 'calendar', 'Schedule', 'Pick a date and time'],
                       ['draft', 'file', 'Save as draft', 'Keep it in the planner without publishing']]
                        .map(([k, ic, t, d]) => `
                        <button class="card card--pad row g3" data-w="${k}"
                            style="text-align:left;${S.when === k ? 'box-shadow:inset 0 0 0 1.5px var(--orange);background:var(--orange-06)' : ''}">
                            <span class="tile">${icon(ic)}</span>
                            <span class="grow"><span class="t-13 w-600" style="display:block">${t}</span>
                            <span class="t-11 t-3">${d}</span></span>
                        </button>`).join('')}
                </div>
                <div class="grid g-2 mt4 ${S.when === 'schedule' ? '' : 'hide'}" id="cf-when">
                    <div class="field"><label class="label">Date</label>
                        <input class="input" type="date" id="cf-date" value="${S.date}"></div>
                    <div class="field">
                        <label class="label row between">Time
                            ${S.time === this.SMART.time ? `<span class="ai-sig">${icon('sparkle')}AI recommended</span>` : ''}</label>
                        <input class="input" type="time" id="cf-time" value="${S.time}"></div>
                </div>
                <div class="ai-note mt4">
                    <span class="ai-mark">${icon('bulb')}</span>
                    <div><div class="ai-note__t">Set to ${this.SMART.time} for you</div>
                    <div class="ai-note__d">${this.SMART.reason.time}. Change it freely — this is a suggestion, not a rule.</div></div>
                </div>`;
        }

        /* 6 — confirmation */
        const chans = this.state.platforms.length ? this.state.platforms : ['instagram'];
        return emptyState({
            ic: 'check', accent: true,
            title: this.state.when === 'now' ? 'Published' : this.state.when === 'draft' ? 'Saved as draft' : 'Scheduled',
            desc: this.state.when === 'draft'
                ? 'Your draft is in the planner. Nothing goes live until you schedule it.'
                : `Going out on ${chans.map((c) => PLATFORM_LABEL[c]).join(', ')} · ${this.state.date} at ${this.state.time}.`,
        });
    },

    footFor() {
        if (this.step === 5) {
            return `<button class="btn" data-close>Close</button>
                    <button class="btn btn--ink" id="cf-planner">${icon('calendar')}Open planner</button>`;
        }
        const canNext = this.step !== 0 || this.state.platforms.length;
        return `${this.step > 0 ? `<button class="btn" id="cf-back">${icon('left')}Back</button>` : '<span></span>'}
            <span class="saved push" id="cf-saved" aria-live="polite"></span>
            <div class="row g2">
                <button class="btn btn--ghost" data-close>Cancel</button>
                <button class="btn btn--primary" id="cf-next" ${canNext ? '' : 'aria-disabled="true"'}>
                    ${this.step === 4 ? 'Confirm' : 'Continue'}${icon('right')}</button>
            </div>`;
    },

    GENERATED: 'Say hello to brighter mornings ✨\n\nOur new whitening treatment is gentle, dentist-designed and takes just 30 minutes. Book this week and your consultation is on us.\n\n#SunriseDental #Bhubaneswar #SmileCare',

    bind(el) {
        el.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
            const p = b.dataset.p;
            const i = this.state.platforms.indexOf(p);
            i > -1 ? this.state.platforms.splice(i, 1) : this.state.platforms.push(p);
            this.touch();
            this.paint();
        }));

        el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { this.state.format = b.dataset.f; this.touch(); this.paint(); }));
        el.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { this.state.mode = b.dataset.m; this.paint(); }));
        el.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { this.state.when = b.dataset.w; this.touch(); this.paint(); }));

        const body = el.querySelector('#cf-body-in');
        if (body) {
            body.oninput = () => {
                this.state.body = body.value;
                el.querySelector('#cf-count').textContent = `${body.value.length} / 2200`;
                this.touch();
            };
        }

        el.querySelector('#cf-prompt')?.addEventListener('input', (e) => {
            this.state.prompt = e.target.value;
            this.touch();
        });

        /*  Generation reports its steps, then streams the result into the
            editor. The user watches it being written instead of waiting on
            a spinner and then being handed a finished block of text.     */
        el.querySelector('#cf-gen')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const wrap = el.querySelector('#cf-genwrap');
            btn.style.display = 'none';
            wrap.innerHTML = `<div class="card card--line card--pad" id="cf-task"></div>`;

            AITask.mount(wrap.querySelector('#cf-task'), [
                'Reading your brand voice',
                'Checking what performed best',
                'Writing the caption',
            ], {
                title: 'Generating', stepMs: 620,
                done: {
                    on: () => {
                        DB.credits.used += 2;
                        App.renderShell();
                        this.state.body = this.GENERATED;
                        this.touch();

                        // Stream into the real editor, then offer the result bar.
                        const ta = el.querySelector('#cf-body-in');
                        if (ta) {
                            ta.value = '';
                            let i = 0;
                            const words = this.GENERATED.split(/(\s+)/);
                            const tick = () => {
                                if (!document.contains(ta)) return;
                                ta.value += words.slice(i, i + 3).join('');
                                el.querySelector('#cf-count').textContent = `${ta.value.length} / 2200`;
                                ta.scrollTop = ta.scrollHeight;
                                i += 3;
                                if (i < words.length) setTimeout(tick, reducedMotion() ? 0 : 24);
                            };
                            reducedMotion() ? (ta.value = this.GENERATED) : tick();
                        }

                        wrap.innerHTML = aiResult({ accept: 'Keep' });
                        bindAiResult(wrap, {
                            getText: () => this.state.body,
                            onAccept: () => { wrap.innerHTML = ''; btn.style.display = ''; notify.success('Draft kept'); },
                            onRegenerate: (b) => runAction(b, {
                                busy: 'Rewriting…', done: 'Done', ms: 800,
                                onDone: () => { DB.credits.used += 2; App.renderShell(); notify.ai('Rewritten · 2 credits'); },
                            }),
                            onEdit: () => el.querySelector('#cf-body-in')?.focus(),
                        });
                        notify.ai('Draft generated · 2 credits used');
                    },
                },
            });
        });

        el.querySelectorAll('[data-ai]').forEach((b) => (b.onclick = () => {
            const ta = el.querySelector('#cf-body-in');
            if (!ta?.value.trim()) return notify.info('Write something first, then refine it');
            runAction(b, { busy: '…', done: 'Done', ms: 600, onDone: () => notify.ai(`${b.dataset.ai} applied`) });
        }));

        el.querySelector('#cf-media')?.addEventListener('click', () => notify.info('Media library opened'));
        el.querySelector('#cf-img')?.addEventListener('click', (e) => runAction(e.currentTarget, {
            busy: 'Generating…', done: 'Created', ms: 1400,
            onDone: () => { DB.credits.used += 6; App.renderShell(); notify.ai('Image generated · 6 credits'); },
        }));
        el.querySelector('#cf-date')?.addEventListener('change', (e) => { this.state.date = e.target.value; this.touch(); });
        el.querySelector('#cf-time')?.addEventListener('change', (e) => { this.state.time = e.target.value; this.touch(); });

        el.querySelector('#cf-back')?.addEventListener('click', () => { this.step--; this.paint(); });

        el.querySelector('#cf-next')?.addEventListener('click', (e) => {
            if (this.step === 0 && !this.state.platforms.length) return notify.warning('Pick at least one channel');

            // The final step commits — so it reports as work, not a page turn.
            if (this.step === 4) {
                const verb = this.state.when === 'now' ? 'Publishing…' : this.state.when === 'draft' ? 'Saving…' : 'Scheduling…';
                const past = this.state.when === 'now' ? 'Published' : this.state.when === 'draft' ? 'Saved' : 'Scheduled';
                return runAction(e.currentTarget, {
                    busy: verb, done: past, ms: 700, restore: false,
                    onDone: () => {
                        this.saver?.flush();
                        this.dirty = false;
                        DB.activity.unshift({ t: `${past} ${this.state.format.toLowerCase()}`, ago: 'just now', kind: 'done' });
                        this.step += 1;
                        this.paint();
                        notify.success(`Post ${past.toLowerCase()}`);
                    },
                });
            }

            this.step++;
            this.paint();
        });

        el.querySelector('#cf-planner')?.addEventListener('click', () => { Overlay.close(); App.go('planner'); });
    },
};
