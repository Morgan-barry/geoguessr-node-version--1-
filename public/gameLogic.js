// Global Variables
//api token - fetched from the server at runtime instead of hardcoded here,
//so it's not committed to source control. Server reads it from an
//environment variable (see server.js /api/mapillary-config route).
let MAPILLARY_TOKEN = null;

async function loadMapillaryToken() {
    if (MAPILLARY_TOKEN) return MAPILLARY_TOKEN;
    const res = await fetch('/api/mapillary-config');
    const data = await res.json();
    MAPILLARY_TOKEN = data.token;
    return MAPILLARY_TOKEN;
}

//target icon for modal map
const targetIcon = L.icon({ 
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',//using a green marker icon from an open source repository for better visibility on the modal map
            iconSize: [25, 41], iconAnchor: [12, 41] 
        });


let viewer = null; // Mapillary viewer instance
let currentMarker = null;  // Leaflet marker for the player's guess
let lastClicked = null;  //saves last clicked coordinates and country info for answer checking and modal display
let MapillarycountryCode = null;  // ISO country code of the current Mapillary location, used for answer checking and clues
let countryName = null; // Country name for displaying in the modal and clues
let playerScore = 0; // Player's starting score, updated after each round
let roundNumber = 1; //game start round
let RevealClue = []; //array to hold clues
let RevealClueIndex = 0; //index to track which clue to reveal next
let singlePlayerLocationList = []; //list of mapillary ids for single player 
let targetLatitude = null; //target coordinates for answer checking and modal display
let targetLongitude = null; //target coordinates for answer checking and modal display
let answerLine = null; //line connecting guess and target in precision mode on modal map
let map = null; // Leaflet map instance
let modalMap = null; // Leaflet map instance for the modal display of guess and target locations
const maxPoints = 5000;
const penaltyPerClue = 1000;



//url parameters to determine if player is in multiplayer room and which mode they are playing
const urlParams = new URLSearchParams(window.location.search);
const gameMode = urlParams.get('mode'); // "countrymatch" or "precisionpoint"
const myRoomCode = urlParams.get('room'); //room code if in multiplayer, null if single player
const myPlayerNum = urlParams.get('player'); // 1 or 2 if in multiplayer, null if single player




// Log the mode and room info for debugging
if (myRoomCode) {
    console.log("Playing in multiplayer room:", myRoomCode);
} else {
    console.log("Playing in single player mode!");
}

//function to initalise mapillary viewer 
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




// Haversine formula to calculate distance between two lat/lng points in kilometers
//Used for precision mode to calculate the score
function haversine(lat1,lon1,lat2,lon2){
    let latDistance = (lat2-lat1) * Math.PI / 180;
    let lonDistance = (lon2-lon1) * Math.PI / 180;
    lat1 = lat1 * Math.PI / 180;
    lat2 = lat2 * Math.PI / 180;
    let a = Math.pow(Math.sin(latDistance/2), 2) + Math.pow(Math.sin(lonDistance/2), 2) * Math.cos(lat1) * Math.cos(lat2);
    let c = 2 * Math.asin(Math.sqrt(a));
    let Rad = 6371; // Radius of earth in kilometers
    return Rad * c;
}

// Sound effects - synthesized with the Web Audio API so there's no external
// audio file to load, host, or license.
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function playTone(freq, duration, type = 'sine', delay = 0) {
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = type;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const startTime = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.15, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.05);
    } catch (err) {
        console.warn('Audio playback unavailable:', err.message);
    }
}

function playSoundForResult(pointsEarned) {
    if (pointsEarned > 0) {
        playTone(660, 0.12);
        playTone(990, 0.18, 'sine', 0.1);
    } else {
        playTone(220, 0.3, 'sawtooth');
    }
}

function playTransitionSound() {
    playTone(500, 0.08);
    playTone(700, 0.12, 'sine', 0.08);
}

function playTickSound() {
    playTone(880, 0.06);
}





//updates the score and round number 
function updateScoreDisplay() {
    document.getElementById("scoreDisplay").innerText = `Score: ${playerScore} | Round: ${roundNumber}`;
}

// Round timer - client-side only, not synced between players in multiplayer.
// If time runs out: submits whatever guess is already placed on the map,
// or scores 0 for the round if no guess was made at all.
// Round timer - in single player this just counts down locally. In
// multiplayer, it's anchored to round_started_at (a timestamp the server
// stamps every time a round begins), so both players' timers stay in sync
// with each other and with the server's own understanding of the round,
// instead of each player just running their own independent 45s countdown.
const ROUND_TIME_SECONDS = 45;
let timeRemaining = ROUND_TIME_SECONDS;
let roundTimerInterval = null;
let roundAnchorTime = null; // server timestamp (ms) the current round started, or null in single player

function clearRoundTimer() {
    if (roundTimerInterval) {
        clearInterval(roundTimerInterval);
        roundTimerInterval = null;
    }
}

function updateTimerDisplay() {
    const el = document.getElementById("timerDisplay");
    if (!el) return;
    el.innerText = `⏱ ${timeRemaining}s`;
    el.style.color = timeRemaining <= 10 ? "#ff5050" : "#50ff6d";
}

function computeTimeRemaining() {
    if (roundAnchorTime) {
        const elapsedSeconds = Math.floor((Date.now() - roundAnchorTime) / 1000);
        return Math.max(0, ROUND_TIME_SECONDS - elapsedSeconds);
    }
    return Math.max(0, timeRemaining - 1);
}

function startRoundTimer(serverStartTimestamp = null) {
    clearRoundTimer();
    roundAnchorTime = serverStartTimestamp || null;
    timeRemaining = roundAnchorTime ? computeTimeRemaining() : ROUND_TIME_SECONDS;
    updateTimerDisplay();

    // If a laggy join means most of the round is already gone, just let it play out -
    // don't instantly force a timeout, since handleTimeUp already handles the 0 case cleanly.
    roundTimerInterval = setInterval(() => {
        timeRemaining = computeTimeRemaining();
        updateTimerDisplay();
        if (timeRemaining > 0 && timeRemaining <= 3) {
            playTickSound();
        }
        if (timeRemaining <= 0) {
            clearRoundTimer();
            handleTimeUp();
        }
    }, 1000);
}

function handleTimeUp() {
    if (lastClicked) {
        // Player had already clicked a spot on the map but never pressed GUESS - submit it for them.
        AnswerChecker();
    } else {
        // No guess was made at all this round.
        finishRound(0, 0, null);
    }
}







//Nominatim reverse geocode function to get the country and country code
//country code is used for checking the answer and revealing clues
//country is for displaying the country name
async function reverseGeocodeCountry(lat, lon) {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1`);
    const data = await res.json();
    // If no address or country information is found, return null values
    
    if (!data ) {
        return { country: null, country_code: null };
    }

   // Return the country and iso country code  
   //the return is in an object format with properties country and country_code for easy access in other functions
    return {
        country: data.address.country,
        country_code: data.address.country_code
    };
}










// Main function to start a round by showing a random Mapillary location and setting up the clues
async function showRandomCountry() {

    clearRoundTimer();

    // Clean up previous round answer line
    if (answerLine) {
            map.removeLayer(answerLine);
            answerLine = null;
        }

    //clean up previous round marker and last clicked data
    lastClicked = null;

     if (currentMarker) {
            map.removeLayer(currentMarker);
            currentMarker = null;
        }

    

    // Get the next Mapillary location based on game mode and round number
    const output = document.getElementById("countryOutput");
    let targetMapillaryId;
    let serverRoundStartedAt = null; // only set in multiplayer - used to sync the round timer between players

    try {
        // if statement to see if its multiplayer
        if (typeof myRoomCode !== 'undefined' && myRoomCode) {
            // Multiplayer
            const MultiplayerResponse = await fetch(`checkStatus?code=${myRoomCode}`);
            const roomData = await MultiplayerResponse.json();
            
            // Get the specific mapillary ID for the curreent round
            const currentRoundIndex = roomData.round - 1;
            targetMapillaryId = roomData.locations[currentRoundIndex];
            serverRoundStartedAt = roomData.round_started_at;
            console.log("Loading location:", targetMapillaryId);
            //if its single player we use singleplayerlocationphp to get a list of 5 random mapillary ids
            // and use the singleplayerlocationlist to store the countries
        } else {
            if (singlePlayerLocationList.length === 0) {
            const response = await fetch('SinglePlayerRandomLocation');
            const data = await response.json();
            singlePlayerLocationList = data.locations;
        }
        
        // single player just uses the next location in the list based on the round number
        targetMapillaryId = singlePlayerLocationList[roundNumber - 1];
        console.log("Single Player Round:", roundNumber, "ID:", targetMapillaryId);
    }

        //initalize the viewer and move to the target location
        
        await initViewer();
        await viewer.moveTo(targetMapillaryId); //move to rather than remaking viewer to preserve cache and reduce load times



        //server-side proxy call to get the coordinates of the target location
        //(keeps the token out of this request entirely - server holds it)
        //mapData is used to store the tarhet coordniates 
        const mapillaryUrl = `/api/location-geometry?id=${targetMapillaryId}`;
        const mapRes = await fetch(mapillaryUrl);
        const mapData = await mapRes.json();
        
        //store the target coordinates in global variables for later use in answer checking and modal map
        targetLongitude = mapData.computed_geometry.coordinates[0];
        targetLatitude = mapData.computed_geometry.coordinates[1];



        // Use reverse geocoding to get the country code and country name for the target location
        const geo = await reverseGeocodeCountry(targetLatitude, targetLongitude);
        MapillarycountryCode = geo.country_code;


        // Fetch additional country info via our own server (which holds the REST Countries
        // API key) to set up clues. This includes region, population, capital, and flag.
        //country info is stored in the RevealClue array which is used to reveal clues in order when the player clicks the "Reveal Clue" button
        const restUrl = `/api/country-info?code=${MapillarycountryCode}`;
        const restRes = await fetch(restUrl);
        const countryInfo = await restRes.json();
        console.log(countryInfo);
        countryName = countryInfo.names.common;

        // Set up the clues in the order they will be revealed. We store them in an array and use RevealClueIndex to track which clue to show next.
        RevealClue = [
            `<h3>Clue 1: Region</h3><p>${countryInfo.region}</p>`,
            `<h3>Clue 2: Population</h3><p>${Number(countryInfo.population).toLocaleString()}</p>`,
            `<h3>Clue 3: Capital</h3><p>${countryInfo.capitals?.[0]?.name}</p>`,
            `<h3>Clue 4: Flag</h3><img src="${countryInfo.flag.url_svg}" width="120" style="border: 1px solid #ccc;">`,
        ];
        
        


        
        RevealClueIndex = -1;
        output.innerHTML = "<strong>Round Started!</strong>";
        startRoundTimer(serverRoundStartedAt);
    
    } catch (error) {
        console.error("Error setting up the round:", error);
        showRandomCountry(); // Try again with a different location if there's an error
    }
}

// Custom modal function to show results after each round.
//Shows the distance, points earned, and a map with the guess and target locations.
//In multiplayer, it also handles the waiting logic for the opponent and transitions to the next round or endgame.
//handles endgame messaging and shows final scores 
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
            L.tileLayer('https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=S8NmHw1EUy7izVqZxg2O').addTo(modalMap);
        }
        // Clear previous markers and lines from the modal map
        modalMap.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.Polyline || l instanceof L.Popup) modalMap.removeLayer(l); });

        // Add popup for the target location with the country name and a popup for the player's guess with the guessed country name
        //L.popup().setLatLng([coords.targetLat, coords.targetLng]).addTo(modalMap);
        //L.popup().setLatfLng([coords.guessLat, coords.guessLng]).addTo(modalMap);

        //add markers for the target and guess locations on the modal map, using a custom icon for the target
        L.marker([coords.targetLat, coords.targetLng], {icon: targetIcon}).addTo(modalMap);
        L.marker([coords.guessLat, coords.guessLng]).addTo(modalMap);

        let line; // variable to hold the line connecting guess and target in precision mode

        //if precision add a line 
        if (gameMode === "precision") {
            
            line = L.polyline([[coords.guessLat, coords.guessLng], [coords.targetLat, coords.targetLng]], 
                {color: '#35f9ff', weight: 4, dashArray: '10, 10'}).addTo(modalMap);
        } else {
            // no line on country match
            line = L.polyline([[coords.guessLat, coords.guessLng], [coords.targetLat, coords.targetLng]], 
                {color: 'transparent'}).addTo(modalMap);
        }

        // Fit the modal map view to show both the guess and target locations, with some padding
        //timeout is needed to ensure the map has rendered before trying to fit bounds, otherwise it can get stuck in a loop of resizing
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

    // set up model button
    //if round 5 change text to "view final results" otherwise "next round"
    
    const btn = document.getElementById("modalBtn");
    btn.innerText = roundNumber >= 5 ? "VIEW FINAL RESULTS" : "NEXT ROUND";
    btn.onclick = () => {
        modal.style.display = "none";
        if (callback) callback();
    };
}

async function AnswerChecker() {
    // checks if player has made a guess by clicking on the map.
    //if not then an alert is shown asking to click a location 
    if (!lastClicked) {
        alert("Please select a location on the map first!");
        return;
    }

    clearRoundTimer();

    // initalise variables for points, distance, and result messaging. 
    let pointsEarned = 0;
    let distance = 0;
    

    // calculate distance with haversine formula function
    //used for precision mode scoring
    distance = haversine(Number(lastClicked.lat), Number(lastClicked.lng), targetLatitude, targetLongitude);

    //precision mode scoring
    if(gameMode === "precision") {
        // Exponential Scoring with points capped at 5000
        //steep drop in points for first 2000 km
        //decreases slower after 2000km
        pointsEarned = Math.round(5000 * Math.exp(-distance / 2000)); 
        


    } else {
        // Country Match Scoring
    
        //points determined based on how many clues were used before getting right country
        //max 7 points if no clues were used
       if (lastClicked.country_code === MapillarycountryCode) { 
            // If correct, subtract 1000 points for every clue opened
            pointsEarned = maxPoints - (RevealClueIndex * penaltyPerClue);
        } else {
            pointsEarned = 0;
        }
        
       
    }    

    // Prepare coordinates for the modal map
    const coordsObj = {
        guessLat: Number(lastClicked.lat),
        guessLng: Number(lastClicked.lng),
        targetLat: targetLatitude,
        targetLng: targetLongitude
    };

    finishRound(pointsEarned, distance, coordsObj);
}

// Shared tail-end of a round: scores it, plays the result sound, shows the
// modal, and handles the single-player/multiplayer transition to the next
// round. Used both by a manual guess (AnswerChecker) and by the round timer
// running out (handleTimeUp).
function finishRound(pointsEarned, distance, coordsObj) {
    playSoundForResult(pointsEarned);

    //add score 
    playerScore += pointsEarned;

    // Transition to the next round or endgame functions
    const Transition = () => {
        playTransitionSound();
        roundNumber += 1;
        if (roundNumber > 5) {
            endgame();
        } else {
            updateScoreDisplay();
            showRandomCountry(); 
        }
    };



    // multiplayer logic flow
    if (myRoomCode && myPlayerNum) {
        // show custom modal with results and map of guess and target locations
        showCustomModal( null, coordsObj, distance, pointsEarned);
        
        // disable the modal button and change text to waiting for opponent
        //this is to ensure the player doesnt go on the next round before the opponent
        const modalBtn = document.getElementById("modalBtn");
        modalBtn.disabled = true;
        modalBtn.innerText = "WAITING FOR OPPONENT...";

        //submit the guess to the server with fetch to update the room file with the player's guess and score
        (async () => {
        try {
            await fetch(`submitGuess?code=${myRoomCode}&player=${myPlayerNum}&score=${pointsEarned}`);
            //wait interval to check if the opponent has submitted their guess
            //checks every 2 seconds if the room file has updated
            const waitInterval = setInterval(async () => {
            const statusRes = await fetch(`checkStatus?code=${myRoomCode}`);
            const roomData = await statusRes.json();
            
            //if the room round number has increased it means the opponent has guessed
            if (roomData.round > roundNumber) {
                clearInterval(waitInterval);
                //change round number to match the server
                roundNumber = roomData.round;

                //initalise countdown for the next round to allow the player to see the results before moving on
                const modalBtn = document.getElementById("modalBtn");
                let countdown = 5;
                modalBtn.disabled = true; 
                
                //countdown interval to show the countdown on the modal button before transitioning to the next round
                const countdownTimer = setInterval(() => {
                    modalBtn.innerText = `NEXT ROUND IN ${countdown}...`;
                    countdown--;

                    if (countdown < 0) {
                        // Once countdown is complete, clear the timer and transition to the next round
                        clearInterval(countdownTimer);
                        playTransitionSound();
                        
                    
                        document.getElementById("resultModal").style.display = "none";
                        
                        //logic to check if its the end of the game or transition to the next round
                        if (roundNumber > 5) {
                            endgame(roomData);
                        } else {
                            updateScoreDisplay();
                            showRandomCountry(); 
                        }
                    }
                }, 1000); // Countdown updates every second
            }
        }, 2000); // Check every 2 seconds if opponent has guessed and round number has increased
        } catch (err) { console.error(err); }
        })();

    } else {
        // single player modal flow 
        showCustomModal(Transition, coordsObj, distance, pointsEarned);
    }
}

//function for revealing next clue
function revealNext() {
    if (RevealClueIndex < RevealClue.length - 1) {
        RevealClueIndex++;
        document.getElementById("countryOutput").innerHTML = RevealClue.slice(0, RevealClueIndex + 1).join("");
    }
}

//end game function to show final results
//multiplayer shows who won based on score
//single player just shows final score
function endgame(roomData = null) {
    
    document.getElementById("resultModal").style.display = "none";
    
    const endgameModal = document.getElementById("endgameModal"); // Get endgame modal elements for displaying final results
    const titleEl = document.getElementById("endgameTitle"); //get element for title of endgame modal
    const scoreEl = document.getElementById("finalTotalScore"); //get element for final score display in endgame modal
    const msgEl = document.getElementById("endgameMessage"); //get element for endgame message display in endgame modal
    const oppSection = document.getElementById("opponentSection"); //get element for opponent score section in endgame modal
    const oppScoreEl = document.getElementById("opponentScore"); //get element for opponent score display in endgame modal

    let titleText = ""; //variable to hold the title text for the endgame modal
    let messageText = ""; //variable to hold the message text for the endgame modal

    // Handle Multiplayer Logic
    if (myRoomCode && myPlayerNum && roomData) {
        oppSection.style.display = "block"; 
        const myScore = roomData[`player${myPlayerNum}`].score; //get the player's score from the room data
        const oppNum = myPlayerNum === '1' ? '2' : '1'; //determine opponent player number. if player 1 then opponent is 2, if player 2 then opponent is 1
        const oppScore = roomData[`player${oppNum}`].score; //get opponent score from room data

        scoreEl.innerText = myScore; //set player's final score in the endgame modal
        oppScoreEl.innerText = oppScore; //set opponent's final score in the endgame modal

        //logic to determine the endgame message based on who won
        if (myScore > oppScore) {
            titleText = "WINNER ";
            messageText = "Impressive";
        } else if (myScore < oppScore) {
            titleText = "LOSER ";
            messageText = "Better luck next time";
        } else {
            titleText = "IT'S A TIE!";
            messageText = "Rematch to find out who really knows their geography";
        }
    } 
    
    // Single Player Logic
    else {
        oppSection.style.display = "none";
        scoreEl.innerText = playerScore;
        titleText = "GAME COMPLETE";
        messageText = `Well played!`;
    }

    // Set the title and message in the endgame modal and display it
    titleEl.innerText = titleText;
    msgEl.innerHTML = messageText;
    endgameModal.style.display = "flex";
}


//map intialisation function from leaflet documentation
//sets up the map and click event to place marker and store guess coordinates
function initializeMap() {
    if (typeof L === 'undefined' || !document.getElementById('map')) return;
    
    map = L.map('map').setView([0, 0], 1);

    L.tileLayer('https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=S8NmHw1EUy7izVqZxg2O', {
        attribution: '&copy; MapTiler &copy; OpenStreetMap'
    }).addTo(map);

    map.on('click', async function(e) {
        const lat = e.latlng.lat.toFixed(4);
        const lng = e.latlng.lng.toFixed(4);

        if (currentMarker) map.removeLayer(currentMarker);
        
        currentMarker = L.marker(e.latlng).addTo(map);
       
        const geo = await reverseGeocodeCountry(lat, lng);

        //lastClicked object to store the details of the player's guess, including the coordinates and country information. 
        lastClicked = {
            lat, lng,
            country: geo.country,
            country_code: geo.country_code
        };

        map.panTo(e.latlng);
        console.log("Last Clicked Country:", lastClicked.country + " (" + lastClicked.country_code + ")");
    });
}

window.onload = async () => {
    initializeMap();
    await initViewer();
    updateScoreDisplay();
    showRandomCountry(); 

};