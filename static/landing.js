document.addEventListener('DOMContentLoaded', function() {
    const cloud1 = document.getElementById('cloud1');
    const cloud2 = document.getElementById('cloud2');
    const cloud3 = document.getElementById('cloud3');
    const ship = document.getElementById('ship');
    const leaves = document.querySelectorAll('.leaves');

    function animateClouds() {
        cloud1.style.animation = 'animateCloud 35s linear infinite';
        cloud2.style.animation = 'animateCloud 20s linear infinite';
        cloud3.style.animation = 'animateCloud 30s linear infinite';
    }

    function animateShip() {
        ship.style.animation = 'animateShip 120s linear infinite';
    }

    function animateLeaves() {
        leaves.forEach((leaf, index) => {
            leaf.style.animation = `animateLeaves 5s ease-in-out infinite ${index * 0.1}s`;
        });
    }

    animateClouds();
    animateShip();
    animateLeaves();
});

const style = document.createElement('style');
style.innerHTML = `
    @keyframes animateCloud {
        0% {
            transform: translateX(-200px);
        }
        100% {
            transform: translateX(100vw);
        }
    }

    @keyframes animateShip {
        0% {
            transform: translateX(-200px) rotateY(180deg);
        }
        100% {
            transform: translateX(100vw) rotateY(180deg);
        }
    }

    @keyframes animateLeaves {
        0%, 100% {
            transform: rotateZ(0deg);
        }
        50% {
            transform: rotateZ(5deg);
        }
    }
`;
document.head.appendChild(style);
