// ui.js
// Score display and the round-result / endgame modal (including the small
// map inside the modal that shows guess vs target).

// updates the score and round number
function updateScoreDisplay() {
    document.getElementById("scoreDisplay").innerText = `Score: ${playerScore} | Round: ${roundNumber}`;
}

// Custom modal function to show results after each round.
// Shows the distance, points earned, and a map with the guess and target locations.
// In multiplayer, it also handles the waiting logic for the opponent and transitions to the next
// round or endgame. Handles endgame messaging and shows final scores.
function showCustomModal(callback, coords = null, distance = 0, points = 0) {
    const modal = document.getElementById("resultModal"); // Get modal elements for displaying results
    const distEl = document.getElementById("modalDistance"); // Element to display distance between guess and target
    const pointsEl = document.getElementById("modalPoints"); // Element to display points earned for the round
    const scoreEl = document.getElementById("modalTotalScore"); // Element to display total score after the round

    // Set the distance, points, and total score in the modal
    // Append " km" to the numerical value for better UI clarity
    if (distEl) distEl.innerText = `${distance.toFixed(1)} km`;
    if (pointsEl) pointsEl.innerText = points;
    if (scoreEl) scoreEl.innerText = playerScore;
    modal.style.display = "flex";

    // If coordinates are provided, set up the modal map to show the guess and target locations
    if (coords) {
        // Initialize the modal map if it doesn't exist, or clear existing markers and lines if it does
        if (!modalMap) {
            modalMap = L.map('modalMap', { attributionControl: false, zoomControl: false }).setView([0, 0], 2);
            L.tileLayer('https://api.maptiler.com/maps/base-v4/{z}/{x}/{y}.png?key=S8NmHw1EUy7izVqZxg2O').addTo(modalMap);
        }
        // Clear previous markers and lines from the modal map
        modalMap.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.Polyline || l instanceof L.Popup) modalMap.removeLayer(l); });

        // Add markers for the target and guess locations on the modal map, using a custom icon for the target
        L.marker([coords.targetLat, coords.targetLng], { icon: targetIcon }).addTo(modalMap);
        L.marker([coords.guessLat, coords.guessLng]).addTo(modalMap);

        let line; // variable to hold the line connecting guess and target in precision mode

        // if precision add a line
        if (gameMode === "precision") {
            line = L.polyline([[coords.guessLat, coords.guessLng], [coords.targetLat, coords.targetLng]],
                { color: '#35f9ff', weight: 4, dashArray: '10, 10' }).addTo(modalMap);
        } else {
            // no line on country match
            line = L.polyline([[coords.guessLat, coords.guessLng], [coords.targetLat, coords.targetLng]],
                { color: 'transparent' }).addTo(modalMap);
        }

        // Fit the modal map view to show both the guess and target locations, with some padding
        // timeout is needed to ensure the map has rendered before trying to fit bounds, otherwise it can get stuck in a loop of resizing
        setTimeout(() => {
            modalMap.invalidateSize();
            // bound map to the line to get a clear view
            if (line) {
                modalMap.flyTo([coords.targetLat, coords.targetLng], 3, {
                    animate: true,
                    duration: 1.5 // seconds
                });
            }
        }, 300);
    }

    // set up modal button
    // if round 5 change text to "view final results" otherwise "next round"
    const btn = document.getElementById("modalBtn");
    btn.innerText = roundNumber >= 5 ? "VIEW FINAL RESULTS" : "NEXT ROUND";
    btn.onclick = () => {
        modal.style.display = "none";
        if (callback) callback();
    };
}