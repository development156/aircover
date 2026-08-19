/*  Settings — a settings layout, not a wall of cards.                    */

const SET_NAV = [
    { k: 'workspace', label: 'Workspace', icon: 'layout' },
    { k: 'profile', label: 'Profile', icon: 'user' },
    { k: 'team', label: 'Team', icon: 'users' },
    { k: 'notifications', label: 'Notifications', icon: 'bell' },
    { k: 'integrations', label: 'Integrations', icon: 'connections' },
    { k: 'billing', label: 'Billing', icon: 'card' },
    { k: 'credits', label: 'Credits', icon: 'bolt' },
    { k: 'security', label: 'Security', icon: 'shield' },
];

const row = (label, hint, control) => `
    <div class="row between g4" style="padding:13px 0;border-bottom:1px solid var(--border-soft)">
        <div class="grow" style="min-width:0">
            <div class="t-13 w-600">${label}</div>
            ${hint ? `<div class="t-12 t-2 mt1">${hint}</div>` : ''}
        </div>
        <div style="flex:none">${control}</div>
    </div>`;

PAGES.settings = {
    skeleton() {
        return `<div class="page__in"><div class="sk sk--title mb4" style="height:20px;width:120px"></div>
            <div class="sk sk--block" style="height:300px"></div></div>`;
    },

    render(params) {
        const tab = params[0] && SET_NAV.some((s) => s.k === params[0]) ? params[0] : 'workspace';

        return `<div class="page__in">
            <div class="page__hd">
                <div>
                    <div class="page-title">Settings</div>
                    <div class="page-sub">Manage this workspace, your profile and how the AI behaves.</div>
                </div>
            </div>

            <div class="snav">
                <nav class="col g1">
                    ${SET_NAV.map((s) => `
                        <a class="snav__i ${tab === s.k ? 'is-on' : ''}" href="#/settings/${s.k}">
                            ${icon(s.icon)}<span>${s.label}</span></a>`).join('')}
                </nav>
                <div class="col g4">${this[tab]()}</div>
            </div>
        </div>`;
    },

    workspace() {
        return `<section class="card">
                <div class="card__head"><span class="sec-title">Workspace</span></div>
                <div class="card__body">
                    <div class="grid g-2 mb4">
                        <div class="field"><label class="label">Workspace name</label>
                            <input class="input" value="${DB.workspace.name}"></div>
                        <div class="field"><label class="label">Location</label>
                            <input class="input" value="${DB.workspace.location}"></div>
                    </div>
                    <div class="field mb4"><label class="label">Industry</label>
                        <select class="select"><option selected>Healthcare · Dental</option><option>Retail</option><option>Hospitality</option><option>Professional services</option></select></div>
                    ${row('Default timezone', 'Used for scheduling and reports', `<select class="select" style="width:220px"><option>${DB.user.tz}</option></select>`)}
                    ${row('Auto-publish approved content', 'Publish as soon as you approve, without a second confirmation', '<input type="checkbox" class="switch" checked>')}
                    ${row('AI acts without approval', 'Let AI publish low-risk content directly. Recommended off.', '<input type="checkbox" class="switch">')}
                </div>
                <div class="card__foot row g2">
                    <button class="btn btn--ghost push" data-cancel>Cancel</button>
                    <button class="btn btn--primary" data-save>Save changes</button>
                </div>
            </section>

            <section class="card">
                <div class="card__head"><span class="sec-title">Danger zone</span></div>
                <div class="card__body">
                    ${row('Delete workspace', 'Removes all campaigns, assets and history. This cannot be undone.',
                        '<button class="btn btn--sm" id="st-del">Delete workspace</button>')}
                </div>
            </section>`;
    },

    profile() {
        const u = DB.user;
        return `<section class="card">
            <div class="card__head"><span class="sec-title">Profile</span></div>
            <div class="card__body">
                <div class="row g4 mb4">
                    <span class="av av--xl">${u.initials}</span>
                    <div>
                        <div class="t-13 w-600">${u.name}</div>
                        <div class="t-12 t-2">${u.role}</div>
                        <div class="row g2 mt2">
                            <button class="btn btn--sm" data-save>${icon('upload')}Change photo</button>
                            <button class="btn btn--sm btn--ghost" data-save>Remove</button>
                        </div>
                    </div>
                </div>
                <div class="grid g-2 mb3">
                    <div class="field"><label class="label">Full name</label><input class="input" value="${u.name}"></div>
                    <div class="field"><label class="label">Email</label><input class="input" type="email" value="${u.email}"></div>
                    <div class="field"><label class="label">Role</label>
                        <select class="select"><option selected>${u.role}</option><option>Editor</option><option>Analyst</option><option>Viewer</option></select></div>
                    <div class="field"><label class="label">Language</label>
                        <select class="select"><option selected>${u.lang}</option><option>हिन्दी</option><option>ଓଡ଼ିଆ</option></select></div>
                </div>
                <div class="field"><label class="label">Timezone</label>
                    <select class="select"><option selected>${u.tz}</option><option>UTC</option></select></div>
            </div>
            <div class="card__foot row g2">
                <button class="btn btn--ghost push" data-cancel>Cancel</button>
                <button class="btn btn--primary" data-save>Save changes</button>
            </div>
        </section>`;
    },

    team() {
        return `<section class="card">
            <div class="card__head">
                <span class="sec-title">Team</span>
                <span class="count count--ink">${DB.team.length}</span>
                <button class="btn btn--sm btn--primary push" id="st-invite">${icon('plus')}Invite member</button>
            </div>
            <div class="table-wrap">
                <table class="table">
                    <thead><tr><th>Member</th><th>Role</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                        ${DB.team.map((m) => `
                            <tr>
                                <td><div class="row g2"><span class="av">${m.initials}</span>
                                    <div><div class="t-13 w-600">${m.name}</div>
                                    <div class="t-11 t-3">${m.email}</div></div></div></td>
                                <td><select class="select" style="width:150px">
                                    ${['Workspace Admin', 'Editor', 'Analyst', 'Viewer'].map((r) => `<option ${r === m.role ? 'selected' : ''}>${r}</option>`).join('')}
                                </select></td>
                                <td>${statusBadge(m.status === 'Active' ? 'Active' : 'Invited')}</td>
                                <td><button class="iconbtn" data-member="${m.name}">${icon('dots')}</button></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div class="card__foot">
                <div class="banner">${icon('info')}
                    <div><div class="banner__t">What roles can do</div>
                    <div class="banner__d">Admins manage billing and connections · Editors create and approve · Analysts read everything · Viewers read reports only.</div></div>
                </div>
            </div>
        </section>`;
    },

    notifications() {
        const group = (title, items) => `
            <section class="card">
                <div class="card__head"><span class="sec-title">${title}</span></div>
                <div class="card__body">
                    ${items.map(([l, h, on]) => row(l, h, `<input type="checkbox" class="switch" ${on ? 'checked' : ''}>`)).join('')}
                </div>
            </section>`;

        return group('Email', [
            ['Approval requests', 'When AI produces something that needs your decision', true],
            ['Daily summary', 'One digest at 8 AM covering the previous day', true],
            ['Weekly report', 'Performance summary every Monday', true],
            ['Campaign alerts', 'Budget pacing, sudden drops, policy rejections', false],
        ]) + group('Push', [
            ['Urgent approvals', 'Anything due within 3 hours', true],
            ['AI activity', 'Every action the assistant completes', false],
            ['Connection issues', 'A channel needs reauthorization', true],
        ]) + group('In-app', [
            ['Mentions', 'A teammate mentions you in a comment', true],
            ['Content opportunities', 'AI spots something worth posting about', true],
        ]);
    },

    integrations() {
        return `<section class="card">
            <div class="card__head">
                <span class="sec-title">Connected platforms</span>
                <a class="link push" href="#/connections">Open connections ${icon('right')}</a>
            </div>
            ${DB.connections.slice(0, 8).map((c) => `
                <div class="lrow" style="cursor:default">
                    <span class="tile tile--brand tile--sm">${brandIcon(c.k)}</span>
                    <div class="grow"><div class="t-13 w-600">${PLATFORM_LABEL[c.k]}</div>
                    <div class="t-11 t-3">${c.account}</div></div>
                    ${statusBadge(c.status)}
                </div>`).join('')}
        </section>

        <section class="card">
            <div class="card__head"><span class="sec-title">API access</span></div>
            <div class="card__body">
                ${row('API key', 'Use this to push data into Sahoda from your own systems',
                    `<div class="row g2"><input class="input" style="width:200px" value="sk_live_••••••••4f2a" readonly>
                    <button class="btn btn--sm" data-save>${icon('copy')}Copy</button></div>`)}
                ${row('Webhook URL', 'We POST every published event here', '<input class="input" style="width:260px" placeholder="https://…">')}
            </div>
        </section>`;
    },

    billing() {
        return `<section class="card">
                <div class="card__head"><span class="sec-title">Current plan</span>
                    <span class="badge badge--active push">Growth</span></div>
                <div class="card__body">
                    <div class="row between mb4">
                        <div>
                            <div class="t-24 w-650">₹7,999<span class="t-13 t-2 w-500">/month</span></div>
                            <div class="t-12 t-2 mt1">Renews on 1 August 2026 · 3 workspaces · 300 credits/month</div>
                        </div>
                        <button class="btn btn--primary" id="st-upgrade">Upgrade plan</button>
                    </div>
                    ${row('Payment method', 'Visa ending 4218 · expires 09/28', '<button class="btn btn--sm" data-save>Update</button>')}
                    ${row('Billing email', DB.user.email, '<button class="btn btn--sm" data-save>Change</button>')}
                    ${row('GST number', 'Added to every invoice', '<input class="input" style="width:200px" value="21AABCS1429B1ZQ">')}
                </div>
            </section>

            <section class="card">
                <div class="card__head"><span class="sec-title">Invoices</span></div>
                <div class="table-wrap">
                    <table class="table">
                        <thead><tr><th>Invoice</th><th>Date</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>
                        <tbody>${DB.invoices.map((i) => `
                            <tr><td class="t-13 w-500">${i.id}</td><td class="t-12 t-2">${i.date}</td>
                            <td class="num tabnum">${i.amount}</td><td>${statusBadge('Paid')}</td>
                            <td><button class="btn btn--sm" data-save>${icon('download')}PDF</button></td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </section>`;
    },

    credits() {
        const c = DB.credits;
        return `<section class="card">
                <div class="card__head"><span class="sec-title">Credits</span>
                    <span class="t-11 t-3 push">Refills on ${c.refill}</span></div>
                <div class="card__body">
                    <div class="row g4 mb4">
                        ${ring(Math.round((c.left / c.total) * 100), { size: 72, stroke: 6, label: c.left })}
                        <div>
                            <div class="t-20 w-650 tabnum">${c.left} <span class="t-13 t-2 w-500">of ${c.total} left</span></div>
                            <div class="t-12 t-2 mt1">You have used ${c.used} credits this cycle. At the current rate you will finish the month with about 40 to spare.</div>
                            <button class="btn btn--sm btn--primary mt3" id="st-topup">${icon('plus')}Buy more credits</button>
                        </div>
                    </div>
                    <div class="eyebrow mb2">Usage by type</div>
                    ${DB.creditUse.map((u) => `
                        <div style="padding:9px 0">
                            <div class="row between mb2">
                                <span class="t-12">${u.t}</span>
                                <span class="t-12 w-600 tabnum">${u.n}</span>
                            </div>
                            ${shareBar(Math.round((u.n / c.total) * 100))}
                        </div>`).join('')}
                </div>
            </section>

            <section class="card">
                <div class="card__head"><span class="sec-title">What costs what</span></div>
                <div class="card__body">
                    ${[['Text generation', '1 credit'], ['Image generation', '6 credits'], ['Video generation', '20 credits'],
                       ['Research & competitor analysis', '4 credits'], ['Campaign strategy', '8 credits']].map(([k, v]) => `
                        <div class="row between" style="padding:8px 0;border-bottom:1px solid var(--border-soft)">
                            <span class="t-13">${k}</span><span class="t-13 w-600">${v}</span></div>`).join('')}
                </div>
            </section>`;
    },

    security() {
        return `<section class="card">
                <div class="card__head"><span class="sec-title">Security</span></div>
                <div class="card__body">
                    ${row('Password', 'Last changed 3 months ago', '<button class="btn btn--sm" data-save>Change password</button>')}
                    ${row('Two-factor authentication', 'Require a code from your authenticator app at sign-in', '<input type="checkbox" class="switch" checked>')}
                    ${row('Single sign-on', 'Available on the Enterprise plan', '<button class="btn btn--sm" aria-disabled="true">Upgrade required</button>')}
                </div>
            </section>

            <section class="card">
                <div class="card__head"><span class="sec-title">Active sessions</span></div>
                <div class="card__body">
                    ${[['Windows · Chrome', 'Bhubaneswar, India · current session', true],
                       ['iPhone 15 · Safari', 'Bhubaneswar, India · 2 hours ago', false],
                       ['MacBook · Chrome', 'Cuttack, India · 3 days ago', false]].map(([d, m, cur]) => `
                        <div class="row between g3" style="padding:11px 0;border-bottom:1px solid var(--border-soft)">
                            <span class="tile tile--sm">${icon(d.includes('iPhone') ? 'phone' : 'layout')}</span>
                            <div class="grow"><div class="t-13 w-600">${d}</div><div class="t-11 t-3">${m}</div></div>
                            ${cur ? '<span class="badge badge--calm">This device</span>'
                                  : '<button class="btn btn--sm" data-save>Revoke</button>'}
                        </div>`).join('')}
                </div>
                <div class="card__foot">
                    <button class="btn btn--sm" id="st-revoke">Sign out of all other sessions</button>
                </div>
            </section>`;
    },

    mount(host) {
        host.querySelectorAll('[data-save]').forEach((b) => (b.onclick = () => toast('Changes saved')));
        host.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = () => App.refresh()));
        host.querySelectorAll('.switch').forEach((s) => (s.onchange = () => toast(s.checked ? 'Enabled' : 'Disabled')));

        host.querySelector('#st-invite')?.addEventListener('click', () => modal({
            title: 'Invite team member',
            body: `<div class="field mb3"><label class="label">Email address</label>
                    <input class="input" type="email" placeholder="name@company.com"></div>
                <div class="field mb3"><label class="label">Role</label>
                    <select class="select"><option>Editor</option><option>Analyst</option><option>Viewer</option><option>Workspace Admin</option></select></div>
                <div class="banner">${icon('info')}<div><div class="banner__d">They receive an email invitation valid for 7 days.</div></div></div>`,
            foot: `<button class="btn" data-close>Cancel</button>
                   <button class="btn btn--primary" onclick="Overlay.close();toast('Invitation sent')">Send invite</button>`,
        }));

        host.querySelectorAll('[data-member]').forEach((b) => (b.onclick = () => menu(b, [
            { label: 'Change role', icon: 'user', on: () => toast('Role updated') },
            { label: 'Resend invite', icon: 'mail', on: () => toast('Invitation resent') },
            { sep: true },
            { label: 'Remove from workspace', icon: 'trash', on: () => confirmDialog({
                title: 'Remove member?',
                message: `${b.dataset.member} loses access immediately. Their published content stays.`,
                confirmLabel: 'Remove', destructive: true,
                onConfirm: () => {
                    DB.team = DB.team.filter((m) => m.name !== b.dataset.member);
                    App.refresh();
                    toast('Member removed');
                },
            }) },
        ])));

        host.querySelector('#st-upgrade')?.addEventListener('click', () => modal({
            title: 'Upgrade plan',
            sub: 'Change any time — we prorate the difference',
            body: `<div class="grid g-3 g-1-m" style="gap:10px">
                ${[['Starter', '₹2,999', '100 credits · 1 workspace'],
                   ['Growth', '₹7,999', '300 credits · 3 workspaces'],
                   ['Scale', '₹19,999', '1,000 credits · unlimited']].map(([n, p, d], i) => `
                    <div class="card card--pad col g2" style="${i === 1 ? 'box-shadow:inset 0 0 0 1.5px var(--orange)' : ''}">
                        <div class="row between"><span class="t-13 w-600">${n}</span>
                        ${i === 1 ? '<span class="badge badge--active">Current</span>' : ''}</div>
                        <div class="t-20 w-650">${p}</div>
                        <div class="t-11 t-3">${d}</div>
                        <button class="btn btn--sm ${i === 2 ? 'btn--primary' : ''} btn--block mt2"
                            ${i === 1 ? 'aria-disabled="true"' : ''}>${i === 1 ? 'Current plan' : i === 2 ? 'Upgrade' : 'Downgrade'}</button>
                    </div>`).join('')}
            </div>`,
            large: true,
        }));

        host.querySelector('#st-topup')?.addEventListener('click', () => modal({
            title: 'Buy credits',
            body: `<div class="col g2">
                ${[['100 credits', '₹1,499'], ['300 credits', '₹3,999'], ['1,000 credits', '₹11,999']].map(([n, p], i) => `
                    <button class="card card--pad row between" data-buy="${n}" style="${i === 1 ? 'box-shadow:inset 0 0 0 1.5px var(--orange)' : ''}">
                        <span class="t-13 w-600">${n}</span><span class="t-13">${p}</span></button>`).join('')}
            </div>`,
            onMount: (el) => el.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => {
                Overlay.close();
                toast(`${b.dataset.buy} added to your balance`);
            })),
        }));

        host.querySelector('#st-revoke')?.addEventListener('click', () => toast('Signed out of 2 other sessions'));

        host.querySelector('#st-del')?.addEventListener('click', () => confirmDialog({
            title: 'Delete this workspace?',
            message: 'All campaigns, assets, conversations and brand data are permanently removed. This cannot be undone.',
            confirmLabel: 'Delete workspace', destructive: true,
            onConfirm: () => toast('Deletion requires email confirmation — check your inbox', { icon: 'mail' }),
        }));
    },
};
