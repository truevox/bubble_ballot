// Landing page: the start-or-join form that sits over the island scene.
(() => {
    'use strict';
    const { slugify, RESERVED } = window.BB;

    const form = document.getElementById('startForm');
    const input = document.getElementById('boardName');
    const hint = document.getElementById('startHint');
    const defaultHint = hint.textContent;

    const ADJECTIVES = ['brave', 'calm', 'bright', 'gentle', 'jolly', 'lucky', 'mellow', 'nimble', 'quiet', 'sunny', 'swift', 'witty', 'bold', 'cosmic', 'dapper', 'eager'];
    const CREATURES = ['otter', 'dolphin', 'seahorse', 'narwhal', 'turtle', 'puffin', 'manatee', 'octopus', 'starfish', 'penguin', 'walrus', 'marlin', 'urchin', 'lobster', 'heron', 'orca'];
    const pick = list => list[Math.floor(Math.random() * list.length)];
    const randomSlug = () => `${pick(ADJECTIVES)}-${pick(CREATURES)}-${100 + Math.floor(Math.random() * 900)}`;

    function describe() {
        const raw = input.value.trim();
        hint.textContent = '';
        if (!raw) {
            hint.textContent = defaultHint;
            return;
        }
        const slug = slugify(raw);
        if (!slug || RESERVED.has(slug)) {
            hint.textContent = 'Use letters or numbers in the name.';
            return;
        }
        hint.append('Your board link: ');
        const b = document.createElement('b');
        b.textContent = `${location.host}/${slug}`;
        hint.append(b, '. Anyone with the link can join.');
    }

    input.addEventListener('input', describe);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const raw = input.value.trim();
        const slug = raw ? slugify(raw) : randomSlug();
        if (!slug || RESERVED.has(slug)) {
            describe();
            input.focus();
            return;
        }
        location.href = `/${slug}`;
    });
})();
