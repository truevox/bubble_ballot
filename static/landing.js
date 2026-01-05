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
        { x: width * 0.1, y: height * 0.05, size: 60, speed: 0.2 },
        { x: width * 0.5, y: height * 0.15, size: 80, speed: 0.3 },
        { x: width * 0.8, y: height * 0.05, size: 70, speed: 0.25 }
    ];

    const SHIP_APPEARANCE_INTERVAL_MS = 2000;
    const ship = {
        x: -300,
        speed: 2, // Slower speed
        lastAppearanceTime: -Infinity,
        appearanceInterval: SHIP_APPEARANCE_INTERVAL_MS // Appear half as often
    };

    let waveOffset = 0;
    let leafAngle = 0;
    const boardLinks = [];
    const coconuts = [];
    
    // Speech bubble state for boat horn
    let speechBubble = {
        visible: false,
        showTime: 0,
        duration: 1200 // Match horn duration
    };

    // --- Physics Simulation ---
    function updateLinkPhysics() {
        const damping = 0.98;
        const angularDamping = 0.95;

        boardLinks.forEach(link => {
            // --- Water Currents ---
            if (Math.random() < 0.01) { // Apply a random impulse occasionally
                const forceX = (Math.random() - 0.5) * 0.5;
                const forceY = (Math.random() - 0.5) * 0.5;
                link.vx += forceX;
                link.vy += forceY;

                // Apply torque for spinning
                const offsetX = (Math.random() - 0.5) * link.width * 0.5;
                const offsetY = (Math.random() - 0.5) * link.height * 0.5;
                const torque = (offsetX * forceY - offsetY * forceX);
                const inertia = 100; // Adjust this value to get desired spin
                link.angularVelocity += torque / inertia;
            }

            // Apply velocity
            link.x += link.vx;
            link.y += link.vy;
            link.angle += link.angularVelocity;

            // Apply damping
            link.vx *= damping;
            link.vy *= damping;
            link.angularVelocity *= angularDamping;

            // Island collision
            const islandCX = width * 0.5;
            const islandCY = height * 0.55;
            const islandRX = width * 0.25;
            const islandRY = height * 0.1;

            const linkCenterX = link.x + link.width / 2;
            const linkCenterY = link.y + link.height / 2;

            const dx = linkCenterX - islandCX;
            const dy = linkCenterY - islandCY;

            // Check if the link's center is inside the island's ellipse
            if ((dx * dx) / (islandRX * islandRX) + (dy * dy) / (islandRY * islandRY) < 1) {
                // Collision detected, push the link out
                const angle = Math.atan2(dy, dx);
                const pushOutX = Math.cos(angle) * (islandRX - Math.abs(dx));
                const pushOutY = Math.sin(angle) * (islandRY - Math.abs(dy));

                link.x += pushOutX * 0.1; // Move it out slowly
                link.y += pushOutY * 0.1;

                // Reverse velocity component pointing towards the island
                const normal = { x: Math.cos(angle), y: Math.sin(angle) };
                const dotProduct = link.vx * normal.x + link.vy * normal.y;
                link.vx -= 2 * dotProduct * normal.x;
                link.vy -= 2 * dotProduct * normal.y;
            }

            // AABB collision detection for rotated boxes
            const waterTop = height * 0.45;
            const w = link.width;
            const h = link.height;
            const cx = link.x + w / 2;
            const cy = link.y + h / 2;
            const angle = link.angle;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const corners = [
                { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
                { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }
            ];

            const rotatedCorners = corners.map(p => ({
                x: cx + p.x * cos - p.y * sin,
                y: cy + p.x * sin + p.y * cos
            }));

            const minX = Math.min(...rotatedCorners.map(p => p.x));
            const maxX = Math.max(...rotatedCorners.map(p => p.x));
            const minY = Math.min(...rotatedCorners.map(p => p.y));
            const maxY = Math.max(...rotatedCorners.map(p => p.y));

            if (minX < 0) {
                link.x += -minX;
                link.vx *= -1;
            }
            if (maxX > width) {
                link.x -= (maxX - width);
                link.vx *= -1;
            }
            if (minY < waterTop) {
                link.y += (waterTop - minY);
                link.vy *= -1;
            }
            if (maxY > height) {
                link.y -= (maxY - height);
                link.vy *= -1;
            }
        });

        // Collision detection between boards
        for (let i = 0; i < boardLinks.length; i++) {
            for (let j = i + 1; j < boardLinks.length; j++) {
                const linkA = boardLinks[i];
                const linkB = boardLinks[j];

                // Calculate centers
                const aCenterX = linkA.x + linkA.width / 2;
                const aCenterY = linkA.y + linkA.height / 2;
                const bCenterX = linkB.x + linkB.width / 2;
                const bCenterY = linkB.y + linkB.height / 2;

                // Check AABB collision
                if (linkA.x < linkB.x + linkB.width &&
                    linkA.x + linkA.width > linkB.x &&
                    linkA.y < linkB.y + linkB.height &&
                    linkA.y + linkA.height > linkB.y) {

                    // Calculate overlap on each axis
                    const overlapX = Math.min(
                        linkA.x + linkA.width - linkB.x,
                        linkB.x + linkB.width - linkA.x
                    );
                    const overlapY = Math.min(
                        linkA.y + linkA.height - linkB.y,
                        linkB.y + linkB.height - linkA.y
                    );

                    // Separate along axis of least penetration
                    if (overlapX < overlapY) {
                        // Separate horizontally
                        const separationX = overlapX / 2;
                        if (aCenterX < bCenterX) {
                            linkA.x -= separationX;
                            linkB.x += separationX;
                        } else {
                            linkA.x += separationX;
                            linkB.x -= separationX;
                        }
                        // Bounce horizontally
                        const restitution = 0.8;
                        [linkA.vx, linkB.vx] = [linkB.vx * restitution, linkA.vx * restitution];
                    } else {
                        // Separate vertically
                        const separationY = overlapY / 2;
                        if (aCenterY < bCenterY) {
                            linkA.y -= separationY;
                            linkB.y += separationY;
                        } else {
                            linkA.y += separationY;
                            linkB.y -= separationY;
                        }
                        // Bounce vertically
                        const restitution = 0.8;
                        [linkA.vy, linkB.vy] = [linkB.vy * restitution, linkA.vy * restitution];
                    }
                }
            }
        }

        // Update DOM
        boardLinks.forEach(link => {
            link.el.style.left = `${link.x}px`;
            link.el.style.top = `${link.y}px`;
            link.el.style.transform = `rotate(${link.angle}rad)`;
        });
    }


    // --- Coconut Animation ---
    function updateCoconuts() {
        const groundY = height * 0.55;
        const gravity = 0.5;

        for (let i = coconuts.length - 1; i >= 0; i--) {
            const coconut = coconuts[i];

            if (coconut.state === 'falling') {
                coconut.vy += gravity;
                coconut.y += coconut.vy;
                if (coconut.y >= groundY - 10) {
                    playCoconutThudSound();
                    coconut.state = 'split';
                    coconut.splitTime = Date.now();
                    coconut.paths = [
                        { vx: (Math.random() - 0.5) * 4, vy: -2 },
                        { vx: (Math.random() - 0.5) * 4, vy: -2 }
                    ];
                }
            } else if (coconut.state === 'split') {
                if (Date.now() - coconut.splitTime > 200) { // Roll after a short pause
                     coconut.state = 'rolling';
                }
            } else if (coconut.state === 'rolling') {
                 coconut.paths.forEach(p => {
                    p.vy += gravity * 0.5;
                    coconut.x += p.vx;
                    coconut.y += p.vy;
                 });
                 if (coconut.y > height) {
                     coconuts.splice(i, 1);
                 }
            }
        }
    }

     function drawCoconut(coconut) {
        ctx.fillStyle = '#654321';
        if (coconut.state === 'falling') {
            ctx.beginPath();
            ctx.arc(coconut.x, coconut.y, 10, 0, Math.PI * 2);
            ctx.fill();
        } else if (coconut.state === 'split' || coconut.state === 'rolling') {
            ctx.beginPath();
            ctx.arc(coconut.x - 5, coconut.y, 8, 0, Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(coconut.x + 5, coconut.y, 8, 0, Math.PI);
            ctx.fill();
        }
    }

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
        ctx.moveTo(0, height * 0.45);
        for (let x = 0; x < width; x++) {
            const y = Math.sin((x + waveOffset) * 0.01) * 10 + Math.sin((x + waveOffset) * 0.02) * 5;
            ctx.lineTo(x, height * 0.45 + y);
        }
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();
    }

    function drawIsland() {
        ctx.fillStyle = '#F4A460'; // Sandy Brown
        ctx.beginPath();
        ctx.moveTo(width * 0.25, height * 0.55);
        ctx.bezierCurveTo(width * 0.3, height * 0.45, width * 0.7, height * 0.45, width * 0.75, height * 0.6);
        ctx.bezierCurveTo(width * 0.7, height * 0.65, width * 0.3, height * 0.65, width * 0.25, height * 0.55);
        ctx.closePath();
        ctx.fill();
    }

    function drawTree() {
        const treeX = width * 0.65;
        const treeY = height * 0.55;
        const trunkHeight = 120;
        const trunkWidth = 10;

        // Trunk
        ctx.beginPath();
        ctx.moveTo(treeX, treeY);
        ctx.bezierCurveTo(
            treeX + trunkWidth * 2, treeY - trunkHeight * 0.5,
            treeX - trunkWidth, treeY - trunkHeight * 0.75,
            treeX + 5, treeY - trunkHeight
        );
        ctx.lineTo(treeX - 5, treeY - trunkHeight);
         ctx.bezierCurveTo(
            treeX - trunkWidth * 2, treeY - trunkHeight * 0.5,
            treeX + trunkWidth, treeY - trunkHeight * 0.75,
            treeX, treeY
        );
        ctx.closePath();
        ctx.fillStyle = '#A0522D';
        ctx.fill();

        // Trunk lines
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < trunkHeight; i+= 15) {
            ctx.beginPath();
            ctx.moveTo(treeX - 4, treeY - i);
            ctx.lineTo(treeX + 4, treeY - i - 2);
            ctx.stroke();
        }

        // Leaves
        const topX = treeX;
        const topY = treeY - trunkHeight;
        ctx.fillStyle = '#228B22'; // Forest Green

        ctx.save();
        ctx.translate(topX, topY);

        // Add the wind effect to the whole leaf structure
        ctx.rotate(leafAngle);

        // Define leaves with more natural, asymmetrical properties
        const leaves = [
            { angle: 0.5, length: 90, curve: 30, width: 20 },
            { angle: 1.5, length: 100, curve: 40, width: 25 },
            { angle: 2.8, length: 95, curve: 35, width: 22 },
            { angle: 4.0, length: 110, curve: 45, width: 28 },
            { angle: 5.5, length: 85, curve: 25, width: 18 }
        ];

        leaves.forEach(leaf => {
            ctx.save();
            ctx.rotate(leaf.angle);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            // Draw a more "frond-like" shape
            ctx.quadraticCurveTo(leaf.length / 2, leaf.curve, leaf.length, 0);
            ctx.quadraticCurveTo(leaf.length / 2, -leaf.width, 0, 0);
            ctx.fill();
            ctx.restore();
        });

        ctx.restore();
    }

    function drawSpeechBubble() {
        if (!speechBubble.visible) return;

        const shipY = height * 0.43;
        const bubbleX = ship.x + 50; // Center of ship
        const bubbleY = shipY - 70; // Above the ship
        const bubbleWidth = 60;
        const bubbleHeight = 50;

        // Draw speech bubble background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;

        // Main bubble
        ctx.beginPath();
        ctx.ellipse(bubbleX, bubbleY, bubbleWidth / 2, bubbleHeight / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Tail of speech bubble
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.beginPath();
        ctx.moveTo(bubbleX - 10, bubbleY + 15);
        ctx.lineTo(bubbleX - 5, bubbleY + 30);
        ctx.lineTo(bubbleX + 5, bubbleY + 15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw bell/whistle icon
        ctx.fillStyle = '#333';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;

        // Draw a simple bell
        ctx.beginPath();
        ctx.moveTo(bubbleX - 10, bubbleY - 5);
        ctx.quadraticCurveTo(bubbleX - 10, bubbleY - 15, bubbleX, bubbleY - 15);
        ctx.quadraticCurveTo(bubbleX + 10, bubbleY - 15, bubbleX + 10, bubbleY - 5);
        ctx.lineTo(bubbleX + 8, bubbleY + 5);
        ctx.lineTo(bubbleX - 8, bubbleY + 5);
        ctx.closePath();
        ctx.fill();

        // Bell clapper
        ctx.beginPath();
        ctx.arc(bubbleX, bubbleY + 8, 3, 0, Math.PI * 2);
        ctx.fill();

        // Sound waves
        const elapsed = Date.now() - speechBubble.showTime;
        const waveOpacity = Math.max(0, 1 - elapsed / speechBubble.duration);
        ctx.strokeStyle = `rgba(51, 51, 51, ${waveOpacity})`;
        ctx.lineWidth = 1.5;
        
        for (let i = 1; i <= 3; i++) {
            const offset = (elapsed * 0.1 + i * 10) % 30;
            ctx.beginPath();
            ctx.arc(bubbleX + 15, bubbleY - 10, offset, -Math.PI / 4, Math.PI / 4);
            ctx.stroke();
        }
    }

    function drawShip() {
        const shipY = height * 0.43;
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

        // Update speech bubble visibility
        if (speechBubble.visible && now - speechBubble.showTime > speechBubble.duration) {
            speechBubble.visible = false;
        }

        // Update physics
        updateLinkPhysics();
        updateCoconuts();

        // Draw scene
        ctx.clearRect(0, 0, width, height);
        drawSky();
        clouds.forEach(drawCloud);

        if (now > ship.lastAppearanceTime + ship.appearanceInterval || ship.x > -300 && ship.x < width + 150) {
            drawShip();
            drawSpeechBubble();
        }

        drawOcean();
        drawIsland();
        drawTree();
        coconuts.forEach(drawCoconut);

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

        const shipY = height * 0.43;
        const shipWidth = 100;
        // shipHeight variable removed as it was unused
        const shipTop = shipY - 50;
        const shipBottom = shipY + 30;
        const shipLeft = ship.x;
        const shipRight = ship.x + shipWidth;

        if (mouseX >= shipLeft && mouseX <= shipRight &&
            mouseY >= shipTop && mouseY <= shipBottom) {
            playBoatHorn();
        }

        const treeX = width * 0.65;
        const treeY = height * 0.55;
        const trunkHeight = 120;
        const treeTopY = treeY - trunkHeight;
        const treeRadius = 60; // Approximate radius of the leaves

        const dist = Math.sqrt(Math.pow(mouseX - treeX, 2) + Math.pow(mouseY - treeTopY, 2));
        if (dist < treeRadius) {
            spawnCoconut();
        }
    });

    function playCoconutFallSound() {
        if (!audioContext) return;
        const now = audioContext.currentTime;

        const osc = audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.5);

        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(gain);
        gain.connect(audioContext.destination);

        osc.start(now);
        osc.stop(now + 0.5);
    }

    function playCoconutThudSound() {
        if (!audioContext) return;
        const now = audioContext.currentTime;

        const osc = audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, now);

        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(audioContext.destination);

        osc.start(now);
        osc.stop(now + 0.2);
    }

    function spawnCoconut() {
        initAudio(); // Ensure the audio context is created on user gesture
        playCoconutFallSound();
        const treeX = width * 0.65;
        const treeY = height * 0.55;
        const trunkHeight = 120;

        coconuts.push({
            x: treeX + (Math.random() - 0.5) * 30,
            y: treeY - trunkHeight,
            vy: 0,
            state: 'falling'
        });
    }

    let audioContext;
    function initAudio() {
        if (!audioContext) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.error("Web Audio API is not supported in this browser.");
            }
        }
    }

    const SoundFactory = {
        createBoatHorn: (context) => {
            const fundamental = 110;
            const vibratoRate = 5;
            const vibratoDepth = 3;
            const duration = 1.2;

            // Nodes
            const envelope = context.createGain();
            const filter = context.createBiquadFilter();
            const distortion = context.createWaveShaper();
            const lfo = context.createOscillator();
            const lfoGain = context.createGain();

            // Setup
            const harmonics = [1, 1.5, 2, 3];
            const oscillators = harmonics.map(harmonic => {
                const osc = context.createOscillator();
                osc.frequency.value = fundamental * harmonic;
                return osc;
            });

            lfo.frequency.value = vibratoRate;
            lfoGain.gain.value = vibratoDepth;
            filter.type = 'lowpass';
            filter.frequency.value = 350;
            filter.Q.value = 1;

            const amount = 200;
            const n_samples = 44100;
            const curve = new Float32Array(n_samples);
            const deg = Math.PI / 180;
            for (let i = 0; i < n_samples; ++i) {
                const x = i * 2 / n_samples - 1;
                curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
            }
            distortion.curve = curve;
            distortion.oversample = '4x';

            // Connections
            lfo.connect(lfoGain);
            oscillators.forEach(osc => lfoGain.connect(osc.frequency));
            oscillators.forEach(osc => osc.connect(envelope));
            envelope.connect(distortion);
            distortion.connect(filter);
            filter.connect(context.destination);

            return {
                play: () => {
                    const now = context.currentTime;

                    envelope.gain.setValueAtTime(0, now);
                    envelope.gain.linearRampToValueAtTime(0.4, now + 0.05);
                    envelope.gain.linearRampToValueAtTime(0.4, now + duration - 0.4);
                    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);

                    lfo.start(now);
                    lfo.stop(now + duration);
                    oscillators.forEach(osc => {
                        osc.start(now);
                        osc.stop(now + duration);
                    });
                }
            };
        }
    };

    function playBoatHorn() {
        initAudio();
        if (audioContext) {
            const horn = SoundFactory.createBoatHorn(audioContext);
            horn.play();
        }
        // Show speech bubble
        speechBubble.visible = true;
        speechBubble.showTime = Date.now();
    }

    // --- Dynamic Board Links ---
    const DEFAULT_BOARD_SLUGS = ['general', 'testing', 'whatsfordinner'];

    function renderBoardLinks(boardSlugs) {
        const boardsContainer = document.querySelector('.boards');
        if (!boardsContainer) return;

        boardsContainer.innerHTML = '';
        boardLinks.length = 0;

        let slugs = boardSlugs;
        if (!slugs || slugs.length === 0) {
            slugs = DEFAULT_BOARD_SLUGS;
        }

        // First, create and append all elements to the DOM
        slugs.forEach(slug => {
            const linkEl = document.createElement('a');
            linkEl.href = `/${slug}`;
            linkEl.className = 'board-link';
            linkEl.textContent = `/${slug}`;
            boardsContainer.appendChild(linkEl);
            boardLinks.push({ el: linkEl }); // Push a temporary object
        });

        // Then, initialize physics in the next frame to ensure dimensions are available
        requestAnimationFrame(() => {
            boardLinks.forEach(link => {
                link.width = link.el.offsetWidth;
                link.height = link.el.offsetHeight;

                // Now that we have dimensions, calculate a valid starting position
                do {
                    link.x = Math.random() * (width - link.width);
                    link.y = height * 0.45 + Math.random() * (height * 0.55 - link.height);
                } while (isCollidingWithIsland(link));

                // Initialize the rest of the physics properties
                link.vx = (Math.random() - 0.5) * 2;
                link.vy = (Math.random() - 0.5) * 2;
                link.angle = 0;
                link.angularVelocity = (Math.random() - 0.5) * 0.02;
            });
        });
    }

    function updateBoardLinks() {
        fetch('/api/boards/recent')
            .then(response => response.json())
            .then(boards => {
                renderBoardLinks(boards);
            })
            .catch(error => {
                console.error('Error fetching recent boards:', error);
                // Display default boards on error
                renderBoardLinks(DEFAULT_BOARD_SLUGS);
            });
    }

    updateBoardLinks();

    function isCollidingWithIsland(link) {
        const islandCX = width * 0.5;
        const islandCY = height * 0.55;
        const islandRX = width * 0.25;
        const islandRY = height * 0.1;

        const linkCenterX = link.x + link.width / 2;
        const linkCenterY = link.y + link.height / 2;

        const dx = linkCenterX - islandCX;
        const dy = linkCenterY - islandCY;

        return (dx * dx) / (islandRX * islandRX) + (dy * dy) / (islandRY * islandRY) < 1;
    }
});