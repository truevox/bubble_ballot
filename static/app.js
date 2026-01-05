// Cache buster: 1
document.addEventListener('DOMContentLoaded', () => {
    const questionInput = document.getElementById('questionInput');
    const submitBtn = document.getElementById('submitBtn');
    const questionsList = document.getElementById('questionsList');

    let debounceTimer;
    let allQuestions = [];

    // DEFINITIONS NEEDED FOR THE REST OF YOUR FILE
    let pollTimer;
    let isAnimating = false;

    function startPolling() {
        clearTimeout(pollTimer);
        pollTimer = setTimeout(async () => {
            // Only poll if user is not actively typing and no animation is running
            if (!questionInput.value.trim() && !isAnimating) {
                await fetchAndRenderQuestions();
            }
            startPolling(); // Loop
        }, 5000);
    }

    // Load initial questions and kick off the polling loop
    fetchAndRenderQuestions();
    startPolling();

    // Search/Filter as user types
    questionInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetchAndRenderQuestions(questionInput.value);
        }, 50); // Use a shorter debounce for a more responsive feel.
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
            await fetchAndRenderQuestions(); // Re-fetch to include the new question
            startPolling(); // Resume polling after successful submission
        } else {
            alert('Failed to submit question');
            startPolling(); // Restart polling even on failure
        }
    });

    async function fetchAndRenderQuestions(query = '') {
        let url = `/api/${BOARD_SLUG}/questions`;
        const trimmedQuery = query.trim();
        if (trimmedQuery) {
            url += `?q=${encodeURIComponent(trimmedQuery)}`;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error('Failed to fetch questions');
                return;
            }
            const questions = await response.json();
            // The backend now does all the sorting and filtering.
            // We can just render the result directly.
            if (!trimmedQuery) {
                // If we're not searching, update the global cache for polling.
                allQuestions = questions;
            }
            renderQuestions(questions);
        } catch (error) {
            console.error('Error fetching questions:', error);
        }
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

        // Remove questions that are no longer in the list
        Array.from(questionsList.children).forEach(child => {
            if (!currentIds.has(child.id)) {
                child.classList.add('popping');
                setTimeout(() => {
                    child.remove();
                }, 300);
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
        
        voteBtn.onclick = (event) => handleVote(q.id, voteBtn, voteCountSpan, event);
        if (hasVoted && BOARD_SLUG !== 'testing') voteBtn.disabled = true;

        voteCountSpan.className = 'vote-count';
        voteCountSpan.textContent = q.votes;

        voteArea.appendChild(voteBtn);
        voteArea.appendChild(voteCountSpan);

        bubble.appendChild(contentDiv);
        bubble.appendChild(voteArea);
        
        return bubble;
    }

    async function handleVote(id, btn, countSpan, event) {
        // On testing board, allow multiple votes with Alt key
        const isTestingBoard = BOARD_SLUG === 'testing';
        const allowMultipleVotes = isTestingBoard && event && event.altKey;
        
        if (localStorage.getItem(`voted_${id}`) && !allowMultipleVotes) return;

        // Calculate vote amount based on keyboard modifiers (testing board only)
        let amount = 1;
        if (isTestingBoard && event) {
            const shift = event.shiftKey;
            const ctrl = event.ctrlKey || event.metaKey; // Support both Ctrl and Cmd
            
            if (shift && ctrl) {
                amount = 100;
            } else if (ctrl) {
                amount = 20;
            } else if (shift) {
                amount = 3;
            }
        }

        // NOTE: Ensure 'pollTimer' is defined in your top-level variables
        clearTimeout(pollTimer); // Stop polling during vote

        const response = await fetch(`/api/${BOARD_SLUG}/questions/${id}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount })
        });

        if (response.ok) {
            if (!allowMultipleVotes) {
                localStorage.setItem(`voted_${id}`, 'true');
                btn.classList.add('voted');
                btn.disabled = true;
            }
            
            await fetchAndRenderQuestions();
            startPolling();
        } else {
            startPolling();
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

    function createBackgroundBubbles() {
        const ocean = document.querySelector('.ocean');
        if (!ocean) return;
        const bubbleCount = 20;

        for (let i = 0; i < bubbleCount; i++) {
            const bubble = document.createElement('div');
            bubble.className = 'background-bubble';

            const size = Math.random() * 60 + 20; // 20px to 80px
            bubble.style.width = `${size}px`;
            bubble.style.height = `${size}px`;

            bubble.style.left = `${Math.random() * 100}vw`;

            const duration = Math.random() * 20 + 15; // 15s to 35s
            bubble.style.animationDuration = `${duration}s`;

            const delay = Math.random() * 10; // 0s to 10s
            bubble.style.animationDelay = `${delay}s`;

            ocean.appendChild(bubble);
        }
    }

    createBackgroundBubbles();
});
