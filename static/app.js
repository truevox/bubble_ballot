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

        const hasVoted = BOARD_SLUG !== 'testing' && localStorage.getItem(`voted_${q.id}`);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'bubble-content';
        contentDiv.textContent = q.content;

        const voteArea = document.createElement('div');
        voteArea.className = 'vote-area';

        const voteBtn = document.createElement('button');
        voteBtn.className = `vote-btn ${hasVoted ? 'voted' : ''}`;
        voteBtn.innerHTML = '&#9650;'; // Up arrow
        const voteCountSpan = document.createElement('span'); // Declare here for closure
        
        voteBtn.onclick = (e) => handleVote(e, q.id, voteBtn, voteCountSpan);

        voteCountSpan.className = 'vote-count';
        voteCountSpan.textContent = q.votes;

        voteArea.appendChild(voteBtn);
        voteArea.appendChild(voteCountSpan);

        bubble.appendChild(contentDiv);
        bubble.appendChild(voteArea);
        
        return bubble;
    }

    async function handleVote(e, id, btn, countSpan) {
        if (btn.disabled) return; // Prevent double-clicking
        btn.disabled = true;

        const isTestingBoard = BOARD_SLUG === 'testing';
        const hasVoted = !isTestingBoard && localStorage.getItem(`voted_${id}`);
        const direction = hasVoted ? 'down' : 'up';

        let amount = 1;
        if (isTestingBoard) {
            if (e.shiftKey && e.ctrlKey) {
                amount = 100;
            } else if (e.ctrlKey) {
                amount = 20;
            } else if (e.shiftKey) {
                amount = 3;
            }
        }

        try {
            const response = await fetch(`/api/${BOARD_SLUG}/questions/${id}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ direction: direction, amount: amount })
            });

            if (response.ok) {
                const data = await response.json();

                if (!isTestingBoard) {
                    if (hasVoted) {
                        localStorage.removeItem(`voted_${id}`);
                        btn.classList.remove('voted');
                    } else {
                        localStorage.setItem(`voted_${id}`, 'true');
                        btn.classList.add('voted');
                    }
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
            const allBubbles = Array.from(document.querySelectorAll('.internal-bubble'));
            const movingBubbles = allBubbles.filter(b => b.physics && !b.classList.contains('popping'));

            if (allBubbles.length === 0) {
                isAnimationLoopRunning = false;
                return;
            }

            // Handle collisions between moving bubbles
            for (let i = 0; i < movingBubbles.length; i++) {
                for (let j = i + 1; j < movingBubbles.length; j++) {
                    const b1 = movingBubbles[i];
                    const b2 = movingBubbles[j];

                    const dx = b2.physics.x - b1.physics.x;
                    const dy = b2.physics.y - b1.physics.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const size1 = parseFloat(b1.style.width);
                    const size2 = parseFloat(b2.style.width);
                    const minDistance = (size1 + size2) / 2;

                    if (distance < minDistance) {
                        // Resolve overlap
                        const overlap = 0.5 * (minDistance - distance);
                        const nx = dx / distance;
                        const ny = dy / distance;
                        b1.physics.x -= overlap * nx;
                        b1.physics.y -= overlap * ny;
                        b2.physics.x += overlap * nx;
                        b2.physics.y += overlap * ny;

                        // Resolve collision (elastic collision with equal mass)
                        const dvx = b1.physics.vx - b2.physics.vx;
                        const dvy = b1.physics.vy - b2.physics.vy;
                        const dot = dvx * nx + dvy * ny;

                        // Exchange momentum along the collision normal
                        const impulseX = dot * nx;
                        const impulseY = dot * ny;

                        b1.physics.vx -= impulseX;
                        b1.physics.vy -= impulseY;
                        b2.physics.vx += impulseX;
                        b2.physics.vy += impulseY;
                    }
                }
            }

            // Handle movement, wall collisions, and animations for all bubbles
            allBubbles.forEach(b => {
                if (!b.physics) return;

                const isPopping = b.classList.contains('popping');

                if (isPopping) {
                    // Handle popping animation. Bubble stays in place.
                    let transform = `translate(${b.physics.x}px, ${b.physics.y}px)`;
                    if (b.animation && b.animation.type === 'pop') {
                        const elapsed = Date.now() - b.animation.start;
                        const progress = Math.min(elapsed / b.animation.duration, 1);
                        let scale = 1;
                        if (progress < 0.5) {
                            scale = 1 + (progress * 2) * 0.4;
                        } else {
                            scale = 1.4 - ((progress - 0.5) * 2) * 1.4;
                        }
                        transform += ` scale(${scale})`;
                    }
                    b.style.transform = transform;
                } else {
                    // Handle normal movement
                    b.physics.x += b.physics.vx;
                    b.physics.y += b.physics.vy;

                    // Wall collisions
                    const container = b.parentElement;
                    const containerWidth = container.offsetWidth;
                    const containerHeight = container.offsetHeight;
                    const bubbleSize = parseFloat(b.style.width);

                    if (b.physics.x <= 0) { b.physics.x = 0; b.physics.vx *= -1; }
                    if (b.physics.x >= containerWidth - bubbleSize) { b.physics.x = containerWidth - bubbleSize; b.physics.vx *= -1; }
                    if (b.physics.y <= 0) { b.physics.y = 0; b.physics.vy *= -1; }
                    if (b.physics.y >= containerHeight - bubbleSize) { b.physics.y = containerHeight - bubbleSize; b.physics.vy *= -1; }

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
        let size, maxVisuals, velocity;

        if (count > 200) { // Churning foam
            size = 8;
            maxVisuals = 150;
            velocity = 2.5;
        } else if (count > 100) { // Dense bubbles
            size = 12;
            maxVisuals = 100;
            velocity = 2;
        } else if (count > 50) { // Regular bubbles
            size = 18;
            maxVisuals = 75;
            velocity = 1.5;
        } else { // Sparse bubbles
            size = 25;
            maxVisuals = 50;
            velocity = 1;
        }

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
                b.style.opacity = '0'; // Start invisible to prevent flicker at (0,0)

                container.appendChild(b);

                // Defer positioning until the element is in the DOM and has dimensions
                requestAnimationFrame(() => {
                    const containerWidth = container.offsetWidth;
                    const containerHeight = container.offsetHeight;

                    if (containerWidth > 0 && containerHeight > 0) {
                        b.physics = {
                            x: Math.random() * (containerWidth - size),
                            y: Math.random() * (containerHeight - size),
                            vx: (Math.random() - 0.5) * velocity,
                            vy: (Math.random() - 0.5) * velocity
                        };

                        b.style.transform = `translate(${b.physics.x}px, ${b.physics.y}px)`;
                        b.style.opacity = '1';
                        b.classList.add('cavitate'); // Start animation now
                    } else {
                        // If container is not visible or has no size, don't add the bubble
                        b.remove();
                    }
                });
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
