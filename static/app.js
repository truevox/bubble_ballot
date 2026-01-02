document.addEventListener('DOMContentLoaded', () => {
    const questionInput = document.getElementById('questionInput');
    const submitBtn = document.getElementById('submitBtn');
    const questionsList = document.getElementById('questionsList');

    let debounceTimer;

    // Load initial questions
    fetchQuestions();

    // Poll for updates every 5 seconds
    setInterval(() => {
        // Only poll if user is not actively typing (to avoid jittering the list while searching)
        if (!questionInput.value.trim()) {
            fetchQuestions();
        }
    }, 5000);

    // Search/Filter as user types
    questionInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetchQuestions(questionInput.value);
        }, 300);
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
            fetchQuestions();
        } else {
            alert('Failed to submit question');
        }
    });

    async function fetchQuestions(query = '') {
        let url = `/api/${BOARD_SLUG}/questions`;
        if (query) {
            url += `?q=${encodeURIComponent(query)}`;
        }

        const response = await fetch(url);
        if (!response.ok) return;
        const questions = await response.json();
        renderQuestions(questions);
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
                    requestAnimationFrame(() => {
                        addInternalBubbles(bubble, q.votes);
                    });
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

        // Remove questions that are no longer in the list (e.g. filtered out)
        // We iterate over children of questionsList
        Array.from(questionsList.children).forEach(child => {
            const id = parseInt(child.id.replace('q-', ''));
            if (!currentIds.has(id)) {
                child.remove();
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

        voteCountSpan.className = 'vote-count';
        voteCountSpan.textContent = q.votes;

        voteArea.appendChild(voteBtn);
        voteArea.appendChild(voteCountSpan);

        bubble.appendChild(contentDiv);
        bubble.appendChild(voteArea);
        
        return bubble;
    }

    async function handleVote(id, btn, countSpan) {
        if (btn.disabled) return; // Prevent double-clicking
        btn.disabled = true;

        const hasVoted = localStorage.getItem(`voted_${id}`);
        const direction = hasVoted ? 'down' : 'up';

        try {
            const response = await fetch(`/api/${BOARD_SLUG}/questions/${id}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ direction: direction })
            });

            if (response.ok) {
                const data = await response.json();

                if (hasVoted) {
                    localStorage.removeItem(`voted_${id}`);
                    btn.classList.remove('voted');
                } else {
                    localStorage.setItem(`voted_${id}`, 'true');
                    btn.classList.add('voted');
                }

                countSpan.textContent = data.votes;

                const bubble = document.getElementById(`q-${id}`);
                requestAnimationFrame(() => {
                    addInternalBubbles(bubble, data.votes);
                });
            }
        } finally {
            btn.disabled = false; // Re-enable button after request is complete
        }
    }

    let isAnimationLoopRunning = false;

    function startAnimationLoop() {
        if (isAnimationLoopRunning) return;
        isAnimationLoopRunning = true;

        function animate() {
            const bubbles = document.querySelectorAll('.internal-bubble');

            if (bubbles.length === 0) {
                isAnimationLoopRunning = false;
                return;
            }

            bubbles.forEach(b => {
                if (!b.physics) return;

                const isPopping = b.classList.contains('popping');

                if (isPopping) {
                    // Handle popping animation. The bubble stays in its last known position.
                    let transform = `translate(${b.physics.x}px, ${b.physics.y}px)`;

                    if (b.animation && b.animation.type === 'pop') {
                        const elapsed = Date.now() - b.animation.start;
                        const progress = Math.min(elapsed / b.animation.duration, 1);

                        let scale = 1;
                        if (progress < 0.5) {
                            scale = 1 + (progress * 2) * 0.4; // Grow to 1.4
                        } else {
                            scale = 1.4 - ((progress - 0.5) * 2) * 1.4; // Shrink to 0
                        }
                        transform += ` scale(${scale})`;
                    }
                    b.style.transform = transform;

                } else {
                    // Handle normal movement.
                    const container = b.parentElement;
                    const containerWidth = container.offsetWidth;
                    const containerHeight = container.offsetHeight;
                    const bubbleSize = parseFloat(b.style.width);

                    b.physics.x += b.physics.vx;
                    b.physics.y += b.physics.vy;

                    if (b.physics.x <= 0 || b.physics.x >= containerWidth - bubbleSize) {
                        b.physics.vx *= -1;
                    }
                    if (b.physics.y <= 0 || b.physics.y >= containerHeight - bubbleSize) {
                        b.physics.vy *= -1;
                    }

                    b.physics.x = Math.max(0, Math.min(b.physics.x, containerWidth - bubbleSize));
                    b.physics.y = Math.max(0, Math.min(b.physics.y, containerHeight - bubbleSize));

                    b.style.transform = `translate(${b.physics.x}px, ${b.physics.y}px)`;
                }
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
                    b.animation = { type: 'pop', start: Date.now(), duration: 300 };
                    setTimeout(() => {
                        b.remove();
                    }, 300);
                }
            }
        }
    }
});
