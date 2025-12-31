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
        questions.forEach(q => {
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
                questionsList.appendChild(bubble);
            }
            
            // Re-order? If simplicity is key, appending might break order visually if sort changed.
            // Since we are sorting by votes DESC, re-appending ensures order.
            // A simple way to enforce order without destroying elements is appendChild in loop order.
            // appendChild moves the element if it already exists.
            questionsList.appendChild(bubble);
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
        // Only clear if we are re-rendering significantly? 
        // Actually, to add "more" bubbles, we probably want to clear and re-add 
        // OR intelligently add the difference. 
        // For simplicity, re-adding all is safer for "count" logic, 
        // but might reset animation of existing ones. 
        // Given we only call this on vote change or init, it's acceptable.
        
        container.querySelectorAll('.internal-bubble').forEach(e => e.remove());

        let count = voteCount;
        let size = 20; 
        
        if (count > 100) {
            size = 5;
        } else if (count > 50) {
            size = 10;
        }

        const maxVisuals = 50; 
        const visualCount = Math.min(count, maxVisuals);

        for (let i = 0; i < visualCount; i++) {
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
    }
});
