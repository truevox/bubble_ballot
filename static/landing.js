document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    let width, height;

    function resizeCanvas() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // --- Animation State ---
    const clouds = [
        { x: width * 0.1, y: height * 0.15, size: 60, speed: 0.2 },
        { x: width * 0.5, y: height * 0.25, size: 80, speed: 0.3 },
        { x: width * 0.8, y: height * 0.1, size: 70, speed: 0.25 }
    ];

    const ship = {
        x: -300,
        speed: 4,
        lastAppearanceTime: -Infinity,
        appearanceInterval: 1000 // 1 second
    };

    let waveOffset = 0;
    let leafAngle = 0;

    // --- Drawing Functions ---

    function drawSky() {
        const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
        skyGradient.addColorStop(0, '#87CEEB'); // Light Sky Blue
        skyGradient.addColorStop(1, '#ADD8E6'); // Lighter Blue
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, width, height);
    }

    function drawCloud(cloud) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(cloud.x, cloud.y, cloud.size * 0.6, 0, Math.PI * 2);
        ctx.arc(cloud.x + cloud.size * 0.5, cloud.y - cloud.size * 0.2, cloud.size * 0.7, 0, Math.PI * 2);
        ctx.arc(cloud.x + cloud.size, cloud.y, cloud.size * 0.6, 0, Math.PI * 2);
        ctx.arc(cloud.x + cloud.size * 0.5, cloud.y + cloud.size * 0.3, cloud.size * 0.8, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
    }

    function drawOcean() {
        ctx.fillStyle = '#006994'; // Sea Blue
        ctx.beginPath();
        ctx.moveTo(0, height * 0.7);
        for (let x = 0; x < width; x++) {
            const y = Math.sin((x + waveOffset) * 0.01) * 10 + Math.sin((x + waveOffset) * 0.02) * 5;
            ctx.lineTo(x, height * 0.7 + y);
        }
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();
    }

    function drawIsland() {
        ctx.fillStyle = '#F4A460'; // Sandy Brown
        ctx.beginPath();
        ctx.moveTo(width * 0.2, height * 0.8);
        ctx.bezierCurveTo(width * 0.3, height * 0.7, width * 0.7, height * 0.7, width * 0.8, height * 0.85);
        ctx.bezierCurveTo(width * 0.7, height * 0.9, width * 0.3, height * 0.9, width * 0.2, height * 0.8);
        ctx.closePath();
        ctx.fill();
    }

    function drawTree() {
        const treeX = width * 0.6;
        const treeY = height * 0.78;
        const trunkHeight = 150;
        const trunkWidth = 15;

        // Trunk
        ctx.beginPath();
        ctx.moveTo(treeX - trunkWidth / 2, treeY);
        ctx.bezierCurveTo(
            treeX - trunkWidth * 2, treeY - trunkHeight * 0.5,
            treeX + trunkWidth * 2, treeY - trunkHeight * 0.75,
            treeX, treeY - trunkHeight
        );
         ctx.lineTo(treeX + trunkWidth/2, treeY - trunkHeight);
         ctx.bezierCurveTo(
            treeX + trunkWidth * 2, treeY - trunkHeight * 0.75,
            treeX - trunkWidth * 1.5, treeY - trunkHeight * 0.5,
            treeX + trunkWidth / 2, treeY
        );
        ctx.closePath();
        ctx.fillStyle = '#8B5A2B'; // A more textured brown
        ctx.fill();

        // Trunk texture
        ctx.strokeStyle = '#5C3D1E';
        ctx.lineWidth = 1;
        for (let i = 0; i < trunkHeight; i += 10) {
            const y = treeY - i;
            const xOffset = Math.sin(i / 20) * 5;
            ctx.beginPath();
            ctx.moveTo(treeX - trunkWidth / 2 + xOffset, y);
            ctx.lineTo(treeX + trunkWidth / 2 + xOffset, y - 2);
            ctx.stroke();
        }


        const topX = treeX;
        const topY = treeY - trunkHeight;

        // Coconuts
        ctx.fillStyle = '#654321';
        for (let i = 0; i < 3; i++) {
            const angle = i * (Math.PI * 2 / 5) + Math.PI / 4;
            const x = topX + Math.cos(angle) * 10;
            const y = topY + Math.sin(angle) * 10;
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fill();
        }

        // Leaves
        ctx.save();
        ctx.translate(topX, topY);
        ctx.rotate(leafAngle);
        ctx.fillStyle = '#006400'; // Darker Green

        const leafCount = 6;
        for (let i = 0; i < leafCount; i++) {
            ctx.rotate(Math.PI * 2 / leafCount);
            drawLeaf(ctx);
        }

        ctx.restore();
    }

    function drawLeaf(ctx) {
        const length = 120;
        const width = 25;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(length / 2, width, length, 0); // Top curve
        ctx.quadraticCurveTo(length / 2, -width / 2, 0, 0); // Bottom curve, creating a frond shape

        ctx.save();
        ctx.clip(); // Clip the drawing to the leaf shape

        // Add veins to the leaf
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 0.5;
        for(let i = 1; i < length; i += 5) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            const yEnd = (i < length / 2) ? (i / (length/2)) * width : ((length - i) / (length/2)) * width;
            ctx.lineTo(i, yEnd - Math.random() * 5);
            ctx.stroke();
        }

        ctx.restore(); // Restore context to remove clipping path
        ctx.fill();
    }

    function drawShip() {
        const shipY = height * 0.68;
        ctx.fillStyle = '#8B4513'; // Hull color
        ctx.beginPath();
        ctx.moveTo(ship.x, shipY);
        ctx.lineTo(ship.x + 100, shipY);
        ctx.lineTo(ship.x + 80, shipY + 30);
        ctx.lineTo(ship.x + 20, shipY + 30);
        ctx.closePath();
        ctx.fill();

        // Mast
        ctx.fillStyle = '#A0522D';
        ctx.fillRect(ship.x + 45, shipY - 50, 10, 50);

        // Sail
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(ship.x + 55, shipY - 45);
        ctx.lineTo(ship.x + 55, shipY - 5);
        ctx.lineTo(ship.x + 85, shipY - 25);
        ctx.closePath();
        ctx.fill();
    }

    // --- Animation Loop ---
    function animate() {
        const now = Date.now();
        // Update state
        clouds.forEach(cloud => {
            cloud.x += cloud.speed;
            if (cloud.x > width + cloud.size * 2) {
                cloud.x = -cloud.size * 2;
            }
        });

        if (now > ship.lastAppearanceTime + ship.appearanceInterval) {
             ship.x += ship.speed;
             if (ship.x > width + 150) {
                 ship.x = -300; // Reset position
                 ship.lastAppearanceTime = now; // Update time
             }
        } else if (ship.x > -300) {
             // continue moving if it's already on screen
             ship.x += ship.speed;
        }


        waveOffset += 0.5;
        leafAngle = Math.sin(now / 1000) * 0.05;


        // Draw scene
        ctx.clearRect(0, 0, width, height);
        drawSky();
        clouds.forEach(drawCloud);

        if (now > ship.lastAppearanceTime + ship.appearanceInterval || ship.x > -300 && ship.x < width + 150) {
            drawShip();
        }

        drawOcean();
        drawIsland();
        drawTree();

        requestAnimationFrame(animate);
    }

    ship.lastAppearanceTime = Date.now();
    // Start the animation
    animate();

    // --- Interactivity ---
    canvas.addEventListener('click', (event) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const shipY = height * 0.68;
        const shipWidth = 100;
        const shipTop = shipY - 50;
        const shipBottom = shipY + 30;
        const shipLeft = ship.x;
        const shipRight = ship.x + shipWidth;

        if (mouseX >= shipLeft && mouseX <= shipRight &&
            mouseY >= shipTop && mouseY <= shipBottom) {
            playHonkSound();
        }
    });

    function playHonkSound() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (!audioContext) {
            console.error("Web Audio API is not supported in this browser.");
            return;
        }

        const now = audioContext.currentTime;

        // First tone
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(220, now); // A3
        gain1.gain.setValueAtTime(0.5, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        osc1.start(now);
        osc1.stop(now + 0.4);

        // Second, slightly higher tone
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(261.6, now + 0.1); // C4
        gain2.gain.setValueAtTime(0.5, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.5);

        console.log("Played honk sound."); // For verification
    }

    // --- Dynamic Board Links ---
    function updateBoardLinks() {
        const boardsContainer = document.querySelector('.boards');
        fetch('/api/boards/recent')
            .then(response => response.json())
            .then(boards => {
                // Clear existing links
                boardsContainer.innerHTML = '';

                let boardSlugs = boards;
                if (!boardSlugs || boardSlugs.length === 0) {
                    // Fallback to default boards if none are returned
                    boardSlugs = ['general', 'testing', 'whatsfordinner'];
                }

                boardSlugs.forEach(slug => {
                    const link = document.createElement('a');
                    link.href = `/${slug}`;
                    link.className = 'board-link';
                    link.textContent = `/${slug}`;
                    boardsContainer.appendChild(link);
                });
            })
            .catch(error => {
                console.error('Error fetching recent boards:', error);
                // Optionally, display default boards on error
                const boardsContainer = document.querySelector('.boards');
                boardsContainer.innerHTML = `
                    <a href="/general" class="board-link">/general</a>
                    <a href="/testing" class="board-link">/testing</a>
                    <a href="/whatsfordinner" class="board-link">/whatsfordinner</a>
                `;
            });
    }

    updateBoardLinks();
});