/*  Conversations — omnichannel inbox. Three columns on desktop; on mobile
    the list and the thread swap places so neither is cramped.           */

const Inbox = {
    channel: 'All',
    active: 'v1',
    mobileView: 'list',

    list() {
        return this.channel === 'All' ? DB.conversations
            : DB.conversations.filter((c) => c.platform === this.channel);
    },

    current() {
        return DB.conversations.find((c) => c.id === this.active) || DB.conversations[0];
    },
};

PAGES.conversations = {
    skeleton() {
        return `<div class="page__in">
            <div class="sk sk--title mb4" style="height:20px;width:190px"></div>
            <div class="card">${skeletonList(6)}</div></div>`;
    },

    render() {
        const items = Inbox.list();
        const c = Inbox.current();
        const channels = ['All', 'instagram', 'whatsapp', 'facebook', 'website'];

        return `<div class="inbox ${Inbox.mobileView === 'list' ? 'show-list' : ''}" id="inbox-root">

            <!-- conversation list -->
            <div class="inbox__col inbox__col--list">
                <div class="inbox__hd">
                    <div class="row between mb3">
                        <span class="sec-title">Inbox</span>
                        <span class="count">${DB.conversations.reduce((n, x) => n + x.unread, 0)}</span>
                    </div>
                    <div class="input-wrap mb3">${icon('search')}
                        <input class="input" id="ib-q" placeholder="Search conversations…"></div>
                    <div class="chips">
                        ${channels.map((ch) => `
                            <button class="chip ${Inbox.channel === ch ? 'is-on' : ''}" data-ch="${ch}">
                                ${ch === 'All' ? 'All' : PLATFORM_LABEL[ch]}</button>`).join('')}
                    </div>
                </div>
                <div class="inbox__scroll" id="ib-list">
                    ${items.length ? items.map((v) => `
                        <div class="lrow ${v.id === Inbox.active ? 'is-on' : ''}" data-v="${v.id}" data-name="${esc(v.name.toLowerCase())}">
                            <span class="av">${initials(v.name)}</span>
                            <div class="grow" style="min-width:0">
                                <div class="row g2">
                                    <span class="t-13 w-600 truncate grow">${v.name}</span>
                                    <span class="t-11 t-3">${v.time}</span>
                                </div>
                                <div class="row g2 mt1">
                                    ${brandIcon(v.platform, 'bic--sm')}
                                    <span class="t-12 t-2 truncate grow">${v.last}</span>
                                    ${v.unread ? `<span class="count">${v.unread}</span>` : ''}
                                </div>
                            </div>
                        </div>`).join('')
                        : emptyState({ ic: 'inbox', title: 'No conversations', desc: 'Nothing on this channel yet. Messages arrive here from every connected inbox.' })}
                </div>
            </div>

            <!-- thread -->
            <div class="inbox__col inbox__col--thread">
                ${c ? `
                <div class="inbox__hd row g3">
                    <button class="iconbtn m-only" id="ib-back">${icon('left')}</button>
                    <span class="av">${initials(c.name)}</span>
                    <div class="grow" style="min-width:0">
                        <div class="row g2"><span class="t-13 w-600 truncate">${c.name}</span>${statusBadge(c.priority === 'High' ? 'High' : 'Low')}</div>
                        <div class="row g1 t-11 t-3">${brandIcon(c.platform, 'bic--sm')}<span>${PLATFORM_LABEL[c.platform]}</span></div>
                    </div>
                    <button class="iconbtn" id="ib-ctx">${icon('user')}</button>
                    <button class="iconbtn" id="ib-more">${icon('dots')}</button>
                </div>

                <div class="inbox__scroll">
                    <div class="msgs">
                        ${DB.thread.map((m) => `
                            <div class="msg ${m.me ? 'msg--out' : ''}">
                                ${m.me ? '' : `<span class="av av--sm">${initials(c.name)}</span>`}
                                <div>
                                    <div class="msg__b">${esc(m.t)}</div>
                                    <div class="msg__m">${m.at}</div>
                                </div>
                            </div>`).join('')}
                    </div>
                </div>

                <div class="composer">
                    <div class="row g2 mb2 wrap">
                        <button class="btn btn--sm btn--accent-ghost" id="ib-gen">${icon('sparkle')}Generate reply</button>
                        ${['Rewrite', 'Shorten', 'Expand', 'Change tone', 'Translate'].map((a) => `
                            <button class="btn btn--sm" data-ai="${a}">${a}</button>`).join('')}
                    </div>
                    <div class="row g2" style="align-items:flex-end">
                        <textarea class="textarea grow" id="ib-input" rows="2" placeholder="Write a reply…"></textarea>
                        <button class="btn btn--primary" id="ib-send" style="height:38px">${icon('send')}Send</button>
                    </div>
                </div>` : emptyState({ ic: 'conversations', title: 'No conversation selected', desc: 'Pick a conversation from the list to start replying.' })}
            </div>

            <!-- customer context -->
            <div class="inbox__col inbox__col--ctx">
                ${c ? `
                <div class="inbox__hd"><span class="sec-title">Customer</span></div>
                <div class="inbox__scroll" style="padding:16px">
                    <div class="col g2" style="align-items:center;text-align:center">
                        <span class="av av--xl">${initials(c.name)}</span>
                        <div class="t-14 w-600 mt2">${c.name}</div>
                        <div class="t-12 t-2">${PLATFORM_LABEL[c.platform]} · ${c.tags.join(', ')}</div>
                    </div>

                    <div class="grid g-2 mt4" style="gap:8px">
                        <div class="card card--line" style="padding:9px 11px">
                            <div class="t-11 t-3">Orders</div><div class="t-14 w-650 tabnum">${c.orders}</div></div>
                        <div class="card card--line" style="padding:9px 11px">
                            <div class="t-11 t-3">Lifetime</div><div class="t-14 w-650 tabnum">${c.spend}</div></div>
                    </div>

                    <div class="ai-note mt4">
                        <span class="ai-mark">${icon('sparkle')}</span>
                        <div><div class="ai-note__t">AI summary</div>
                        <div class="ai-note__d">Returning patient. Asked about Saturday availability twice — likely to book if given a direct slot rather than a callback.</div></div>
                    </div>

                    <div class="eyebrow mt4 mb2">Suggested response</div>
                    <div class="card card--line" style="padding:11px">
                        <p class="t-12">Saturday 11:30 AM with Dr. Rao is open — shall I hold it for you?</p>
                        <button class="btn btn--sm btn--primary btn--block mt3" id="ib-use">Use this reply</button>
                    </div>

                    <div class="eyebrow mt4 mb2">Previous conversations</div>
                    <div class="col g2">
                        ${['Rescheduled cleaning · 12 Jun', 'Asked about braces · 4 Apr', 'First enquiry · 21 Jan'].map((t) => `
                            <div class="row g2"><span class="dot"></span><span class="t-12 t-2">${t}</span></div>`).join('')}
                    </div>

                    <div class="eyebrow mt4 mb2">Notes</div>
                    <textarea class="textarea" rows="3" placeholder="Add an internal note…"></textarea>
                </div>` : ''}
            </div>
        </div>`;
    },

    mount(host, params) {
        // The inbox owns the full viewport height rather than scrolling the page.
        host.style.height = '100%';
        host.parentElement.style.overflow = 'hidden';

        // Deep link: /conversations/:id selects that thread.
        if (params?.[0] && params[0] !== Inbox.active) {
            const conv = DB.conversations.find((c) => c.id === params[0]);
            if (conv) {
                Inbox.active = conv.id;
                conv.unread = 0;
                Inbox.mobileView = 'thread';
                App.refresh();
                App.renderShell();
                return;
            }
            notify.error('That conversation no longer exists');
        }

        host.querySelectorAll('[data-ch]').forEach((b) => (b.onclick = () => { Inbox.channel = b.dataset.ch; App.refresh(); }));

        host.querySelectorAll('[data-v]').forEach((r) => (r.onclick = () => App.go('conversations/' + r.dataset.v)));

        host.querySelector('#ib-back')?.addEventListener('click', () => { Inbox.mobileView = 'list'; App.refresh(); });

        const q = host.querySelector('#ib-q');
        q.oninput = () => {
            const t = q.value.toLowerCase();
            host.querySelectorAll('[data-name]').forEach((r) => r.classList.toggle('hide', !r.dataset.name.includes(t)));
        };

        const input = host.querySelector('#ib-input');

        host.querySelector('#ib-gen')?.addEventListener('click', (e) => {
            const b = e.currentTarget;
            const old = b.innerHTML;
            b.innerHTML = `<span class="thinking"><span>Writing</span><i></i><i></i><i></i></span>`;
            setTimeout(() => {
                input.value = 'Saturday 11:30 AM with Dr. Rao is open — shall I hold it for you? It is a 45-minute slot and includes the full checkup.';
                b.innerHTML = old;
                input.focus();
                toast('Reply generated · 1 credit', { icon: 'sparkle' });
            }, 900);
        });

        host.querySelectorAll('[data-ai]').forEach((b) => (b.onclick = () => {
            if (!input.value.trim()) return toast('Write something first, then refine it', { icon: 'info' });
            toast(`${b.dataset.ai} applied`, { icon: 'wand' });
        }));

        host.querySelector('#ib-use')?.addEventListener('click', () => {
            input.value = 'Saturday 11:30 AM with Dr. Rao is open — shall I hold it for you?';
            input.focus();
        });

        const send = () => {
            if (!input.value.trim()) return;
            DB.thread.push({ me: true, t: input.value.trim(), at: 'Now' });
            input.value = '';
            App.refresh();
            toast('Message sent');
        };

        host.querySelector('#ib-send')?.addEventListener('click', send);
        input?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); });

        host.querySelector('#ib-more')?.addEventListener('click', (e) => menu(e.currentTarget, [
            { label: 'Mark as unread', icon: 'inbox', on: () => toast('Marked unread') },
            { label: 'Add tag', icon: 'flag', on: () => toast('Tag added') },
            { label: 'Assign to teammate', icon: 'users', on: () => toast('Assigned') },
            { sep: true },
            { label: 'Archive', icon: 'archive', on: () => toast('Conversation archived') },
        ]));

        // On narrow screens the context column is a sheet instead of a column.
        host.querySelector('#ib-ctx')?.addEventListener('click', () => {
            const c = Inbox.current();
            drawer({
                title: c.name,
                sub: `${PLATFORM_LABEL[c.platform]} · ${c.tags.join(', ')}`,
                body: `<div class="grid g-2 mb4" style="gap:8px">
                        <div class="card card--line" style="padding:10px 12px"><div class="t-11 t-3">Orders</div>
                            <div class="t-16 w-650 tabnum">${c.orders}</div></div>
                        <div class="card card--line" style="padding:10px 12px"><div class="t-11 t-3">Lifetime value</div>
                            <div class="t-16 w-650 tabnum">${c.spend}</div></div>
                    </div>
                    <div class="ai-note"><span class="ai-mark">${icon('sparkle')}</span>
                        <div><div class="ai-note__t">AI summary</div>
                        <div class="ai-note__d">Returning patient, asked about Saturday twice. Offer a specific slot rather than a callback.</div></div></div>`,
            });
        });
    },
};
