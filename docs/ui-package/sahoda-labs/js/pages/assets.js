/*  Assets — the creative library, with AI actions attached to each item.  */

const Assets = {
    filter: 'All',
    view: 'grid',
    query: '',

    list() {
        return DB.assets.filter((a) => {
            const okF = this.filter === 'All'
                || (this.filter === 'AI Generated' ? a.ai : a.type === this.filter.replace(/s$/, ''));
            const okQ = !this.query || a.name.toLowerCase().includes(this.query.toLowerCase());
            return okF && okQ;
        });
    },

    open(name) {
        const a = DB.assets.find((x) => x.name === name);
        if (!a) return;
        drawer({
            title: a.name,
            sub: `${a.type} · ${a.dim} · ${a.size}`,
            body: `
                <div class="card card--line mb4" style="aspect-ratio:4/3;display:grid;place-items:center;background:var(--surface-2)">
                    ${icon(a.type === 'Video' ? 'video' : a.type === 'Document' ? 'file' : 'image', 't-3')}
                </div>
                ${a.ai ? `<div class="ai-note mb4"><span class="ai-mark">${icon('sparkle')}</span>
                    <div><div class="ai-note__t">AI generated</div>
                    <div class="ai-note__d">Created from your brand palette and tone. Safe to reuse anywhere.</div></div></div>` : ''}

                <div class="eyebrow mb2">Details</div>
                <div class="card card--line mb4">
                    ${[['Type', a.type], ['Dimensions', a.dim], ['Size', a.size], ['Created', a.when]].map(([k, v]) => `
                        <div class="row between" style="padding:9px 12px;border-bottom:1px solid var(--border-soft)">
                            <span class="t-12 t-2">${k}</span><span class="t-12 w-500">${v}</span></div>`).join('')}
                </div>

                <div class="eyebrow mb2">Used in</div>
                ${a.used.length
                    ? `<div class="col g2 mb4">${a.used.map((u) => `
                        <div class="row g2"><span class="tile tile--sm">${icon('campaigns')}</span>
                        <span class="t-13">${u}</span></div>`).join('')}</div>`
                    : `<p class="t-12 t-3 mb4">Not used anywhere yet.</p>`}

                <div class="eyebrow mb2">AI actions</div>
                <div class="grid g-2" style="gap:8px">
                    ${[['Generate variation', 'sparkle'], ['Resize for channels', 'expand'],
                       ['Remove background', 'wand'], ['Create caption', 'type']].map(([t, ic]) => `
                        <button class="btn" data-aia="${t}" style="justify-content:flex-start">${icon(ic)}${t}</button>`).join('')}
                </div>`,
            foot: `<button class="btn btn--ghost" id="as-del">${icon('trash')}Delete</button>
                   <button class="btn grow" id="as-dl">${icon('download')}Download</button>
                   <button class="btn btn--primary grow" id="as-use">Use in campaign</button>`,
            onMount(el) {
                el.querySelectorAll('[data-aia]').forEach((b) => (b.onclick = () => toast(`${b.dataset.aia} started`, { icon: 'sparkle' })));
                el.querySelector('#as-dl').onclick = () => toast('Downloading ' + a.name);
                el.querySelector('#as-use').onclick = () => { Overlay.close(); App.go('campaigns'); };
                el.querySelector('#as-del').onclick = () => confirmDialog({
                    title: 'Delete asset?',
                    message: a.used.length ? `This asset is used in ${a.used.length} campaign(s). Deleting it will leave a gap in those creatives.` : 'This cannot be undone.',
                    confirmLabel: 'Delete', destructive: true,
                    onConfirm: () => {
                        DB.assets = DB.assets.filter((x) => x.name !== a.name);
                        Overlay.close();
                        App.refresh();
                        toast('Asset deleted');
                    },
                });
            },
        });
    },
};

PAGES.assets = {
    skeleton() {
        return `<div class="page__in">
            <div class="sk sk--title mb4" style="height:20px;width:130px"></div>
            <div class="agrid">${Array.from({ length: 8 }, () => '<div class="sk sk--block" style="height:150px"></div>').join('')}</div></div>`;
    },

    render() {
        const items = Assets.list();
        const filters = ['All', 'Images', 'Videos', 'Documents', 'Logos', 'AI Generated'];

        return `<div class="page__in">
            <div class="page__hd">
                <div>
                    <div class="page-title">Assets</div>
                    <div class="page-sub">Manage your creative library.</div>
                </div>
                <div class="page__tools">
                    ${contextualAI('assets')}
                    <button class="btn btn--sm" id="as-upload">${icon('upload')}Upload</button>
                    <button class="btn btn--sm btn--primary" id="as-gen">${icon('sparkle')}Generate</button>
                </div>
            </div>

            <div class="toolbar">
                <div class="input-wrap" style="width:240px">${icon('search')}
                    <input class="input" id="as-q" placeholder="Search assets…" value="${esc(Assets.query)}"></div>
                <div class="chips">
                    ${filters.map((f) => `<button class="chip ${Assets.filter === f ? 'is-on' : ''}" data-f="${f}">${f}</button>`).join('')}
                </div>
                <div class="seg push">
                    <button class="seg__i ${Assets.view === 'grid' ? 'is-on' : ''}" data-v="grid">${icon('grid')}</button>
                    <button class="seg__i ${Assets.view === 'list' ? 'is-on' : ''}" data-v="list">${icon('list')}</button>
                </div>
            </div>

            ${!items.length ? emptyState({
                ic: 'assets', accent: true,
                title: Assets.query ? 'No assets match' : 'No assets yet',
                desc: Assets.query
                    ? `Nothing found for “${esc(Assets.query)}”. Try a shorter term or clear the filter.`
                    : 'Upload your images and videos, or let AI generate on-brand creative for you.',
                action: `<button class="btn btn--sm" id="as-clear">Clear filters</button>
                         <button class="btn btn--sm btn--primary" id="as-gen2">${icon('sparkle')}Generate asset</button>`,
            })
            : Assets.view === 'grid' ? `
            <div class="agrid">
                ${items.map((a) => `
                    <div class="asset" data-a="${esc(a.name)}">
                        <div class="asset__th">
                            ${icon(a.type === 'Video' ? 'video' : a.type === 'Document' ? 'file' : a.type === 'Logo' ? 'palette' : 'image')}
                            ${a.ai ? `<span class="badge badge--urgent" style="position:absolute;top:7px;left:7px">${icon('sparkle')}AI</span>` : ''}
                        </div>
                        <div class="asset__meta">
                            <div class="t-12 w-600 truncate">${a.name}</div>
                            <div class="t-11 t-3">${a.dim} · ${a.size}</div>
                        </div>
                    </div>`).join('')}
            </div>`
            : `<section class="card">
                <div class="table-wrap">
                    <table class="table">
                        <thead><tr><th>Name</th><th>Type</th><th>Dimensions</th><th>Size</th><th>Created</th><th>Used in</th><th></th></tr></thead>
                        <tbody>
                            ${items.map((a) => `
                                <tr data-a="${esc(a.name)}" style="cursor:pointer">
                                    <td><div class="row g2"><span class="tile tile--sm">${icon(a.type === 'Video' ? 'video' : 'image')}</span>
                                        <span class="t-13 w-500">${a.name}</span>
                                        ${a.ai ? '<span class="badge badge--soft">AI</span>' : ''}</div></td>
                                    <td class="t-12 t-2">${a.type}</td><td class="t-12 t-2 tabnum">${a.dim}</td>
                                    <td class="t-12 t-2 tabnum">${a.size}</td><td class="t-12 t-2">${a.when}</td>
                                    <td class="t-12 t-2">${a.used.length || '—'}</td>
                                    <td><button class="iconbtn">${icon('dots')}</button></td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </section>`}
        </div>`;
    },

    mount(host, params) {
        // Deep link: /assets/:name opens the asset directly.
        if (params?.[0]) {
            const name = decodeURIComponent(params[0]);
            if (DB.assets.some((a) => a.name === name)) setTimeout(() => Assets.open(name), 60);
            else notify.error('That asset no longer exists');
        }

        host.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { Assets.filter = b.dataset.f; App.refresh(); }));
        host.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { Assets.view = b.dataset.v; App.refresh(); }));
        host.querySelectorAll('[data-a]').forEach((el) => (el.onclick = () => App.go('assets/' + encodeURIComponent(el.dataset.a))));

        const q = host.querySelector('#as-q');
        if (q) {
            q.oninput = () => {
                Assets.query = q.value;
                App.refresh();
                const nq = $('#as-q');
                if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }
            };
        }

        host.querySelector('#as-clear')?.addEventListener('click', () => {
            Assets.query = ''; Assets.filter = 'All'; App.refresh();
        });

        const genDialog = () => modal({
            title: 'Generate asset',
            sub: 'Uses your brand palette, typography and tone',
            body: `<div class="field mb3"><label class="label">Describe the image</label>
                    <textarea class="textarea" rows="3" placeholder="e.g. a bright clinic reception with warm morning light, minimal, no text"></textarea></div>
                <div class="grid g-2 mb3">
                    <div class="field"><label class="label">Format</label>
                        <select class="select"><option>Square 1:1</option><option>Portrait 4:5</option><option>Story 9:16</option><option>Landscape 16:9</option></select></div>
                    <div class="field"><label class="label">Variations</label>
                        <select class="select"><option>1 · 6 credits</option><option>2 · 12 credits</option><option>4 · 24 credits</option></select></div>
                </div>
                <div class="banner">${icon('info')}<div><div class="banner__d">Square fits every channel you have connected.</div></div></div>`,
            foot: `<button class="btn" data-close>Cancel</button>
                   <button class="btn btn--primary" id="ag-go">${icon('sparkle')}Generate · 6 credits</button>`,
            onMount: (el) => {
                el.querySelector('#ag-go').onclick = () => {
                    const body = el.querySelector('.modal__body');
                    const steps = ['Reading your brand palette…', 'Composing the scene…', 'Rendering at 1080×1080…', 'Done.'];
                    let i = 0;
                    const tick = () => {
                        body.innerHTML = `<div class="col g3">${steps.slice(0, i + 1).map((s, n) => `
                            <div class="row g2"><span class="act__ic ${n < i ? '' : 'act__ic--ai'}">${icon(n < i ? 'check' : 'sparkle')}</span>
                            <span class="t-13 ${n < i ? 't-2' : 'w-600'}">${s}</span></div>`).join('')}</div>`;
                        if (++i < steps.length) setTimeout(tick, 750);
                        else {
                            DB.assets.unshift({ name: 'generated-' + (DB.assets.length + 1) + '.png', type: 'Image', dim: '1080 × 1080', size: '712 KB', ai: true, when: 'Just now', used: [] });
                            DB.credits.used += 6;
                            Overlay.close();
                            App.renderShell();
                            App.refresh();
                            toast('Asset generated · 6 credits used', { icon: 'sparkle' });
                        }
                    };
                    tick();
                };
            },
        });

        host.querySelector('#as-gen')?.addEventListener('click', genDialog);
        host.querySelector('#as-gen2')?.addEventListener('click', genDialog);

        host.querySelector('#as-upload')?.addEventListener('click', () => modal({
            title: 'Upload assets',
            sub: 'PNG, JPG, SVG, MP4 · up to 25 MB each',
            body: `<div class="state" style="padding:32px;border:1.5px dashed var(--border);border-radius:var(--r)">
                    <div class="state__ic">${icon('upload')}</div>
                    <div class="state__t">Drop files here</div>
                    <div class="state__d">or browse from your computer</div>
                    <div class="state__a"><button class="btn btn--sm">Browse files</button></div></div>`,
            foot: `<button class="btn" data-close>Cancel</button>
                   <button class="btn btn--primary" onclick="Overlay.close();toast('3 files uploaded')">Upload</button>`,
        }));
    },
};
