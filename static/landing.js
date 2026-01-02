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
        ctx.moveTo(0, height * 0.6);
        for (let x = 0; x < width; x++) {
            const y = Math.sin((x + waveOffset) * 0.01) * 10 + Math.sin((x + waveOffset) * 0.02) * 5;
            ctx.lineTo(x, height * 0.6 + y);
        }
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();
    }

    function drawIsland() {
        ctx.fillStyle = '#F4A460'; // Sandy Brown
        ctx.beginPath();
        ctx.moveTo(width * 0.25, height * 0.7);
        ctx.bezierCurveTo(width * 0.3, height * 0.6, width * 0.7, height * 0.6, width * 0.75, height * 0.75);
        ctx.bezierCurveTo(width * 0.7, height * 0.8, width * 0.3, height * 0.8, width * 0.25, height * 0.7);
        ctx.closePath();
        ctx.fill();
    }

    function drawTree() {
        const treeX = width * 0.65;
        const treeY = height * 0.7;
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

    function drawShip() {
        const shipY = height * 0.58;
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

        const shipY = height * 0.58;
        const shipWidth = 100;
        const shipHeight = 80; // from mast top to hull bottom
        const shipTop = shipY - 50;
        const shipBottom = shipY + 30;
        const shipLeft = ship.x;
        const shipRight = ship.x + shipWidth;

        if (mouseX >= shipLeft && mouseX <= shipRight &&
            mouseY >= shipTop && mouseY <= shipBottom) {
            playBoatHorn();
        }
    });

    let audioContext;
    function playBoatHorn() {
        if (!audioContext) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.error("Web Audio API is not supported in this browser.");
                return;
            }
        }

        const now = audioContext.currentTime;
        const fundamental = 110; // A2
        const vibratoRate = 5; // 5 Hz for vibrato
        const vibratoDepth = 3; // 3 Hz modulation depth

        // --- Main Oscillators for Harmonics ---
        const harmonics = [1, 1.5, 2, 3]; // Fundamental, a fifth, an octave, and another fifth
        const oscillators = harmonics.map(harmonic => {
            const osc = audioContext.createOscillator();
            osc.frequency.setValueAtTime(fundamental * harmonic, now);
            return osc;
        });

        // --- LFO for Vibrato ---
        const lfo = audioContext.createOscillator();
        lfo.frequency.setValueAtTime(vibratoRate, now);
        const lfoGain = audioContext.createGain();
        lfoGain.gain.setValueAtTime(vibratoDepth, now);
        lfo.connect(lfoGain);
        oscillators.forEach(osc => lfoGain.connect(osc.frequency)); // Modulate frequency

        // --- Volume Envelope ---
        const envelope = audioContext.createGain();
        envelope.gain.setValueAtTime(0, now);
        envelope.gain.linearRampToValueAtTime(0.4, now + 0.05); // Attack
        envelope.gain.linearRampToValueAtTime(0.4, now + 0.8);  // Sustain
        envelope.gain.exponentialRampToValueAtTime(0.001, now + 1.2); // Release

        // --- Filter ---
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(350, now);
        filter.Q.setValueAtTime(1, now);

        // --- Distortion ---
        const distortion = audioContext.createWaveShaper();
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

        // --- Signal Path ---
        oscillators.forEach(osc => osc.connect(envelope));
        envelope.connect(distortion);
        distortion.connect(filter);
        filter.connect(audioContext.destination);

        // --- Start & Stop ---
        lfo.start(now);
        lfo.stop(now + 1.2);
        oscillators.forEach(osc => {
            osc.start(now);
            osc.stop(now + 1.2);
        });
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