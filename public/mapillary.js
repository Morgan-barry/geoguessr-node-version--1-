// mapillary.js
// Handles Mapillary street-level viewer setup.

// api token - fetched from the server at runtime instead of hardcoded here,
// so it's not committed to source control. Server reads it from an
// environment variable (see server.js /api/mapillary-config route).
async function loadMapillaryToken() {
    if (MAPILLARY_TOKEN) return MAPILLARY_TOKEN;
    const res = await fetch('/api/mapillary-config');
    const data = await res.json();
    MAPILLARY_TOKEN = data.token;
    return MAPILLARY_TOKEN;
}

// initialise mapillary viewer
async function initViewer() {
    if (viewer) return; // Already exists, do nothing

    await loadMapillaryToken();

    const { Viewer } = mapillary;
    viewer = new Viewer({
        accessToken: MAPILLARY_TOKEN,
        container: 'mly',
        component: {
            cover: false,
            direction: true,
            sequence: false,
            tag: false,
            popups: false,
            cache: false,
        }
    });
    window.addEventListener('resize', () => viewer.resize()); // handles window resizing to keep viewer full size
}