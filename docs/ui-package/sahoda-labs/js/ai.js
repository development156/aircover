/*  AI experience components
    ---------------------------------------------------------------------
    Three reusable pieces used everywhere AI does work:
      AITask    — a step list that shows what is happening right now
      stream    — text that arrives progressively rather than all at once
      aiResult  — the attribution + Accept / Regenerate / Edit / Copy bar

    The rule throughout: AI is alive, but never loud. One breathing sparkle,
    one active step, and a clear completion. Nothing spins forever.       */


/* ============================================================= mascot */

/*  The mascot is the assistant's face. Its four expressions map onto the
    four AI states the product actually has, so the character is carrying
    information rather than decorating a corner.

    It lives inside a drawn black screen with a light bezel — the same way
    the physical robot does. That keeps its colours contained: the green,
    blue, amber and red are *the character's display*, never UI chrome,
    exactly like a platform logo keeps its own brand colour.             */

const MASCOT = {
    working: { src: 'mascot/13.png', label: 'AI is working' },   // calm, eyes down
    happy: { src: 'mascot/11.png', label: 'All clear' },         // done, nothing pending
    unsure: { src: 'mascot/12.png', label: 'Needs your decision' },
    alert: { src: 'mascot/14.png', label: 'Something needs fixing' },
};

/*  ---------------------------------------------------------------------
    Live 3D mascot (Spline)

    `mascot/Agent.spline` is the Spline *editor project* — MessagePack, not
    something a browser can load. The web runtime needs a `.splinecode`,
    which Spline produces under Export → Code. Until that file exists this
    stays off and the still mascot renders instead.

    To switch it on, export the scene and set `scene` below to either
    a local path ('mascot/scene.splinecode') or the Spline public URL.
    Nothing else needs to change.

    It is deliberately opt-in and lazy: the runtime is ~1MB and needs a
    network, WebGL and a live GPU — none of which this app otherwise
    assumes. Every failure path lands back on the still image.           */

const MASCOT_3D = {
    scene: '',                 // ← set this after exporting from Spline
    runtime: 'https://unpkg.com/@splinetool/runtime@1.9.28/build/runtime.js',
    app: null,
};

function canRender3D() {
    if (!MASCOT_3D.scene) return false;
    if (reducedMotion()) return false;          // a spinning robot is decorative motion
    try {
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
}

/** Swap a still mascot host for the live scene. Resolves false if it can't. */
async function mountMascot3D(host) {
    if (!host || !canRender3D()) return false;
    try {
        const { Application } = await import(MASCOT_3D.runtime);
        const canvas = document.createElement('canvas');
        canvas.className = 'mascot-3d';
        const app = new Application(canvas);
        await app.load(MASCOT_3D.scene);

        // Only commit once the scene is actually up — no empty canvas flash.
        host.classList.add('is-3d');
        host.replaceChildren(canvas);
        MASCOT_3D.app = app;
        return true;
    } catch (err) {
        // Offline, no WebGL, bad path — the still mascot is already there.
        console.warn('[mascot] Spline scene unavailable, using still image.', err);
        return false;
    }
}

function disposeMascot3D() {
    try { MASCOT_3D.app?.dispose?.(); } catch {}
    MASCOT_3D.app = null;
}

/** size: '' | 'mface--sm' | 'mface--lg' | 'mface--xl' */
function mascot(mood = 'happy', size = '') {
    const m = MASCOT[mood] || MASCOT.happy;
    return `<span class="mface ${size} ${mood === 'working' ? 'is-live' : ''}"
        role="img" aria-label="${m.label}">
        <img src="${m.src}" alt="" decoding="async"></span>`;
}

/** Swap expression in place, without rebuilding the surrounding markup. */
function setMascot(el, mood) {
    if (!el) return;
    const m = MASCOT[mood] || MASCOT.happy;
    el.classList.toggle('is-live', mood === 'working');
    el.setAttribute('aria-label', m.label);
    const img = el.querySelector('img');
    if (img && !img.src.endsWith(m.src)) img.src = m.src;
}

/*  Which face the workspace deserves right now. One rule, used everywhere
    the assistant appears, so the mascot never contradicts the UI.       */
function workspaceMood() {
    if (DB.connections.some((c) => c.status === 'error')) return 'alert';
    if (DB.approvals.some((a) => a.status === 'pending' && a.priority === 'High')) return 'unsure';
    if (DB.approvals.some((a) => a.status === 'pending')) return 'working';
    return 'happy';
}


/* ============================================================== AITask */

/*  Usage:
      const t = AITask.mount(hostEl, ['Researching audience', 'Analysing…'], {
          title: 'Creating campaign',
          done: { title: 'Campaign ready', action: { label: 'Review campaign', on } },
      });
    Steps advance on a timer by default, or call t.advance() yourself when
    real work resolves.                                                   */

const AITask = {
    mount(host, steps, { title = 'Working', done, auto = true, stepMs = 850 } = {}) {
        host.innerHTML = `
            <div class="row g3 mb3">
                ${mascot('working')}
                <span class="sec-title" id="ait-title">${esc(title)}</span>
            </div>
            <div class="aitask" id="ait-steps" role="status" aria-live="polite">
                ${steps.map((s, i) => `
                    <div class="aitask__s ${i === 0 ? 'is-live' : ''}" data-s="${i}">
                        <span class="aitask__m">${icon('check')}</span>
                        <span>${esc(s)}</span>
                    </div>`).join('')}
            </div>
            <div id="ait-done"></div>`;

        const api = {
            i: 0,
            steps,
            timer: null,

            advance() {
                const rows = host.querySelectorAll('.aitask__s');
                if (this.i < rows.length) {
                    rows[this.i].classList.remove('is-live');
                    rows[this.i].classList.add('is-done');
                }
                this.i += 1;
                if (this.i < rows.length) {
                    rows[this.i].classList.add('is-live');
                    return false;
                }
                this.finish();
                return true;
            },

            finish() {
                clearTimeout(this.timer);
                // The face is the completion signal — it stops working and smiles.
                setMascot(host.querySelector('.mface'), 'happy');
                if (!done) return;
                host.querySelector('#ait-title').textContent = done.title || 'Done';
                host.querySelector('#ait-done').innerHTML = `
                    <div class="ai-note mt3">
                        <span class="ai-mark">${icon('check')}</span>
                        <div class="grow">
                            <div class="ai-note__t">${esc(done.title || 'Done')}</div>
                            ${done.desc ? `<div class="ai-note__d">${esc(done.desc)}</div>` : ''}
                        </div>
                        ${done.action ? `<button class="btn btn--sm btn--primary" id="ait-cta">${esc(done.action.label)}</button>` : ''}
                    </div>`;
                const cta = host.querySelector('#ait-cta');
                if (cta) cta.onclick = () => done.action.on?.();
                done.on?.();
            },

            stop() { clearTimeout(this.timer); },
        };

        if (auto) {
            const run = () => {
                api.timer = setTimeout(() => {
                    if (!document.contains(host)) return;
                    if (!api.advance()) run();
                }, stepMs);
            };
            run();
        }

        return api;
    },

    /** The same panel inside a modal, for flows that block on AI. */
    modal(steps, { title = 'Working', sub, done, stepMs = 850 } = {}) {
        return modal({
            title,
            sub,
            body: `<div id="aim-host"></div>`,
            foot: `<button class="btn" data-close>Run in background</button>`,
            onMount(el) {
                AITask.mount(el.querySelector('#aim-host'), steps, {
                    title, stepMs,
                    done: done && {
                        ...done,
                        action: done.action && {
                            label: done.action.label,
                            on: () => { Overlay.close(); done.action.on?.(); },
                        },
                    },
                });
            },
        });
    },
};


/* ============================================================ streaming */

/*  Text arrives in word-sized chunks. Fast enough not to be a wait, slow
    enough to read as being written. Reduced motion skips straight to the
    finished text — the caret would be pure decoration there.            */

function stream(el, text, { chunk = 3, ms = 26, onDone } = {}) {
    if (!el) return { cancel() {} };

    if (reducedMotion()) {
        el.textContent = text;
        el.classList.add('is-done');
        onDone?.();
        return { cancel() {} };
    }

    const words = text.split(/(\s+)/);
    let i = 0, stopped = false;
    el.textContent = '';
    el.classList.add('stream');
    el.classList.remove('is-done');

    const tick = () => {
        if (stopped || !document.contains(el)) return;
        el.textContent += words.slice(i, i + chunk).join('');
        i += chunk;
        if (i < words.length) setTimeout(tick, ms);
        else { el.classList.add('is-done'); onDone?.(); }
    };
    tick();

    return {
        cancel() { stopped = true; el.textContent = text; el.classList.add('is-done'); },
    };
}


/* ============================================================ aiResult */

/*  The bar under generated content. Attribution plus the four things a
    user always wants next.                                              */

function aiResult({ id = 'air', accept = 'Accept' } = {}) {
    return `
        <div class="row between g3 mt3" id="${id}">
            <span class="ai-sig">${icon('sparkle')}Generated by Sahoda AI</span>
            <div class="row g2">
                <button class="btn btn--sm btn--ghost" data-air="copy">${icon('copy')}Copy</button>
                <button class="btn btn--sm btn--ghost" data-air="edit">${icon('edit')}Edit</button>
                <button class="btn btn--sm" data-air="regen">${icon('refresh')}Regenerate</button>
                <button class="btn btn--sm btn--primary" data-air="accept">${icon('check')}${accept}</button>
            </div>
        </div>`;
}

function bindAiResult(root, { onAccept, onRegenerate, onEdit, getText } = {}) {
    root.querySelectorAll('[data-air]').forEach((b) => {
        b.onclick = () => {
            const k = b.dataset.air;
            if (k === 'copy') {
                navigator.clipboard?.writeText(getText?.() || '').catch(() => {});
                return notify.info('Copied to clipboard');
            }
            if (k === 'edit') return onEdit?.();
            if (k === 'regen') return onRegenerate?.(b);
            if (k === 'accept') return onAccept?.(b);
        };
    });
}


/* ==================================================== contextual AI bar */

/*  Every major page carries one AI action that understands where it is,
    so the user never has to leave the page to ask.                      */

const PAGE_AI = {
    home: { label: 'Brief me', prompt: 'Summarise what changed since yesterday' },
    planner: { label: 'Optimise schedule', prompt: 'Rebalance next week’s schedule for reach' },
    approvals: { label: 'Review with AI', prompt: 'Review the pending approvals and flag risks' },
    campaigns: { label: 'Improve campaign', prompt: 'Where is my campaign budget being wasted?' },
    analytics: { label: 'Explain this', prompt: 'Explain the change in performance this week' },
    conversations: { label: 'Suggest reply', prompt: 'Draft a reply to the open conversation' },
    brand: { label: 'Improve brand voice', prompt: 'How could my brand voice be sharper?' },
    assets: { label: 'Create variation', prompt: 'Generate a variation of my best asset' },
    connections: { label: 'Check health', prompt: 'Are any of my connections at risk?' },
    settings: { label: 'Ask AI', prompt: 'What settings should I review?' },
};

function contextualAI(route) {
    const a = PAGE_AI[route];
    if (!a) return '';
    return `<button class="btn btn--sm btn--accent-ghost" id="ctx-ai">${icon('sparkle')}${a.label}</button>`;
}

function bindContextualAI(host, route) {
    const btn = host.querySelector('#ctx-ai');
    if (btn) btn.onclick = () => App.askAI(PAGE_AI[route]?.prompt || '');
}
