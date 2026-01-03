document.addEventListener('DOMContentLoaded', () => {
    const boardsContainer = document.getElementById('boards-container');
    const boat = document.querySelector('.boat');
    const speechBubble = document.querySelector('.speech-bubble');
    const island = document.querySelector('.island');
    const sea = document.querySelector('.sea');

    let boards = [];

    // --- Sound Synthesis ---
    let audioContext;
    function initAudio() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playBoatSound() {
        if (!audioContext) return;
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 1);
    }

    boat.addEventListener('click', () => {
        initAudio();
        playBoatSound();
        speechBubble.innerHTML = '🔔';
        speechBubble.classList.add('show');
        setTimeout(() => speechBubble.classList.remove('show'), 2000);
    });


    // --- Physics & Animation ---

    function createBoardElement(board) {
        const boardEl = document.createElement('a');
        boardEl.className = 'board-link';
        boardEl.href = `/${board.slug}`;
        boardEl.textContent = board.slug;
        boardsContainer.appendChild(boardEl);

        // Wait for render to get dimensions
        requestAnimationFrame(() => {
            const seaRect = sea.getBoundingClientRect();
            boardEl.physics = {
                x: Math.random() * (seaRect.width - boardEl.offsetWidth),
                y: seaRect.top + Math.random() * (seaRect.height - boardEl.offsetHeight),
                vx: (Math.random() - 0.5) * 1,
                vy: (Math.random() - 0.5) * 1,
                width: boardEl.offsetWidth,
                height: boardEl.offsetHeight,
            };
        });

        return boardEl;
    }

    async function fetchRecentBoards() {
        try {
            const response = await fetch('/api/boards/recent');
            if (!response.ok) return;
            const recentBoards = await response.json();
            boards = recentBoards.map(createBoardElement);
            requestAnimationFrame(animationLoop);
        } catch (error) {
            console.error("Failed to fetch recent boards:", error);
        }
    }

    function animationLoop() {
        const seaRect = sea.getBoundingClientRect();
        const islandRect = island.getBoundingClientRect();

        boards.forEach(b1 => {
            if (!b1.physics) return;

            // Update position
            b1.physics.x += b1.physics.vx;
            b1.physics.y += b1.physics.vy;

            // Boundary collisions (sea)
            if (b1.physics.x < 0 || b1.physics.x + b1.physics.width > seaRect.width) {
                b1.physics.vx *= -1;
            }
            if (b1.physics.y < seaRect.top || b1.physics.y + b1.physics.height > seaRect.top + seaRect.height) {
                b1.physics.vy *= -1;
            }

            // Clamp position to stay within sea
            b1.physics.x = Math.max(0, Math.min(b1.physics.x, seaRect.width - b1.physics.width));
            b1.physics.y = Math.max(seaRect.top, Math.min(b1.physics.y, seaRect.top + seaRect.height - b1.physics.height));

            // Board-to-board collision
            boards.forEach(b2 => {
                if (b1 === b2 || !b2.physics) return;

                if (b1.physics.x < b2.physics.x + b2.physics.width &&
                    b1.physics.x + b1.physics.width > b2.physics.x &&
                    b1.physics.y < b2.physics.y + b2.physics.height &&
                    b1.physics.y + b1.physics.height > b2.physics.y) {

                    // Simple elastic collision response
                    [b1.physics.vx, b2.physics.vx] = [b2.physics.vx, b1.physics.vx];
                    [b1.physics.vy, b2.physics.vy] = [b2.physics.vy, b1.physics.vy];
                }
            });

            // Island collision
            if (b1.physics.x < islandRect.right && b1.physics.x + b1.physics.width > islandRect.left &&
                b1.physics.y < islandRect.bottom && b1.physics.y + b1.physics.height > islandRect.top) {
                b1.physics.vx *= -1;
                b1.physics.vy *= -1;
            }

            b1.style.transform = `translate(${b1.physics.x}px, ${b1.physics.y}px)`;
        });

        requestAnimationFrame(animationLoop);
    }

    fetchRecentBoards();
});
