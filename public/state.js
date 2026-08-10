// state.js
// All shared mutable state lives here, declared exactly once.
// Since these are plain <script> tags (no ES modules), every other file
// reads/writes these same variables directly - they must NOT be
// redeclared with let/const anywhere else, or the browser will throw
// "Identifier has already been declared".

// --- Mapillary / viewer state ---
let MAPILLARY_TOKEN = null;
let viewer = null; // Mapillary viewer instance

// --- Map / guessing state ---
let map = null; // Leaflet main map instance
let modalMap = null; // Leaflet map instance for the modal display of guess and target locations
let currentMarker = null; // Leaflet marker for the player's guess
let answerLine = null; // line connecting guess and target in precision mode on modal map
let lastClicked = null; // saves last clicked coordinates and country info for answer checking and modal display

// target icon for modal map - green marker for better visibility
const targetIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    iconSize: [25, 41], iconAnchor: [12, 41]
});

// --- Round / game state ---
let MapillarycountryCode = null; // ISO country code of the current Mapillary location, used for answer checking and clues
let countryName = null; // Country name for displaying in the modal and clues
let playerScore = 0; // Player's starting score, updated after each round
let roundNumber = 1; // game start round
let RevealClue = []; // array to hold clues
let RevealClueIndex = 0; // index to track which clue to reveal next
let singlePlayerLocationList = []; // list of mapillary ids for single player
let targetLatitude = null; // target coordinates for answer checking and modal display
let targetLongitude = null; // target coordinates for answer checking and modal display

const maxPoints = 5000;
const penaltyPerClue = 1000;

// --- Round timer state ---
const ROUND_TIME_SECONDS = 45;
let timeRemaining = ROUND_TIME_SECONDS;
let roundTimerInterval = null;
let roundAnchorTime = null; // server timestamp (ms) the current round started, or null in single player

// --- Audio state ---
let audioCtx = null;

// --- URL params: determine multiplayer room and game mode ---
const urlParams = new URLSearchParams(window.location.search);
const gameMode = urlParams.get('mode'); // "countrymatch" or "precisionpoint"
const myRoomCode = urlParams.get('room'); // room code if in multiplayer, null if single player
const myPlayerNum = urlParams.get('player'); // 1 or 2 if in multiplayer, null if single player