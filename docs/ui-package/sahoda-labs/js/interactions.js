/*  Interaction primitives — button lifecycle, keyboard system, autosave,
    chart tooltips and text matching. Everything here is shared; pages
    never re-implement these behaviours.                                 */


/* ======================================================= button states */

/*  Default → busy → success → default. The button's width is pinned for
    the duration so nothing around it reflows while the label changes.   */

async function runAction(btn, { busy = 'Working…', done = 'Done', work, ms = 750, restore = true, onDone } = {}) {
    if (!btn || btn.classList.contains('is-busy')) return;

    const original = btn.innerHTML;
    btn.style.minWidth = `${btn.offsetWidth}px`;
    btn.classList.add('is-busy');
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = `<span class="spinner"></span>${busy}`;

    try {
        await (work ? work() : new Promise((r) => setTimeout(r, ms)));
    } catch (err) {
        btn.classList.remove('is-busy');
        btn.removeAttribute('aria-busy');
        btn.innerHTML = original;
        btn.style.minWidth = '';
        notify.error(err?.message || 'That didn’t work. Nothing was changed.');
        return;
    }

    btn.classList.remove('is-busy');
    btn.removeAttribute('aria-busy');
    btn.classList.add('is-done');
    btn.innerHTML = `${icon('check')}${done}`;
    onDone?.();

    if (restore) {
        setTimeout(() => {
            if (!document.contains(btn)) return;
            btn.classList.remove('is-done');
            btn.innerHTML = original;
            btn.style.minWidth = '';
        }, 1150);
    }
}


/* ==================================================== keyboard system */

const Keys = {
    scoped: null,          // set per page in mount(), cleared on navigation
    hint: null,            // short description shown in the help dialog

    init() {
        document.addEventListener('keydown', (e) => this.handle(e), true);
    },

    /*  Never hijack a keystroke the user meant for a text field. */
    isTyping(e) {
        const t = e.target;
        return !!(t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]'));
    },

    handle(e) {
        // Escape unwinds one layer at a time: popover → overlay → chat.
        if (e.key === 'Escape') {
            if ($('.pop')) { e.preventDefault(); return closePopovers(); }
            if (Overlay.stack.length) { e.preventDefault(); return Overlay.close(); }
            if (Chat?.open) { e.preventDefault(); return Chat.toggle(false); }
            return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            return App.commandPalette();
        }

        if (this.isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;

        if (e.key === '?') { e.preventDefault(); return this.help(); }

        // Single-letter shortcuts stand down while a dialog is open, so they
        // can never fire against the page hidden behind it.
        if (Overlay.stack.length) return;

        if (e.key.toLowerCase() === 'c') { e.preventDefault(); return App.createMenu(); }

        const fn = this.scoped?.[e.key.toLowerCase()];
        if (fn) { e.preventDefault(); fn(e); }
    },

    setScope(handlers, hint) {
        this.scoped = handlers;
        this.hint = hint || null;
    },

    clearScope() {
        this.scoped = null;
        this.hint = null;
    },

    help() {
        const global = [
            ['⌘ K', 'Search everything'],
            ['C', 'Create'],
            ['Esc', 'Close / go back a layer'],
            ['?', 'This help'],
        ];
        const page = this.hint || [];

        modal({
            title: 'Keyboard shortcuts',
            sub: 'Shortcuts stand down while you are typing',
            body: `
                <div class="eyebrow mb2">Anywhere</div>
                <div class="keys mb4">
                    ${global.map(([k, d]) => `<div class="keys__r"><span>${d}</span><span class="kbd">${k}</span></div>`).join('')}
                </div>
                ${page.length ? `
                    <div class="eyebrow mb2">On this page</div>
                    <div class="keys">
                        ${page.map(([k, d]) => `<div class="keys__r"><span>${d}</span><span class="kbd">${k}</span></div>`).join('')}
                    </div>` : ''}`,
            foot: `<button class="btn" data-close>Close</button>`,
        });
    },
};


/* ============================================================ autosave */

/*  Attaches to a small status element. Quiet by design: it only ever says
    Saving… / Saved / Saved N ago, and never blocks the editor.          */

function createAutosave(host, { onSave } = {}) {
    let debounce, ageTimer, savedAt = null, dirty = false;

    const paint = () => {
        if (!host || !document.contains(host)) return;
        if (dirty) { host.innerHTML = `<span class="spinner"></span>Saving…`; return; }
        if (!savedAt) { host.innerHTML = ''; return; }
        const s = Math.round((Date.now() - savedAt) / 1000);
        const when = s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
        host.innerHTML = `${icon('check')}Saved ${when}`;
    };

    ageTimer = setInterval(paint, 5000);

    return {
        touch() {
            dirty = true;
            paint();
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                onSave?.();
                dirty = false;
                savedAt = Date.now();
                paint();
            }, 650);
        },
        get isDirty() { return dirty; },
        get hasSaved() { return !!savedAt; },
        flush() {
            clearTimeout(debounce);
            if (dirty) { onSave?.(); dirty = false; savedAt = Date.now(); paint(); }
        },
        destroy() { clearTimeout(debounce); clearInterval(ageTimer); },
    };
}

/*  Guard for leaving a surface with unsaved edits. Returns true if it is
    safe to proceed, otherwise asks and calls back.                      */

function guardUnsaved(isDirty, { onSave, onDiscard }) {
    if (!isDirty) { onDiscard?.(); return true; }
    modal({
        title: 'Unsaved changes',
        body: `<p class="t-13 t-2">You have edits that haven’t been saved. Save them before leaving?</p>`,
        foot: `<button class="btn btn--ghost" id="ug-discard">Discard</button>
               <button class="btn" data-close>Keep editing</button>
               <button class="btn btn--primary" id="ug-save">Save changes</button>`,
        onMount(el) {
            el.querySelector('#ug-save').onclick = () => { Overlay.close(); onSave?.(); };
            el.querySelector('#ug-discard').onclick = () => { Overlay.close(); onDiscard?.(); };
        },
    });
    return false;
}


/* ====================================================== text matching */

/** Wrap the matched span so search results show *why* they matched. */
function highlight(text, q) {
    const s = String(text);
    if (!q) return esc(s);
    const i = s.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(s);
    return `${esc(s.slice(0, i))}<mark>${esc(s.slice(i, i + q.length))}</mark>${esc(s.slice(i + q.length))}`;
}


/* ====================================================== chart tooltips */

const ChartTip = {
    el: null,

    show(x, y, html) {
        if (!this.el) {
            this.el = document.createElement('div');
            this.el.className = 'charttip';
            document.body.append(this.el);
        }
        this.el.innerHTML = html;
        this.el.style.opacity = '1';
        const r = this.el.getBoundingClientRect();
        this.el.style.left = `${Math.min(Math.max(8, x - r.width / 2), innerWidth - r.width - 8)}px`;
        this.el.style.top = `${Math.max(8, y - r.height - 10)}px`;
    },

    hide() { if (this.el) this.el.style.opacity = '0'; },
};

/*  Attach hover/focus readouts to a chart rendered by lineChart(). The
    hit areas are full-height columns so the pointer never has to find a
    2px line.                                                            */

function bindChartTips(root, { series, labels, format = (v) => v, compare }) {
    root.querySelectorAll('[data-i]').forEach((hit) => {
        const i = +hit.dataset.i;
        const readout = () => {
            const r = hit.getBoundingClientRect();
            const prev = series[i - 1];
            const diff = prev != null ? Math.round(((series[i] - prev) / prev) * 100) : null;
            ChartTip.show(r.left + r.width / 2, r.top + 40, `
                <i>${labels[i] ?? ''}</i><br>
                <b>${format(series[i])}</b>
                ${diff != null ? `<br><i>${diff >= 0 ? '+' : ''}${diff}% vs previous</i>` : ''}
                ${compare ? `<br><i>${compare}</i>` : ''}`);
        };
        hit.addEventListener('mouseenter', readout);
        hit.addEventListener('focus', readout);
        hit.addEventListener('mouseleave', () => ChartTip.hide());
        hit.addEventListener('blur', () => ChartTip.hide());
    });
}


/* ================================================= optimistic list exit */

/*  Animate a row out, then run the mutation. The list is not re-rendered
    from scratch, so the rows around it stay exactly where they were.    */

function removeRow(row, after) {
    if (!row) return after?.();
    if (reducedMotion()) { row.remove(); return after?.(); }
    row.classList.add('is-leaving');
    setTimeout(() => { row.remove(); after?.(); }, 220);
}

/** Replace a number in place with a small tick, so a change is noticed. */
function tickValue(el, value) {
    if (!el) return;
    el.textContent = value;
    el.classList.remove('num-tick');
    void el.offsetWidth;            // restart the animation
    el.classList.add('num-tick');
}
