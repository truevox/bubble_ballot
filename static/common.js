// Shared helpers for every Bubble Ballot page.
(() => {
    'use strict';

    // localStorage can throw (private mode, blocked cookies); fall back to memory.
    const memory = {};
    const store = {
        get(key) {
            try { return localStorage.getItem(key); } catch (e) { return key in memory ? memory[key] : null; }
        },
        set(key, value) {
            memory[key] = value;
            try { localStorage.setItem(key, value); } catch (e) { /* memory only */ }
        },
        remove(key) {
            delete memory[key];
            try { localStorage.removeItem(key); } catch (e) { /* memory only */ }
        },
    };

    // Must mirror slugify() on the server.
    function slugify(text) {
        return String(text)
            .normalize('NFKD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40)
            .replace(/-+$/g, '');
    }

    const RESERVED = new Set(['api', 'static', 'favicon.ico', 'robots.txt', 'healthz']);

    function titleFromSlug(slug) {
        const words = slug.replace(/-/g, ' ');
        return words.charAt(0).toUpperCase() + words.slice(1);
    }

    const RECENT_KEY = 'bb:boards';
    function recentBoards() {
        try {
            const list = JSON.parse(store.get(RECENT_KEY) || '[]');
            return Array.isArray(list) ? list.filter(s => typeof s === 'string') : [];
        } catch (e) {
            return [];
        }
    }
    function rememberBoard(slug) {
        const list = recentBoards().filter(s => s !== slug);
        list.unshift(slug);
        store.set(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
    }

    // Decorative bubbles drifting up behind the content.
    function fillBackdrop() {
        const backdrop = document.querySelector('.backdrop');
        if (!backdrop || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const count = innerWidth < 600 ? 7 : 12;
        for (let i = 0; i < count; i++) {
            const b = document.createElement('span');
            const duration = 18 + Math.random() * 22;
            b.style.setProperty('--x', `${Math.random() * 100}%`);
            b.style.setProperty('--s', `${14 + Math.random() * 56}px`);
            b.style.setProperty('--d', `${duration}s`);
            b.style.setProperty('--delay', `${-Math.random() * duration}s`);
            b.style.setProperty('--sway', `${(Math.random() - 0.5) * 120}px`);
            backdrop.appendChild(b);
        }
    }
    fillBackdrop();

    window.BB = { store, slugify, RESERVED, titleFromSlug, recentBoards, rememberBoard };
})();
