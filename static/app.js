// Board page: ask, upvote, live updates, sharing and host moderation.
(() => {
    'use strict';
    const { store, titleFromSlug, rememberBoard } = window.BB;

    const SLUG = document.body.dataset.board;
    const MAX_CHARS = 280;
    const POLL_MS = 4000;
    const MAX_FIZZ = 10;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

    const $ = id => document.getElementById(id);
    const els = {
        title: $('boardTitle'), meta: $('boardMeta'),
        composer: $('composer'), input: $('questionInput'), submit: $('submitBtn'),
        counter: $('counter'), hint: $('composerHint'),
        similar: $('similar'), similarText: $('similarText'), similarDismiss: $('similarDismiss'),
        status: $('status'), loading: $('loading'), empty: $('empty'),
        openList: $('openList'), answeredLabel: $('answeredLabel'), answeredList: $('answeredList'),
        shareDialog: $('shareDialog'), qr: $('qr'), shareUrl: $('shareUrl'),
        nativeShare: $('nativeShare'), hostBlock: $('hostBlock'), toasts: $('toasts'),
    };

    // ---------- Identity ----------

    function randomId() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        const bytes = new Uint8Array(16);
        (window.crypto || window.msCrypto).getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }

    let clientId = store.get('bb:client');
    if (!clientId || !/^[A-Za-z0-9_-]{8,64}$/.test(clientId)) {
        clientId = randomId();
        store.set('bb:client', clientId);
    }

    const hostKeyName = `bb:host:${SLUG}`;
    // A host can move to another device by opening /board#host=<key>.
    const hashKey = /^#host=([A-Za-z0-9_-]{16,128})$/.exec(location.hash);
    if (hashKey) {
        store.set(hostKeyName, hashKey[1]);
        history.replaceState(null, '', location.pathname);
    }
    let hostKey = store.get(hostKeyName);

    // ---------- State ----------

    const state = {
        questions: [],
        loaded: false,
        isHost: false,
        sort: store.get('bb:sort') === 'new' ? 'new' : 'top',
        query: '',
        similarDismissed: false,
        online: true,
    };
    // Bumped on every local change so that a poll which started earlier can't overwrite it.
    let mutations = 0;
    const cards = new Map(); // question id -> <li>

    // ---------- API ----------

    async function api(method, path, body) {
        const headers = { 'X-Client-Id': clientId };
        if (hostKey) headers['X-Host-Key'] = hostKey;
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        let response;
        try {
            response = await fetch(`/api/${SLUG}${path}`, {
                method, headers, body: body === undefined ? undefined : JSON.stringify(body),
            });
        } catch (e) {
            const error = new Error("Can't reach the server. Check your connection.");
            error.network = true;
            throw error;
        }
        if (response.status === 204) return null;
        let data = null;
        try { data = await response.json(); } catch (e) { /* non-JSON error page */ }
        if (!response.ok) {
            const error = new Error((data && data.error) || 'Something went wrong. Please try again.');
            error.status = response.status;
            throw error;
        }
        return data;
    }

    // ---------- Toasts ----------

    function toast(message, kind) {
        const el = document.createElement('div');
        el.className = `toast${kind === 'error' ? ' error' : ''}`;
        el.textContent = message;
        els.toasts.appendChild(el);
        while (els.toasts.children.length > 3) els.toasts.firstChild.remove();
        setTimeout(() => {
            el.classList.add('out');
            setTimeout(() => el.remove(), 250);
        }, kind === 'error' ? 5000 : 3200);
    }

    // ---------- Formatting ----------

    function timeAgo(iso) {
        const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
        if (seconds < 45) return 'just now';
        if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m ago`;
        if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
        if (seconds < 86400 * 7) return `${Math.round(seconds / 86400)}d ago`;
        return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    // ---------- Similar-question matching ----------

    const STOP_WORDS = new Set(('a an and are as at be but by can could did do does for from had has have how i if in is it ' +
        'me my of on or our should so that the their there they this to was we were what when where which who why will ' +
        'with would you your').split(' '));

    function tokens(text) {
        return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w));
    }

    function similarTo(query, questions) {
        const wanted = tokens(query);
        if (!wanted.some(w => w.length >= 3)) return [];
        return questions.filter(q => {
            const words = tokens(q.content);
            const hits = wanted.filter(w => words.some(x => x.startsWith(w) || (w.length >= 4 && x.includes(w)))).length;
            return hits / wanted.length >= 0.6;
        });
    }

    // ---------- Rendering ----------

    function icon(path) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2.8');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', path);
        svg.appendChild(p);
        return svg;
    }

    function createCard(q) {
        const li = document.createElement('li');
        li.className = 'q';
        li.dataset.id = q.id;

        const fizz = document.createElement('div');
        fizz.className = 'fizz';
        fizz.setAttribute('aria-hidden', 'true');

        const vote = document.createElement('button');
        vote.type = 'button';
        vote.className = 'vote';
        vote.dataset.action = 'vote';
        const count = document.createElement('span');
        count.className = 'vote-count';
        vote.append(icon('M6 14l6-6 6 6'), count);

        const body = document.createElement('div');
        body.className = 'q-body';
        const text = document.createElement('p');
        text.className = 'q-text';
        const meta = document.createElement('div');
        meta.className = 'q-meta';
        body.append(text, meta);

        li.append(fizz, vote, body);
        return li;
    }

    function actionButton(action, label) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'q-action';
        b.dataset.action = action;
        b.textContent = label;
        return b;
    }

    function updateCard(li, q) {
        li.classList.toggle('is-answered', q.answered);
        li.querySelector('.q-text').textContent = q.content;

        const vote = li.querySelector('.vote');
        vote.setAttribute('aria-pressed', String(q.voted));
        vote.setAttribute('aria-label', q.voted
            ? `Remove your upvote. ${plural(q.votes, 'vote')}.`
            : `Upvote. ${plural(q.votes, 'vote')}.`);
        vote.querySelector('.vote-count').textContent = q.votes;

        // Rebuild the meta row only when it would actually change, so a pending
        // "Confirm remove" isn't wiped by a background refresh.
        const ago = timeAgo(q.created_at);
        const canRemove = q.mine || state.isHost;
        const signature = [ago, q.mine, q.answered, state.isHost].join('|');
        const meta = li.querySelector('.q-meta');
        if (meta.dataset.signature !== signature) {
            meta.dataset.signature = signature;
            meta.textContent = '';
            const time = document.createElement('time');
            time.dateTime = q.created_at;
            time.textContent = ago;
            meta.append(time);
            if (q.mine) {
                const mine = document.createElement('span');
                mine.textContent = '· You asked';
                meta.append(mine);
            }
            if (q.answered) {
                const badge = document.createElement('span');
                badge.className = 'badge badge-ok';
                badge.textContent = '✓ Answered';
                meta.append(badge);
            }
            if (canRemove) {
                const actions = document.createElement('div');
                actions.className = 'q-actions';
                if (state.isHost) {
                    actions.append(actionButton('answer', q.answered ? 'Reopen' : 'Mark answered'));
                }
                actions.append(actionButton('remove', 'Remove'));
                meta.append(actions);
            }
        }

        updateFizz(li.querySelector('.fizz'), q.answered ? 0 : Math.min(q.votes, MAX_FIZZ));
    }

    function updateFizz(fizz, wanted) {
        while (fizz.children.length > wanted) fizz.lastChild.remove();
        while (fizz.children.length < wanted) {
            const b = document.createElement('i');
            const duration = 4 + Math.random() * 5;
            b.style.setProperty('--x', `${4 + Math.random() * 92}%`);
            b.style.setProperty('--s', `${9 + Math.random() * 13}px`);
            b.style.setProperty('--d', `${duration}s`);
            b.style.setProperty('--delay', `${-Math.random() * duration}s`);
            b.style.setProperty('--sway', `${(Math.random() - 0.5) * 30}px`);
            b.style.setProperty('--rise', `${-(90 + Math.random() * 90)}px`);
            fizz.appendChild(b);
        }
    }

    function sorted(questions) {
        const byNewest = (a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id);
        const list = questions.slice();
        if (state.sort === 'new') list.sort(byNewest);
        else list.sort((a, b) => b.votes - a.votes || byNewest(a, b));
        return list;
    }

    function place(list, items) {
        items.forEach((li, index) => {
            if (list.children[index] !== li) list.insertBefore(li, list.children[index] || null);
        });
    }

    function render() {
        if (!state.loaded) return;
        const all = state.questions;

        // Header
        const votes = all.reduce((sum, q) => sum + q.votes, 0);
        const summary = all.length ? `${plural(all.length, 'question')} · ${plural(votes, 'vote')}` : 'Live Q&A board';
        const metaSignature = `${summary}|${state.isHost}`;
        if (els.meta.dataset.signature !== metaSignature) {
            els.meta.dataset.signature = metaSignature;
            els.meta.textContent = '';
            els.meta.append(summary);
            if (state.isHost) {
                const badge = document.createElement('span');
                badge.className = 'badge';
                badge.textContent = "You're the host";
                els.meta.append(badge);
            }
        }

        // Similar questions while typing
        let visible = all;
        const matches = state.similarDismissed ? [] : similarTo(state.query, all);
        if (matches.length) {
            visible = matches;
            els.similarText.textContent = matches.length === 1
                ? 'Already asked? Upvote it instead.'
                : `${matches.length} similar questions. Upvote one instead?`;
        }
        els.similar.hidden = !matches.length;

        const open = sorted(visible.filter(q => !q.answered));
        const answered = sorted(visible.filter(q => q.answered));
        const visibleIds = new Set(visible.map(q => q.id));

        // FLIP: remember where every card is before touching the DOM.
        const animate = !reducedMotion.matches && !document.hidden;
        const before = new Map();
        if (animate) cards.forEach((li, id) => before.set(id, li.getBoundingClientRect()));

        cards.forEach((li, id) => {
            if (visibleIds.has(id)) return;
            cards.delete(id);
            if (animate && li.isConnected) {
                // Lift it out of the flow so its neighbours can slide into place.
                const parent = li.parentElement;
                li.style.top = `${li.offsetTop}px`;
                li.style.left = `${li.offsetLeft}px`;
                li.style.width = `${li.offsetWidth}px`;
                li.style.position = 'absolute';
                li.style.pointerEvents = 'none';
                const done = () => li.remove();
                li.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.94)' }],
                    { duration: 200, easing: 'ease-in' }).onfinish = done;
                setTimeout(done, 400);
                parent.appendChild(li);
            } else {
                li.remove();
            }
        });

        const toItems = list => list.map(q => {
            let li = cards.get(q.id);
            if (!li) {
                li = createCard(q);
                cards.set(q.id, li);
            }
            updateCard(li, q);
            return li;
        });
        // Moving a focused node blurs it, so put keyboard focus back afterwards.
        const focused = document.activeElement;
        place(els.openList, toItems(open));
        place(els.answeredList, toItems(answered));
        if (focused && focused !== document.activeElement && focused.isConnected && focused.closest('.q')) {
            focused.focus({ preventScroll: true });
        }

        els.answeredLabel.hidden = !answered.length;
        els.answeredLabel.textContent = `Answered · ${answered.length}`;
        els.loading.hidden = true;
        els.empty.hidden = all.length > 0;

        if (animate) {
            cards.forEach((li, id) => {
                const old = before.get(id);
                if (!old) {
                    li.animate([{ opacity: 0, transform: 'translateY(10px) scale(0.97)' }, { opacity: 1, transform: 'none' }],
                        { duration: 260, easing: 'ease-out' });
                    return;
                }
                const now = li.getBoundingClientRect();
                const dx = old.left - now.left;
                const dy = old.top - now.top;
                if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                    li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
                        { duration: 380, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
                }
            });
        }
    }

    function flash(id) {
        const li = cards.get(id);
        if (!li) return;
        li.classList.remove('flash');
        void li.offsetWidth; // restart the animation
        li.classList.add('flash');
        const rect = li.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > innerHeight) {
            li.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
        }
    }

    // ---------- Loading & live updates ----------

    function setOnline(online) {
        state.online = online;
        els.status.classList.toggle('offline', !online);
        els.status.textContent = online ? 'Live' : 'Reconnecting…';
    }

    let claimAttempted = false;
    async function claimBoard() {
        claimAttempted = true;
        try {
            const result = await api('POST', '/claim');
            hostKey = result.host_key;
            store.set(hostKeyName, hostKey);
            state.isHost = true;
            render();
            toast("You opened this board, so you're the host. Tap Share to invite people.");
        } catch (e) {
            // Someone else got there first, or we're offline. Either way: carry on as a guest.
        }
    }

    let refreshing = false;
    async function refresh() {
        if (refreshing) return;
        refreshing = true;
        const startedAt = mutations;
        try {
            const data = await api('GET', '/questions');
            setOnline(true);
            // Ignore a snapshot that raced with a local change or an in-flight request.
            if (startedAt === mutations && busy.size === 0) {
                state.questions = data.questions;
                state.isHost = Boolean(data.board.is_host);
                const first = !state.loaded;
                state.loaded = true;
                render();
                if (first && !data.board.exists && !hostKey && !claimAttempted) claimBoard();
            }
        } catch (e) {
            if (e.network || e.status >= 500) {
                setOnline(false);
            } else if (!state.loaded) {
                els.loading.hidden = true;
                toast(e.message, 'error');
            }
        } finally {
            refreshing = false;
        }
    }

    let pollTimer;
    function schedulePoll() {
        clearTimeout(pollTimer);
        pollTimer = setTimeout(async () => {
            if (!document.hidden) await refresh();
            schedulePoll();
        }, state.online ? POLL_MS : POLL_MS * 2);
    }
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refresh();
    });
    window.addEventListener('online', refresh);

    // ---------- Composer ----------

    function autoGrow() {
        els.input.style.height = 'auto';
        els.input.style.height = `${els.input.scrollHeight + 2}px`;
    }

    const cleaned = () => els.input.value.replace(/\s+/g, ' ').trim();

    function updateComposer() {
        const length = cleaned().length;
        els.submit.disabled = submitting || length === 0 || length > MAX_CHARS;
        const showCounter = length > MAX_CHARS - 80;
        els.counter.hidden = !showCounter;
        els.hint.hidden = showCounter;
        els.counter.textContent = length > MAX_CHARS
            ? `${length - MAX_CHARS} over the limit`
            : `${MAX_CHARS - length} characters left`;
        els.counter.classList.toggle('near', length > MAX_CHARS - 30 && length <= MAX_CHARS);
        els.counter.classList.toggle('over', length > MAX_CHARS);
    }

    let queryTimer;
    els.input.addEventListener('input', () => {
        autoGrow();
        updateComposer();
        clearTimeout(queryTimer);
        queryTimer = setTimeout(() => {
            const query = cleaned();
            if (!query) state.similarDismissed = false;
            if (query !== state.query) {
                state.query = query;
                render();
            }
        }, 150);
    });

    els.input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            els.composer.requestSubmit();
        }
    });

    els.similarDismiss.addEventListener('click', () => {
        state.similarDismissed = true;
        render();
        els.input.focus();
    });

    let submitting = false;
    els.composer.addEventListener('submit', async event => {
        event.preventDefault();
        const content = cleaned();
        if (submitting || !content) return;
        if (content.length > MAX_CHARS) {
            toast(`Questions can be at most ${MAX_CHARS} characters.`, 'error');
            return;
        }
        submitting = true;
        updateComposer();
        try {
            const question = await api('POST', '/questions', { content });
            mutations++;
            state.questions = state.questions.filter(q => q.id !== question.id).concat(question);
            els.input.value = '';
            clearTimeout(queryTimer);
            state.query = '';
            state.similarDismissed = false;
            autoGrow();
            render();
            flash(question.id);
        } catch (e) {
            toast(e.message, 'error');
        } finally {
            submitting = false;
            updateComposer();
        }
    });

    // ---------- Voting & moderation ----------

    const find = id => state.questions.find(q => q.id === id);
    const busy = new Set();

    async function toggleVote(id, button) {
        const q = find(id);
        if (!q || busy.has(id)) return;
        busy.add(id);
        const was = { voted: q.voted, votes: q.votes };
        mutations++;
        q.voted = !q.voted;
        q.votes = Math.max(0, q.votes + (q.voted ? 1 : -1));
        if (q.voted) {
            button.classList.remove('pop');
            void button.offsetWidth;
            button.classList.add('pop');
        }
        render();
        try {
            const result = await api(q.voted ? 'POST' : 'DELETE', `/questions/${id}/vote`);
            mutations++;
            q.votes = result.votes;
            q.voted = result.voted;
        } catch (e) {
            mutations++;
            if (e.status === 404) {
                state.questions = state.questions.filter(x => x.id !== id);
                toast('That question was removed.', 'error');
            } else {
                Object.assign(q, was);
                toast(e.message, 'error');
            }
        } finally {
            busy.delete(id);
            render();
        }
    }

    async function toggleAnswered(id) {
        const q = find(id);
        if (!q || busy.has(id)) return;
        busy.add(id);
        const was = q.answered;
        mutations++;
        q.answered = !was;
        render();
        try {
            await api('PATCH', `/questions/${id}`, { answered: q.answered });
        } catch (e) {
            mutations++;
            q.answered = was;
            toast(e.message, 'error');
        } finally {
            busy.delete(id);
            render();
        }
    }

    async function removeQuestion(id, button) {
        // Two-step confirm, in place: the first tap arms the button for a few seconds.
        if (!button.classList.contains('confirm')) {
            button.classList.add('confirm');
            button.textContent = 'Tap again to remove';
            setTimeout(() => {
                if (button.isConnected) {
                    button.classList.remove('confirm');
                    button.textContent = 'Remove';
                }
            }, 3500);
            return;
        }
        if (busy.has(id)) return;
        busy.add(id);
        try {
            await api('DELETE', `/questions/${id}`);
        } catch (e) {
            if (e.status !== 404) {
                busy.delete(id);
                toast(e.message, 'error');
                return;
            }
        }
        busy.delete(id);
        mutations++;
        state.questions = state.questions.filter(q => q.id !== id);
        render();
        toast('Question removed.');
    }

    function onListClick(event) {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const id = Number(button.closest('.q').dataset.id);
        if (button.dataset.action === 'vote') toggleVote(id, button);
        else if (button.dataset.action === 'answer') toggleAnswered(id);
        else if (button.dataset.action === 'remove') removeQuestion(id, button);
    }
    els.openList.addEventListener('click', onListClick);
    els.answeredList.addEventListener('click', onListClick);

    // ---------- Sorting ----------

    const sortButtons = Array.from(document.querySelectorAll('[data-sort]'));
    function setSort(sort) {
        state.sort = sort;
        store.set('bb:sort', sort);
        sortButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === sort)));
        render();
    }
    sortButtons.forEach(b => b.addEventListener('click', () => setSort(b.dataset.sort)));

    // ---------- Sharing ----------

    const boardUrl = `${location.origin}/${SLUG}`;

    async function copy(text, button, doneMessage) {
        let ok = false;
        try {
            await navigator.clipboard.writeText(text);
            ok = true;
        } catch (e) {
            // Clipboard API needs HTTPS; fall back for plain-HTTP deployments.
            const area = document.createElement('textarea');
            area.value = text;
            area.setAttribute('readonly', '');
            area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
            (els.shareDialog.open ? els.shareDialog : document.body).appendChild(area);
            area.select();
            try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
            area.remove();
        }
        if (!ok) {
            toast("Couldn't copy. Select the link and copy it manually.", 'error');
            return;
        }
        const label = button.textContent;
        button.textContent = doneMessage;
        setTimeout(() => { button.textContent = label; }, 1800);
    }

    function openShare() {
        if (!els.qr.getAttribute('src')) els.qr.src = `/api/${SLUG}/qr.svg`;
        els.shareUrl.value = boardUrl.replace(/^https?:\/\//, '');
        els.hostBlock.hidden = !(state.isHost && hostKey);
        els.nativeShare.hidden = !navigator.share;
        if (els.shareDialog.showModal) els.shareDialog.showModal();
        else els.shareDialog.setAttribute('open', '');
    }
    const closeShare = () => (els.shareDialog.close ? els.shareDialog.close() : els.shareDialog.removeAttribute('open'));

    $('shareBtn').addEventListener('click', openShare);
    $('emptyShare').addEventListener('click', openShare);
    $('shareClose').addEventListener('click', closeShare);
    els.shareDialog.addEventListener('click', event => {
        if (event.target !== els.shareDialog) return;
        const r = els.shareDialog.getBoundingClientRect();
        const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
        if (!inside) closeShare(); // click on the backdrop
    });
    els.shareUrl.addEventListener('focus', () => els.shareUrl.select());
    $('copyLink').addEventListener('click', event => copy(boardUrl, event.currentTarget, 'Copied!'));
    $('copyHostLink').addEventListener('click', event =>
        copy(`${boardUrl}#host=${hostKey}`, event.currentTarget, 'Host link copied'));
    els.nativeShare.addEventListener('click', () => {
        navigator.share({ title: `${titleFromSlug(SLUG)} · Bubble Ballot`, text: 'Ask and upvote questions here:', url: boardUrl })
            .catch(() => { /* user cancelled */ });
    });

    // ---------- Start ----------

    els.title.textContent = titleFromSlug(SLUG);
    document.title = `${titleFromSlug(SLUG)} · Bubble Ballot`;
    rememberBoard(SLUG);
    sortButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort)));
    updateComposer();
    refresh().then(schedulePoll);
    // Keep "5m ago" labels fresh even if nothing else changes.
    setInterval(() => { if (!document.hidden) render(); }, 60000);
})();
