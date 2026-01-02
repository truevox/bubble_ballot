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
        speed: 0.4,
        lastAppearanceTime: -Infinity,
        appearanceInterval: 45000 // 45 seconds
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
        const treeX = width * 0.5;
        const treeY = height * 0.75;

        // Trunk
        ctx.fillStyle = '#8B4513'; // Saddle Brown
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const segY = treeY - i * 20;
            ctx.fillRect(treeX - 10 + Math.sin(i) * 2, segY - 20, 20, 22);
        }
        ctx.closePath();

        // Leaves
        ctx.save();
        ctx.translate(treeX, treeY - 120);
        ctx.rotate(leafAngle);
        ctx.fillStyle = '#228B22'; // Forest Green
        for (let i = 0; i < 5; i++) {
            ctx.rotate(Math.PI * 2 / 5);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(40, 20, 80, -20, 120, 0);
            ctx.bezierCurveTo(80, 20, 40, -20, 0, 0);
            ctx.fill();
        }
        ctx.restore();
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
});