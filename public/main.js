// main.js
// Entry point - runs once the page loads and kicks off the game.
// Requires state.js, mapillary.js, audio.js, geo.js, timer.js, map.js,
// ui.js and game.js to already be loaded before this file (see index.html
// script order).

// Log the mode and room info for debugging
if (myRoomCode) {
    console.log("Playing in multiplayer room:", myRoomCode);
} else {
    console.log("Playing in single player mode!");
}

window.onload = async () => {
    initializeMap();
    await initViewer();
    updateScoreDisplay();
    showRandomCountry();
};