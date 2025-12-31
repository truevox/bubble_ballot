document.addEventListener('DOMContentLoaded', () => {
    const questionInput = document.getElementById('questionInput');
    const submitBtn = document.getElementById('submitBtn');
    const questionsList = document.getElementById('questionsList');

    let debounceTimer;
    let allQuestions = [];

    // Load initial questions
    fetchAllQuestions();

    // Poll for updates every 5 seconds
    setInterval(() => {
        // To avoid jitter, only refresh if the user isn't actively filtering.
        if (!questionInput.value.trim()) {
            fetchAllQuestions();
        }
    }, 5000);

    // Search/Filter as user types
    questionInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            filterAndRenderQuestions(questionInput.value);
        }, 50); // Use a shorter debounce for a more responsive feel.
    });

    // Submit new question
    submitBtn.addEventListener('click', async () => {
        const content = questionInput.value.trim();
        if (!content) return;

        const response = await fetch(`/api/${BOARD_SLUG}/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        if (response.ok) {
            questionInput.value = '';
            fetchAllQuestions(); // Re-fetch to include the new question
        } else {
            alert('Failed to submit question');
        }
    });

    async function fetchAllQuestions() {
        const url = `/api/${BOARD_SLUG}/questions`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error('Failed to fetch questions');
                return;
            }
            allQuestions = await response.json();
            // After fetching, re-render the list based on the current filter
            filterAndRenderQuestions(questionInput.value);
        } catch (error) {
            console.error('Error fetching questions:', error);
        }
    }

    function filterAndRenderQuestions(query = '') {
        const lowerCaseQuery = query.toLowerCase().trim();
        let questionsToRender;

        if (!lowerCaseQuery) {
            questionsToRender = [...allQuestions];
            // Sort by votes descending for the default view
            questionsToRender.sort((a, b) => b.votes - a.votes);
        } else {
            const matches = [];
            for (const q of allQuestions) {
                const content = q.content.toLowerCase();
                // Prioritize exact substring matches
                if (content.includes(lowerCaseQuery)) {
                    matches.push({ score: 1.0, question: q });
                } else {
                    const distance = levenshtein(lowerCaseQuery, content);
                    const ratio = 1 - (distance / Math.max(lowerCaseQuery.length, content.length));
                    if (ratio > 0.6) { // Use a stricter threshold for better results
                        matches.push({ score: ratio, question: q });
                    }
                }
            }
            // Sort by relevance score, descending
            matches.sort((a, b) => b.score - a.score);
            questionsToRender = matches.map(m => m.question);
        }

        renderQuestions(questionsToRender);
    }

    // Levenshtein distance function for fuzzy search
    function levenshtein(a, b) {
        function _min(d0, d1, d2, bx, ay) {
            return d0 < d1 || d2 < d1 ?
                d0 > d2 ?
                d2 + 1 :
                d0 + 1 :
                bx === ay ?
                d1 :
                d1 + 1;
        }

        if (a === b) { return 0; }
        if (a.length > b.length) { [a, b] = [b, a]; }

        let la = a.length;
        let lb = b.length;

        while (la > 0 && (a.charCodeAt(la - 1) === b.charCodeAt(lb - 1))) {
            la--;
            lb--;
        }

        let offset = 0;
        while (offset < la && (a.charCodeAt(offset) === b.charCodeAt(offset))) {
            offset++;
        }

        la -= offset;
        lb -= offset;

        if (la === 0 || lb < 3) { return lb; }

        let x = 0;
        let y;
        let d0, d1, d2, d3, dd, dy, ay, bx0, bx1, bx2, bx3;

        const vector = [];
        for (y = 0; y < la; y++) {
            vector.push(y + 1, a.charCodeAt(offset + y));
        }
        const len = vector.length - 1;

        for (; x < lb - 3;) {
            bx0 = b.charCodeAt(offset + (d0 = x));
            bx1 = b.charCodeAt(offset + (d1 = x + 1));
            bx2 = b.charCodeAt(offset + (d2 = x + 2));
            bx3 = b.charCodeAt(offset + (d3 = x + 3));
            dd = (x += 4);
            for (y = 0; y < len; y += 2) {
                dy = vector[y];
                ay = vector[y + 1];
                d0 = _min(dy, d0, d1, bx0, ay);
                d1 = _min(d0, d1, d2, bx1, ay);
                d2 = _min(d1, d2, d3, bx2, ay);
                dd = _min(d2, d3, dd, bx3, ay);
                vector[y] = dd;
                d3 = d2;
                d2 = d1;
                d1 = d0;
                d0 = dy;
            }
        }

        for (; x < lb;) {
            bx0 = b.charCodeAt(offset + (d0 = x));
            dd = ++x;
            for (y = 0; y < len; y += 2) {
                dy = vector[y];
                vector[y] = dd = _min(dy, d0, dd, bx0, vector[y + 1]);
                d0 = dy;
            }
        }

        return dd;
    }

    function renderQuestions(questions) {
        // Create a Set of current IDs for cleanup later
        const currentIds = new Set(questions.map(q => q.id));

        // Update or Add
        questions.forEach((q, index) => {
            let bubble = document.getElementById(`q-${q.id}`);
            let isNew = false;

            if (bubble) {
                // Update existing
                // Check if votes changed to update visuals
                const voteCountSpan = bubble.querySelector('.vote-count');
                const oldVotes = parseInt(voteCountSpan.textContent);
                
                if (oldVotes !== q.votes) {
                    voteCountSpan.textContent = q.votes;
                    addInternalBubbles(bubble, q.votes);
                }
            } else {
                // Create new
                bubble = createBubbleElement(q);
                isNew = true;
            }
            
            // Ensure proper order without unnecessary moves
            const currentChild = questionsList.children[index];
            if (currentChild !== bubble) {
                questionsList.insertBefore(bubble, currentChild || null);
            }

            if (isNew) {
                requestAnimationFrame(() => {
                    addInternalBubbles(bubble, q.votes);
                });
            }
        });

        // Animate out and remove questions that are no longer in the list
        Array.from(questionsList.children).forEach(child => {
            const id = parseInt(child.id.replace('q-', ''));
            if (!currentIds.has(id)) {
                child.classList.add('popping');
                setTimeout(() => {
                    child.remove();
                }, 300); // Animation duration is 0.3s
            }
        });
    }

    function createBubbleElement(q) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.id = `q-${q.id}`;

        const hasVoted = localStorage.getItem(`voted_${q.id}`);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'bubble-content';
        contentDiv.textContent = q.content;

        const voteArea = document.createElement('div');
        voteArea.className = 'vote-area';

        const voteBtn = document.createElement('button');
        voteBtn.className = `vote-btn ${hasVoted ? 'voted' : ''}`;
        voteBtn.innerHTML = '&#9650;'; // Up arrow
        const voteCountSpan = document.createElement('span'); // Declare here for closure
        
        voteBtn.onclick = () => handleVote(q.id, voteBtn, voteCountSpan);
        if (hasVoted) voteBtn.disabled = true;

        voteCountSpan.className = 'vote-count';
        voteCountSpan.textContent = q.votes;

        voteArea.appendChild(voteBtn);
        voteArea.appendChild(voteCountSpan);

        bubble.appendChild(contentDiv);
        bubble.appendChild(voteArea);
        
        return bubble;
    }

    async function handleVote(id, btn, countSpan) {
        if (localStorage.getItem(`voted_${id}`)) return;

        const response = await fetch(`/api/${BOARD_SLUG}/questions/${id}/vote`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem(`voted_${id}`, 'true');
            btn.classList.add('voted');
            btn.disabled = true;
            countSpan.textContent = data.votes;
            
            const bubble = document.getElementById(`q-${id}`);
            // The addInternalBubbles function syncs the number of visible minibubbles
            // to the new total vote count from the server.
            addInternalBubbles(bubble, data.votes);
        }
    }

    let isAnimationLoopRunning = false;

    function startAnimationLoop() {
        if (isAnimationLoopRunning) return;
        isAnimationLoopRunning = true;

        function animate() {
            const bubbles = document.querySelectorAll('.internal-bubble:not(.popping)');

            if (bubbles.length === 0) {
                isAnimationLoopRunning = false;
                return;
            }

            bubbles.forEach(b => {
                if (!b.physics) return;

                const container = b.parentElement;
                const containerWidth = container.offsetWidth;
                const containerHeight = container.offsetHeight;
                const bubbleSize = parseFloat(b.style.width);

                // Update position
                b.physics.x += b.physics.vx;
                b.physics.y += b.physics.vy;

                // Bounce off walls
                if (b.physics.x <= 0 || b.physics.x >= containerWidth - bubbleSize) {
                    b.physics.vx *= -1;
                }
                if (b.physics.y <= 0 || b.physics.y >= containerHeight - bubbleSize) {
                    b.physics.vy *= -1;
                }

                b.physics.x = Math.max(0, Math.min(b.physics.x, containerWidth - bubbleSize));
                b.physics.y = Math.max(0, Math.min(b.physics.y, containerHeight - bubbleSize));

                b.style.transform = `translate(${b.physics.x}px, ${b.physics.y}px)`;
            });

            requestAnimationFrame(animate);
        }

        animate();
    }

    function addInternalBubbles(container, voteCount) {
        startAnimationLoop();

        let count = voteCount;
        let size = 20; 
        
        if (count > 100) {
            size = 5;
        } else if (count > 50) {
            size = 10;
        }

        const maxVisuals = 50; 
        const visualCount = Math.min(count, maxVisuals);

        const currentBubbles = Array.from(container.querySelectorAll('.internal-bubble:not(.popping)'));
        const currentCount = currentBubbles.length;

        currentBubbles.forEach(b => {
            b.style.width = `${size}px`;
            b.style.height = `${size}px`;
        });

        if (visualCount > currentCount) {
            const toAdd = visualCount - currentCount;
            for (let i = 0; i < toAdd; i++) {
                const b = document.createElement('div');
                b.className = 'internal-bubble';

                b.style.width = `${size}px`;
                b.style.height = `${size}px`;

                const containerWidth = container.offsetWidth;
                const containerHeight = container.offsetHeight;

                b.physics = {
                    x: Math.random() * (containerWidth - size),
                    y: Math.random() * (containerHeight - size),
                    vx: (Math.random() - 0.5) * 1.5,
                    vy: (Math.random() - 0.5) * 1.5
                };

                b.style.transform = `translate(${b.physics.x}px, ${b.physics.y}px)`;

                container.appendChild(b);
            }
        } else if (visualCount < currentCount) {
            const toRemove = currentCount - visualCount;
            for (let i = 0; i < toRemove; i++) {
                const b = currentBubbles[i];
                if (b) {
                    b.classList.add('popping');
                    setTimeout(() => {
                        b.remove();
                    }, 300);
                }
            }
        }
    }
});
