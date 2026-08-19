/*  UI runtime — overlays and the small render helpers every page shares. */

// Declared here rather than in app.js because every js/pages/*.js registers
// into it at parse time, and those files load before app.js.
const PAGES = {};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Keep Tab inside a dialog — required for an accessible modal. */
function trapFocus(el) {
    el.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
}

/** Drag a bottom sheet down to dismiss it. Only where a sheet is a sheet —
 *  the gesture supplements the close button, it never replaces it. */
function enableSwipeToClose(el) {
    const handle = el.querySelector('.sheet__grab, .sheet__grip, .drawer__head, .modal__head');
    if (!handle) return;
    let y0 = 0, dy = 0, active = false;

    handle.style.touchAction = 'none';

    handle.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, input, a')) return;
        active = true;
        y0 = e.clientY;
        dy = 0;
        el.classList.add('is-dragging');
        handle.setPointerCapture?.(e.pointerId);
    });

    handle.addEventListener('pointermove', (e) => {
        if (!active) return;
        dy = Math.max(0, e.clientY - y0);
        el.style.transform = `translateY(${dy}px)`;
        el.style.opacity = String(Math.max(0.5, 1 - dy / 420));
    });

    const end = () => {
        if (!active) return;
        active = false;
        el.classList.remove('is-dragging');
        el.style.transform = '';
        el.style.opacity = '';
        if (dy > 90) Overlay.close();
    };

    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
}


/* ============================================================== overlays */

const Overlay = {
    stack: [],

    open(html, { kind = 'drawer', onMount, dismissable = true, label } = {}) {
        const scrim = document.createElement('div');
        scrim.className = 'scrim';

        const el = document.createElement('div');
        // On mobile a drawer becomes a bottom sheet; the CSS handles the shape.
        el.className = kind === 'modal' ? 'modal' : kind === 'modal-lg' ? 'modal modal--lg'
            : kind === 'drawer-wide' ? 'drawer drawer--wide' : 'drawer';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        if (label) el.setAttribute('aria-label', label);
        el.innerHTML = html;

        document.body.append(scrim, el);
        document.body.style.overflow = 'hidden';

        // Remember where focus came from so it can be handed back on close.
        const entry = { scrim, el, restore: document.activeElement };
        this.stack.push(entry);

        if (dismissable) scrim.onclick = () => this.close();
        el.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => this.close()));

        // Focus a text field if the overlay has one. Deliberately not a button:
        // a focused choice card reads as already-selected.
        const focusable = el.querySelector('input:not([type=checkbox]):not([type=radio]), textarea');
        if (focusable && !isMobile()) setTimeout(() => focusable.focus(), 60);
        else setTimeout(() => el.focus?.(), 60);
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');

        trapFocus(el);
        if (isMobile() || kind === 'sheet') enableSwipeToClose(el);

        onMount?.(el);
        return el;
    },

    close() {
        const entry = this.stack.pop();
        if (!entry) return;
        const { scrim, el, restore } = entry;

        const done = () => {
            // A WebGL context left running behind a closed drawer is a leak.
            if (el.querySelector('.mascot-3d')) disposeMascot3D();
            scrim.remove();
            el.remove();
            if (!this.stack.length) document.body.style.overflow = '';
            // Hand focus back so keyboard users are not dropped at the top.
            if (restore && document.contains(restore)) restore.focus?.();
        };

        scrim.classList.add('is-closing');
        el.classList.add('is-closing');
        reducedMotion() ? done() : setTimeout(done, 190);
    },

    closeAll() { while (this.stack.length) this.close(); },
    get top() { return this.stack[this.stack.length - 1]; },
};

/** Right drawer on desktop, bottom sheet on mobile. */
function drawer({ title, sub, body, foot, wide = false, onMount }) {
    return Overlay.open(`
        <div class="drawer__head">
            <div class="grow">
                <div class="sec-title">${title}</div>
                ${sub ? `<div class="t-12 t-3 mt1">${sub}</div>` : ''}
            </div>
            <button class="iconbtn" data-close aria-label="Close">${icon('x')}</button>
        </div>
        <div class="drawer__body">${body}</div>
        ${foot ? `<div class="drawer__foot">${foot}</div>` : ''}
    `, { kind: wide ? 'drawer-wide' : 'drawer', onMount });
}

function modal({ title, sub, body, foot, large = false, onMount }) {
    return Overlay.open(`
        <div class="modal__head">
            <div class="grow">
                <div class="sec-title">${title}</div>
                ${sub ? `<div class="t-12 t-3 mt1">${sub}</div>` : ''}
            </div>
            <button class="iconbtn" data-close aria-label="Close">${icon('x')}</button>
        </div>
        <div class="modal__body">${body}</div>
        ${foot ? `<div class="modal__foot">${foot}</div>` : ''}
    `, { kind: large ? 'modal-lg' : 'modal', onMount });
}

function confirmDialog({ title, message, confirmLabel = 'Confirm', destructive = false, onConfirm }) {
    modal({
        title,
        body: `<p class="t-13 t-2">${message}</p>`,
        foot: `<button class="btn" data-close>Cancel</button>
               <button class="btn ${destructive ? 'btn--primary' : 'btn--ink'}" id="cf-ok">${confirmLabel}</button>`,
        onMount(el) {
            el.querySelector('#cf-ok').onclick = () => { Overlay.close(); onConfirm?.(); };
        },
    });
}


/* ================================================================= toast */

/*  Four kinds, distinguished by glyph and wording rather than colour.
    An error carries an action wherever one exists — a dead-end toast is
    just a nicer way of saying "something broke, good luck".             */

const TOAST_KIND = {
    success: { ic: 'check', ms: 3200 },
    error: { ic: 'alert', ms: 6000 },
    warning: { ic: 'alert', ms: 5000 },
    info: { ic: 'info', ms: 4000 },
    ai: { ic: 'sparkle', ms: 4000 },
};

const MAX_TOASTS = 3;

function toast(message, opts = {}) {
    // Back-compat: toast('x', { icon: 'wand' }) still works.
    const kind = opts.kind || 'success';
    const cfg = TOAST_KIND[kind] || TOAST_KIND.success;
    const ic = opts.icon || cfg.ic;

    let host = $('.toasts');
    if (!host) {
        host = document.createElement('div');
        host.className = 'toasts';
        host.setAttribute('role', 'status');
        host.setAttribute('aria-live', 'polite');
        document.body.append(host);
    }

    // Never let toasts pile into a wall — the oldest steps aside.
    while (host.children.length >= MAX_TOASTS) dismiss(host.firstElementChild);

    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `${icon(ic)}
        <span class="grow">${message}</span>
        ${opts.action ? `<button class="toast__act">${opts.action.label}</button>` : ''}
        <button class="toast__x" aria-label="Dismiss">${icon('x')}</button>`;

    t.querySelector('.toast__x').onclick = () => dismiss(t);
    if (opts.action) {
        t.querySelector('.toast__act').onclick = () => { dismiss(t); opts.action.on?.(); };
    }

    host.append(t);
    const timer = setTimeout(() => dismiss(t), opts.ms || cfg.ms);
    // Reading a message shouldn't race a timer.
    t.onmouseenter = () => clearTimeout(timer);

    function dismiss(node) {
        if (!node || node.dataset.gone) return;
        node.dataset.gone = '1';
        node.classList.add('is-leaving');
        reducedMotion() ? node.remove() : setTimeout(() => node.remove(), 160);
    }
    return t;
}

const notify = {
    success: (m, o) => toast(m, { ...o, kind: 'success' }),
    error: (m, o) => toast(m, { ...o, kind: 'error' }),
    warning: (m, o) => toast(m, { ...o, kind: 'warning' }),
    info: (m, o) => toast(m, { ...o, kind: 'info' }),
    ai: (m, o) => toast(m, { ...o, kind: 'ai' }),
};


/* =============================================================== popover */

function popover(anchor, html, { align = 'right' } = {}) {
    closePopovers();
    const p = document.createElement('div');
    p.className = 'pop' + (align === 'left' ? ' pop--left' : '');
    p.setAttribute('role', 'menu');
    p.innerHTML = html;
    document.body.append(p);

    const r = anchor.getBoundingClientRect();
    const w = p.offsetWidth;
    let left = align === 'right' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 6;
    if (top + p.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - p.offsetHeight - 6);
    p.style.left = `${left}px`;
    p.style.top = `${top}px`;

    // Defer so the click that opened it doesn't immediately close it.
    setTimeout(() => document.addEventListener('click', onDocClick), 0);
    function onDocClick(e) {
        if (!p.contains(e.target)) closePopovers();
    }
    p._cleanup = () => document.removeEventListener('click', onDocClick);
    return p;
}

function closePopovers() {
    $$('.pop').forEach((p) => { p._cleanup?.(); p.remove(); });
}

/** Build a menu popover from a list of {label, icon, on, danger, sep} items. */
function menu(anchor, items, opts) {
    const html = items.map((i) => {
        if (i.sep) return '<div class="pop__sep"></div>';
        if (i.label && !i.on && i.heading) return `<div class="pop__lbl">${i.label}</div>`;
        return `<button class="pop__i ${i.active ? 'is-on' : ''}" data-k="${i.k || ''}">
            ${i.icon ? icon(i.icon) : ''}<span class="grow">${i.label}</span>
            ${i.right || ''}</button>`;
    }).join('');
    const p = popover(anchor, html, opts);
    p.querySelectorAll('.pop__i').forEach((b, idx) => {
        const item = items.filter((i) => !i.sep && !i.heading)[idx];
        b.onclick = () => { closePopovers(); item?.on?.(); };
    });
    return p;
}


/* ======================================================= render helpers */

/** Sparkline. Stroke follows currentColor so it stays on-palette. */
function sparkline(points, { w = 100, h = 26, fill = false } = {}) {
    const max = Math.max(...points), min = Math.min(...points);
    const span = max - min || 1;
    const step = w / (points.length - 1);
    const pts = points.map((p, i) => [i * step, h - ((p - min) / span) * (h - 3) - 1.5]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const area = fill ? `<path d="${d} L${w} ${h} L0 ${h} Z" fill="currentColor" opacity=".08"/>` : '';
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        ${area}<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6"
        stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

/** Progress ring. */
function ring(value, { size = 42, stroke = 4, label } = {}) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const off = c - (Math.min(100, Math.max(0, value)) / 100) * c;
    return `<div class="ring" style="width:${size}px;height:${size}px">
        <svg width="${size}" height="${size}">
            <circle class="ring__bg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
            <circle class="ring__v" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
                stroke-width="${stroke}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
        </svg>
        <span class="ring__t">${label ?? value + '%'}</span></div>`;
}

/*  Line chart with axis labels — used by Analytics and Campaign detail.
    The line draws itself once on entry so the eye follows the trend, and
    every data point gets a full-height hit column so hovering never means
    hunting for a 2px stroke.                                             */

function lineChart(series, labels, { h = 220, fill = true, interactive = true } = {}) {
    const w = 640, pl = 34, pb = 22, pt = 8;
    const max = Math.ceil(Math.max(...series) / 10) * 10 || 10;
    const iw = w - pl, ih = h - pb - pt;
    const step = iw / (series.length - 1);
    const pts = series.map((v, i) => [pl + i * step, pt + ih - (v / max) * ih]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = pt + ih * f;
        return `<line x1="${pl}" y1="${y}" x2="${w}" y2="${y}" stroke="var(--border-soft)" stroke-width="1"/>
            <text x="${pl - 8}" y="${y + 3.5}" text-anchor="end" font-size="10" fill="var(--text-3)">${Math.round(max * (1 - f))}</text>`;
    }).join('');

    const xl = labels.map((l, i) => {
        if (labels.length > 8 && i % 2) return '';
        return `<text x="${pl + i * step}" y="${h - 5}" text-anchor="middle" font-size="10" fill="var(--text-3)">${l}</text>`;
    }).join('');

    const hits = interactive ? pts.map((p, i) => `
        <g>
            <rect class="chart-hit" data-i="${i}" x="${p[0] - step / 2}" y="${pt}" width="${step}" height="${ih}"
                tabindex="0" role="img" aria-label="${labels[i] ?? i}: ${series[i]}"/>
            <circle class="chart-dot" cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--orange)"
                stroke="var(--surface)" stroke-width="2"/>
        </g>`).join('') : '';

    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px" preserveAspectRatio="none" role="group">
        ${grid}
        ${fill ? `<path class="chart-area" d="${d} L${w} ${pt + ih} L${pl} ${pt + ih} Z" fill="var(--orange)" opacity=".07"/>` : ''}
        <path class="chart-line" d="${d}" pathLength="1" fill="none" stroke="var(--orange)" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        ${hits}
        ${xl}</svg>`;
}

/** Horizontal bar row used for channel share. */
function shareBar(pct, ink = false) {
    return `<div class="bar" style="width:100%"><div class="bar__f ${ink ? 'bar__f--ink' : ''}" style="width:${pct}%"></div></div>`;
}

/** Status badge on the four-rung ladder. Meaning comes from glyph + label. */
function statusBadge(status) {
    const map = {
        // rung 1 — needs you now
        error: ['urgent', 'alert', 'Action needed'],
        disconnected: ['urgent', 'alert', 'Disconnected'],
        Overdue: ['urgent', 'alert', 'Overdue'],
        High: ['urgent', 'alert', 'High'],
        // rung 2 — active / current
        Active: ['active', null, 'Active'],
        connected: ['calm', 'check', 'Connected'],
        Published: ['active', null, 'Published'],
        // rung 3 — pending / needs a look
        Review: ['pending', 'clock', 'Review'],
        pending: ['pending', 'clock', 'Pending'],
        Medium: ['pending', 'alert', 'Medium'],
        Draft: ['pending', 'edit', 'Draft'],
        // rung 4 — resolved / informational
        Scheduled: ['calm', 'calendar', 'Scheduled'],
        Completed: ['calm', 'check', 'Completed'],
        Approved: ['calm', 'check', 'Approved'],
        Low: ['calm', null, 'Low'],
        Ideas: ['calm', 'bulb', 'Ideas'],
        Invited: ['calm', 'clock', 'Invited'],
        Paid: ['calm', 'check', 'Paid'],
    };
    const [rung, ic, label] = map[status] || ['calm', null, status];
    return `<span class="badge badge--${rung}">${ic ? icon(ic) : ''}${label}</span>`;
}

function deltaTag(delta, dir) {
    return `<span class="delta delta--${dir}">${icon(dir === 'up' ? 'arrowUp' : 'arrowDown')}${delta}%</span>`;
}

function emptyState({ ic = 'inbox', title, desc, action, accent = false }) {
    return `<div class="state">
        <div class="state__ic ${accent ? 'state__ic--accent' : ''}">${icon(ic)}</div>
        <div class="state__t">${title}</div>
        <div class="state__d">${desc}</div>
        ${action ? `<div class="state__a">${action}</div>` : ''}
    </div>`;
}

function errorState({ title, desc, action }) {
    return emptyState({ ic: 'alert', title, desc, action, accent: true });
}

/** Skeleton list — shown while a route's data "loads". */
function skeletonList(rows = 5) {
    return Array.from({ length: rows }, () => `
        <div class="lrow" style="cursor:default">
            <div class="sk sk--tile"></div>
            <div class="grow col g2">
                <div class="sk sk--title"></div>
                <div class="sk sk--text" style="width:70%"></div>
            </div>
            <div class="sk sk--line" style="width:64px"></div>
        </div>`).join('');
}

function skeletonCards(n = 4) {
    return `<div class="grid g-4">${Array.from({ length: n }, () => `
        <div class="card card--pad col g3">
            <div class="sk sk--text" style="width:50%"></div>
            <div class="sk sk--title" style="width:70%;height:18px"></div>
            <div class="sk sk--line" style="height:26px"></div>
        </div>`).join('')}</div>`;
}

/** Platform tile with its brand mark — no chrome, the logo fills the slot. */
function platformTile(k, size = '') {
    return `<span class="tile tile--brand ${size}">${brandIcon(k)}</span>`;
}

function initials(name) {
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}
