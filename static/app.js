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
            }
            
            // Ensure proper order without unnecessary moves
            const currentChild = questionsList.children[index];
            if (currentChild !== bubble) {
                questionsList.insertBefore(bubble, currentChild || null);
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
        if (hasVoted) voteBtn.disabled = true;

        voteCountSpan.className = 'vote-count';
        voteCountSpan.textContent = q.votes;

        voteArea.appendChild(voteBtn);
        voteArea.appendChild(voteCountSpan);

        bubble.appendChild(contentDiv);
        bubble.appendChild(voteArea);

        addInternalBubbles(bubble, q.votes);
        
        return bubble;
    }

    async function handleVote(id, btn, countSpan) {
        if (localStorage.getItem(`voted_${id}`)) return;

        const response = await fetch(`/api/questions/${id}/vote`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem(`voted_${id}`, 'true');
            btn.classList.add('voted');
            btn.disabled = true;
            countSpan.textContent = data.votes;
            
            const bubble = document.getElementById(`q-${id}`);
            addInternalBubbles(bubble, data.votes);
        }
    }

    function addInternalBubbles(container, voteCount) {
        let count = voteCount;
        let size = 20; 
        
        if (count > 100) {
            size = 5;
        } else if (count > 50) {
            size = 10;
        }

        const maxVisuals = 50; 
        const visualCount = Math.min(count, maxVisuals);

        // Get existing active bubbles (excluding ones currently popping)
        const currentBubbles = Array.from(container.querySelectorAll('.internal-bubble:not(.popping)'));
        const currentCount = currentBubbles.length;

        // Update size of existing bubbles
        currentBubbles.forEach(b => {
            b.style.width = `${size}px`;
            b.style.height = `${size}px`;
        });

        if (visualCount > currentCount) {
            // Add new bubbles
            const toAdd = visualCount - currentCount;
            for (let i = 0; i < toAdd; i++) {
                const b = document.createElement('div');
                b.className = 'internal-bubble';

                const left = Math.random() * 90;
                const delay = Math.random() * 5;
                const duration = 3 + Math.random() * 5;

                b.style.width = `${size}px`;
                b.style.height = `${size}px`;
                b.style.left = `${left}%`;
                b.style.bottom = '-20px';
                b.style.animationDuration = `${duration}s`;
                b.style.animationDelay = `${delay}s`;

                container.appendChild(b);
            }
        } else if (visualCount < currentCount) {
            // Remove excess bubbles with pop animation
            const toRemove = currentCount - visualCount;
            // Remove the "oldest" ones (first in list) or random? First is fine.
            for (let i = 0; i < toRemove; i++) {
                const b = currentBubbles[i];
                if (b) {
                    b.classList.add('popping');
                    // Remove from DOM after animation
                    setTimeout(() => {
                        b.remove();
                    }, 300); // Matches CSS animation duration
                }
            }
        }
    }
});
