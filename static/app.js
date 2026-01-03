// Cache buster: 1
document.addEventListener('DOMContentLoaded', () => {
    const questionInput = document.getElementById('questionInput');
    const submitBtn = document.getElementById('submitBtn');
    const questionsList = document.getElementById('questionsList');

    let debounceTimer;
    let pollTimer;
    let isAnimating = false;

    function startPolling() {
        clearTimeout(pollTimer); // Ensure no multiple loops
        pollTimer = setTimeout(async () => {
            // Only poll if user is not actively typing and no animation is running
            if (!questionInput.value.trim() && !isAnimating) {
                await fetchQuestions();
            }
            startPolling(); // Schedule the next one
        }, 5000);
    }

    // Load initial questions and start polling
    fetchQuestions();
    startPolling();

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

        clearTimeout(pollTimer); // Stop polling

        const response = await fetch(`/api/${BOARD_SLUG}/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        if (response.ok) {
            questionInput.value = '';
            await fetchQuestions(); // Get immediate update
            startPolling(); // Restart polling
        } else {
            alert('Failed to submit question');
            startPolling(); // Restart polling even on failure
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
        const parent = questionsList;
        const oldPositions = new Map();
        const newPositions = new Map();

        // Before doing anything, record the initial positions of existing bubbles
        Array.from(parent.children).forEach(bubble => {
            oldPositions.set(bubble.id, bubble.getBoundingClientRect());
        });

        // Create a Set of current IDs for cleanup later
        const currentIds = new Set(questions.map(q => `q-${q.id}`));

        // Update or Add bubbles, but don't handle reordering yet
        questions.forEach((q, index) => {
            let bubble = document.getElementById(`q-${q.id}`);
            let isNew = false;

            if (bubble) {
                // Update existing
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
                // Add new bubbles to the end for now, they'll be moved properly later
                parent.appendChild(bubble);
            }

            if (isNew) {
                requestAnimationFrame(() => {
                    addInternalBubbles(bubble, q.votes);
                });
            }
        });

        // Put all bubbles in their correct final order.
        questions.forEach((q, index) => {
            const bubble = document.getElementById(`q-${q.id}`);
            const currentChild = parent.children[index];
            if (currentChild !== bubble) {
                parent.insertBefore(bubble, currentChild || null);
            }
        });

        // Mark old bubbles for removal
        Array.from(parent.children).forEach(child => {
            if (!currentIds.has(child.id)) {
                child.classList.add('bubble-stale');
                // Remove from DOM after transition
                setTimeout(() => child.remove(), 200);
            }
        });

        // After reordering, get the final positions
        Array.from(parent.children).forEach(bubble => {
            if (oldPositions.has(bubble.id)) {
                newPositions.set(bubble.id, bubble.getBoundingClientRect());
            }
        });

        const animatingBubbles = [];

        // Animate the bubbles that moved
        newPositions.forEach((finalPos, id) => {
            const initialPos = oldPositions.get(id);
            const bubble = document.getElementById(id);

            if (initialPos && (initialPos.top !== finalPos.top || initialPos.left !== finalPos.left)) {
                const deltaX = initialPos.left - finalPos.left;
                const deltaY = initialPos.top - finalPos.top;

                animatingBubbles.push(bubble);

                // Determine direction for animation flair
                bubble.classList.remove('bubble-moving-up', 'bubble-moving-down');
                if (deltaY > 0) {
                    bubble.classList.add('bubble-moving-up');
                } else if (deltaY < 0) {
                    bubble.classList.add('bubble-moving-down');
                }

                requestAnimationFrame(() => {
                    bubble.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                    bubble.style.transition = 'transform 0s';

                    requestAnimationFrame(() => {
                        bubble.style.transform = '';
                        bubble.style.transition = 'transform 0.5s ease';
                    });
                });
            }
        });

        if (animatingBubbles.length > 0) {
            isAnimating = true;
            // Use a timeout to unset the flag after the animation completes
            setTimeout(() => {
                isAnimating = false;
                // Clean up any stale classes just in case
                animatingBubbles.forEach(b => b.classList.remove('bubble-stale'));
            }, 500); // Corresponds to the transition duration
        }
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

        clearTimeout(pollTimer); // Stop polling during vote

        const response = await fetch(`/api/${BOARD_SLUG}/questions/${id}/vote`, {
            method: 'POST'
        });

        if (response.ok) {
            localStorage.setItem(`voted_${id}`, 'true');
            btn.classList.add('voted');
            btn.disabled = true;
            
            await fetchQuestions(); // This will re-render and animate
            startPolling(); // Restart polling
        } else {
            startPolling(); // Restart polling even on failure
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
