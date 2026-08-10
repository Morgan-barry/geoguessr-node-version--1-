// map.js
// Main guessing map (Leaflet) - initialization, click handling, and reset between rounds.

function resetRoundMap() {
    if (!map) return;

    if (currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
    }

    if (answerLine && map.hasLayer(answerLine)) {
        map.removeLayer(answerLine);
        answerLine = null;
    }

    lastClicked = null;
    map.closePopup();
    map.setView([0, 0], 1);
    map.invalidateSize();
}

// map initialisation function from leaflet documentation
// sets up the map and click event to place marker and store guess coordinates
function initializeMap() {
    if (typeof L === 'undefined' || !document.getElementById('map')) return;

    map = L.map('map').setView([0, 0], 1);

    L.tileLayer('https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=S8NmHw1EUy7izVqZxg2O', {
        attribution: '&copy; MapTiler &copy; OpenStreetMap'
    }).addTo(map);

    map.on('click', async function (e) {
        const lat = e.latlng.lat.toFixed(4);
        const lng = e.latlng.lng.toFixed(4);

        if (currentMarker) map.removeLayer(currentMarker);

        currentMarker = L.marker(e.latlng).addTo(map);

        const geo = await reverseGeocodeCountry(lat, lng);

        // lastClicked object stores the details of the player's guess, including coordinates and country info.
        lastClicked = {
            lat, lng,
            country: geo.country,
            country_code: geo.country_code
        };

        map.panTo(e.latlng);
        console.log("Last Clicked Country:", lastClicked.country + " (" + lastClicked.country_code + ")");
    });
}