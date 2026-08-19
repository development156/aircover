/*  Mascot chat — the assistant's single conversational surface.
    ---------------------------------------------------------------------
    Deliberately one surface, not two: the header sparkle, the per-page
    contextual AI buttons, the command palette and Home's ask bar all open
    this. Two places to talk to the same assistant is exactly the kind of
    duplication the rest of the product avoids.

    The launcher is the robot's head, and its expression tracks the real
    workspace state — so a red face in the corner is a faster signal than
    a badge, and it is honest: it only ever reflects what the pages say. */

const Chat = {
    open: false,
    busy: false,
    messages: [],
    greeted: false,

    /* ------------------------------------------------------------ boot */

    init() {
        if ($('#chat-fab')) return;

        const fab = document.createElement('button');
        fab.id = 'chat-fab';
        fab.className = 'chat-fab';
        fab.setAttribute('aria-label', 'Open Sahoda AI');
        fab.setAttribute('aria-expanded', 'false');
        document.body.append(fab);
        fab.onclick = () => this.toggle();

        this.paintFab();

        // One proactive nudge per session, and only if something is waiting.
        setTimeout(() => this.peek(), 6000);
    },

    /** The face and badge always mirror the pages — never invented urgency. */
    paintFab() {
        const fab = $('#chat-fab');
        if (!fab) return;

        const mood = workspaceMood();
        const m = MASCOT[mood] || MASCOT.happy;
        const pending = DB.approvals.filter((a) => a.status === 'pending').length;

        // The launcher *is* the screen, so the face goes in bare — wrapping
        // it in a .mface would draw a second bezel inside the first.
        fab.innerHTML = `<img src="${m.src}" alt="" aria-hidden="true" decoding="async">
            ${pending ? `<span class="chat-fab__n">${pending}</span>` : ''}`;
        fab.classList.toggle('is-alert', mood === 'alert');
        fab.classList.toggle('is-open', this.open);
        fab.setAttribute('aria-expanded', String(this.open));
        fab.setAttribute('aria-label', `Sahoda AI — ${m.label}`);
    },

    /* ------------------------------------------------------------ peek */

    peek() {
        if (this.open || sessionStorage.getItem('sahoda-peeked')) return;

        const pending = DB.approvals.filter((a) => a.status === 'pending');
        const broken = DB.connections.filter((c) => c.status === 'error');
        if (!pending.length && !broken.length) return;

        const msg = broken.length
            ? `${PLATFORM_LABEL[broken[0].k]} needs reconnecting — publishing to it is paused.`
            : `${pending.length} item${pending.length > 1 ? 's are' : ' is'} waiting on your approval.`;

        sessionStorage.setItem('sahoda-peeked', '1');

        const el = document.createElement('div');
        el.className = 'chat-peek';
        el.innerHTML = `<button class="chat-peek__x" aria-label="Dismiss">${icon('x')}</button>${esc(msg)}`;
        document.body.append(el);

        const kill = () => {
            el.classList.add('is-closing');
            setTimeout(() => el.remove(), 170);
        };
        el.querySelector('.chat-peek__x').onclick = (e) => { e.stopPropagation(); kill(); };
        el.onclick = () => { kill(); this.toggle(true, msg.startsWith('2') ? '' : ''); };
        setTimeout(kill, 9000);
    },

    /* ----------------------------------------------------------- panel */

    toggle(force, prefill = '') {
        const want = force ?? !this.open;
        if (want === this.open) {
            if (prefill) this.send(prefill);
            return;
        }
        this.open = want;
        this.open ? this.mountPanel(prefill) : this.closePanel();
        this.paintFab();
    },

    mountPanel(prefill) {
        document.body.classList.add('chat-open');
        $('.chat-peek')?.remove();

        const el = document.createElement('section');
        el.className = 'chat';
        el.id = 'chat-panel';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Sahoda AI assistant');
        el.innerHTML = `
            <header class="chat__hd">
                ${mascot(this.busy ? 'working' : workspaceMood())}
                <div class="grow">
                    <div class="chat__name">Sahoda AI</div>
                    <div class="chat__status" id="chat-status">
                        <span class="dot"></span>Online · full workspace context</div>
                </div>
                <button class="iconbtn" id="chat-min" aria-label="Minimise">${icon('minus')}</button>
                <button class="iconbtn" id="chat-x" aria-label="Close">${icon('x')}</button>
            </header>
            <div class="chat__body" id="chat-body" role="log" aria-live="polite">
                ${this.messages.length ? '' : `<div class="mascot-hero mb1" role="img" aria-label="Sahoda assistant"></div>`}
            </div>
            <div class="chat__chips" id="chat-chips"></div>
            <footer class="chat__ft">
                <div class="chat__in">
                    <textarea id="chat-in" rows="1" placeholder="Ask anything about your marketing…"></textarea>
                    <button class="chat__send" id="chat-send" aria-label="Send">${icon('send')}</button>
                </div>
                <div class="chat__hint">Enter to send · Shift + Enter for a new line</div>
            </footer>`;
        document.body.append(el);

        // Keep the character portrait across the first paint, then let the
        // thread take over — it is a greeting, not permanent furniture.
        this.hero = el.querySelector('.mascot-hero');
        if (this.hero) mountMascot3D(this.hero);

        // First open gets an opening line that reflects the actual workspace.
        if (!this.greeted) {
            this.greeted = true;
            this.messages.push({ me: false, text: this.opener(), at: this.now() });
        }

        this.paintMessages();
        this.paintChips();

        const input = el.querySelector('#chat-in');
        const send = el.querySelector('#chat-send');

        el.querySelector('#chat-x').onclick = () => this.toggle(false);
        el.querySelector('#chat-min').onclick = () => this.toggle(false);

        // Grows with the message, up to the CSS cap.
        input.oninput = () => {
            input.style.height = 'auto';
            input.style.height = `${Math.min(input.scrollHeight, 96)}px`;
            send.disabled = !input.value.trim();
        };
        send.disabled = true;

        input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.send(input.value);
                input.value = '';
                input.style.height = 'auto';
                send.disabled = true;
            }
            if (e.key === 'Escape') this.toggle(false);
        };

        send.onclick = () => {
            this.send(input.value);
            input.value = '';
            input.style.height = 'auto';
            send.disabled = true;
        };

        if (!isMobile()) setTimeout(() => input.focus(), 120);
        if (prefill) setTimeout(() => this.send(prefill), 220);
    },

    closePanel() {
        const el = $('#chat-panel');
        document.body.classList.remove('chat-open');
        // Never leave a WebGL context running behind a closed panel.
        if (el?.querySelector('.mascot-3d')) disposeMascot3D();
        this.hero = null;
        if (!el) return;
        el.classList.add('is-closing');
        reducedMotion() ? el.remove() : setTimeout(() => el.remove(), 180);
    },

    /* -------------------------------------------------------- messages */

    now() {
        return 'now';
    },

    opener() {
        const pending = DB.approvals.filter((a) => a.status === 'pending').length;
        const broken = DB.connections.filter((c) => c.status === 'error');
        if (broken.length) {
            return `Hi ${DB.user.short} — heads up, ${PLATFORM_LABEL[broken[0].k]} needs reconnecting, so anything scheduled for it is paused. Want me to walk you through it?`;
        }
        if (pending) {
            return `Hi ${DB.user.short}. ${pending} item${pending > 1 ? 's are' : ' is'} waiting on your approval, and reach is up 18.3% this week. What do you want to look at?`;
        }
        return `Hi ${DB.user.short}. Everything is running — nothing needs your approval right now. Ask me anything about your marketing.`;
    },

    paintMessages() {
        const body = $('#chat-body');
        if (!body) return;
        // Preserve the portrait while the thread is still just the greeting.
        const hero = this.messages.length <= 1 && this.hero?.isConnected ? this.hero.outerHTML : '';
        body.innerHTML = hero + this.messages.map((m) => `
            <div class="cmsg ${m.me ? 'cmsg--me' : ''}">
                ${m.me ? '' : mascot('happy', 'mface--sm')}
                <div>
                    <div class="cmsg__b">${m.streamed ? '' : esc(m.text)}</div>
                    <div class="cmsg__t">${m.at}</div>
                </div>
            </div>`).join('');
        this.scroll();
    },

    paintChips() {
        const host = $('#chat-chips');
        if (!host) return;

        // Suggestions follow the page you are on, so they are usually one tap.
        const perRoute = {
            approvals: ['What should I approve first?', 'Any risk in these posts?'],
            planner: ['Optimise next week', 'Where are the gaps?'],
            analytics: ['Why did revenue move?', 'Which channel to cut?'],
            campaigns: ['Where is budget being wasted?', 'Best performing creative?'],
            conversations: ['Draft a reply', 'Summarise this customer'],
            brand: ['Sharpen my brand voice', 'What is missing?'],
            connections: ['Any connection at risk?'],
            assets: ['Make a variation', 'What is unused?'],
        };
        const chips = perRoute[App.route] || ['What changed today?', 'What should I do next?'];

        host.innerHTML = chips.map((c) => `<button class="chat__chip">${esc(c)}</button>`).join('');
        host.querySelectorAll('.chat__chip').forEach((b) => {
            b.onclick = () => this.send(b.textContent);
        });
    },

    scroll() {
        const body = $('#chat-body');
        if (body) body.scrollTop = body.scrollHeight;
    },

    setStatus(text, working) {
        const s = $('#chat-status');
        if (s) s.innerHTML = `<span class="dot"></span>${esc(text)}`;
        setMascot($('#chat-panel .mface'), working ? 'working' : workspaceMood());
    },

    /* ------------------------------------------------------------ send */

    send(text) {
        const q = String(text || '').trim();
        if (!q || this.busy) return;

        this.messages.push({ me: true, text: q, at: this.now() });
        this.paintMessages();
        $('#chat-chips')?.classList.add('hide');

        this.busy = true;
        this.setStatus('Thinking…', true);

        const body = $('#chat-body');
        const typing = document.createElement('div');
        typing.className = 'ctyping';
        typing.innerHTML = `${mascot('working', 'mface--sm')}
            <div class="ctyping__b"><i></i><i></i><i></i></div>`;
        body?.append(typing);
        this.scroll();

        const answer = this.answer(q);

        setTimeout(() => {
            typing.remove();
            this.busy = false;
            this.setStatus('Online · full workspace context', false);

            const msg = { me: false, text: answer, at: this.now(), streamed: true };
            this.messages.push(msg);
            this.paintMessages();

            // Stream the reply so it reads as being written, not pasted.
            const bubbles = $$('#chat-body .cmsg:not(.cmsg--me) .cmsg__b');
            const last = bubbles[bubbles.length - 1];
            if (last) {
                stream(last, answer, {
                    onDone: () => { msg.streamed = false; this.scroll(); },
                });
                const t = setInterval(() => this.scroll(), 120);
                setTimeout(() => clearInterval(t), answer.length * 12 + 900);
            }

            $('#chat-chips')?.classList.remove('hide');
            this.paintChips();
        }, 700 + Math.min(q.length * 8, 500));
    },

    /*  Answers are grounded in DB, so the assistant never contradicts the
        page behind it. Not a language model — a lookup with a voice.    */
    answer(q) {
        const s = q.toLowerCase();
        const pending = DB.approvals.filter((a) => a.status === 'pending');
        const broken = DB.connections.filter((c) => c.status === 'error');

        if (/approv|review|waiting|first/.test(s)) {
            if (!pending.length) return 'Nothing is waiting — the approval queue is clear.';
            const top = pending.slice().sort((a, b) => a.dueSort - b.dueSort)[0];
            return `Start with “${top.title}” — it is ${top.priority.toLowerCase()} priority and ${top.due.toLowerCase()}.\n\n${top.ai}\n\nThere ${pending.length > 1 ? `are ${pending.length} items` : 'is 1 item'} in the queue. Press A on the approvals page to approve without leaving the keyboard.`;
        }

        if (/connect|reconnect|risk|broken|integration/.test(s)) {
            if (!broken.length) return 'All connections are healthy. The most recent sync was under two minutes ago.';
            return `${PLATFORM_LABEL[broken[0].k]} is the one to fix — its authorization expired ${broken[0].sync}, so scheduled posts to it are paused. Nothing has been lost; reconnecting resumes the queue.`;
        }

        if (/revenue|money|sales|roas/.test(s)) {
            return `Revenue is ₹24.8K, up 16.2% week over week. ROAS slipped 3.1% to 4.2x — the gap is Google Ads, where 38% of budget lands between 1–5 AM at a 0.4% conversion rate.\n\nAdding a dayparting rule for 8 AM – 9 PM would recover roughly ₹6,200.`;
        }

        if (/channel|cut|budget|waste/.test(s)) {
            const best = DB.channelPerf[0];
            const worst = DB.channelPerf[DB.channelPerf.length - 1];
            return `${PLATFORM_LABEL[best.k]} is carrying you — ${best.share}% of revenue at ${best.eng} engagement.\n\n${PLATFORM_LABEL[worst.k]} is the weakest at ${worst.share}%, but it is also your cheapest. I would not cut it yet; give it two more weeks of Reels first.`;
        }

        if (/plan|schedule|week|gap|optimis|optimiz/.test(s)) {
            return `Next week has 5 scheduled items with nothing on Saturday or Sunday.\n\nYour audience is most active 9:40–10:20 on weekdays, and Reels are outperforming static posts 3.1x. I would move three of the five to Reels and add one weekend story.`;
        }

        if (/brand|voice|tone|missing/.test(s)) {
            return `Brand Brain is ${DB.brand.completeness}% complete. The gap is a secondary audience — 28% of bookings come from parents aged 30–40 booking for children, and that group is not described anywhere.\n\nAdding it would noticeably sharpen paediatric content.`;
        }

        if (/reply|customer|conversation|summar/.test(s)) {
            const c = DB.conversations[0];
            return `${c.name} has asked about Saturday availability twice — she is likely to book if given a specific slot rather than a callback.\n\nSuggested: “Saturday 11:30 AM with Dr. Rao is open — shall I hold it for you?”`;
        }

        if (/change|today|next|do/.test(s)) {
            return `Today: I generated 3 Instagram posts, scheduled 4, replied to 12 customers and found 2 content opportunities.\n\nWhat needs you: ${pending.length} approval${pending.length === 1 ? '' : 's'}${broken.length ? ` and a broken ${PLATFORM_LABEL[broken[0].k]} connection` : ''}. Everything else is running.`;
        }

        if (/asset|variation|unused|image/.test(s)) {
            const unused = DB.assets.filter((a) => !a.used.length).length;
            return `You have ${DB.assets.length} assets, ${unused} of them unused. “whitening-hero.png” is your strongest performer — I can generate three variations from it for 6 credits each.`;
        }

        return `I can look at approvals, campaigns, analytics, your planner, brand voice, connections or customer conversations — and I have this workspace's full context.\n\nWhat would be most useful right now?`;
    },
};
