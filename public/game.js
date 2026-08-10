// game.js
// Core game flow: starting a round, checking the player's answer, scoring,
// revealing clues, and ending the game. This is the "orchestrator" - it
// calls into mapillary.js, geo.js, timer.js, map.js and ui.js rather than
// containing their implementation details itself.

// Main function to start a round by showing a random Mapillary location and setting up the clues
async function showRandomCountry() {

    clearRoundTimer();
    resetRoundMap();

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

            // Get the specific mapillary ID for the current round
            const currentRoundIndex = roomData.round - 1;
            targetMapillaryId = roomData.locations[currentRoundIndex];
            serverRoundStartedAt = roomData.round_started_at;
            console.log("Loading location:", targetMapillaryId);
            // if its single player we use SinglePlayerRandomLocation to get a list of 5 random mapillary ids
            // and use the singlePlayerLocationList to store the countries
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

        // initialize the viewer and move to the target location
        await initViewer();
        await viewer.moveTo(targetMapillaryId); // move to rather than remaking viewer to preserve cache and reduce load times

        // server-side proxy call to get the coordinates of the target location
        // (keeps the token out of this request entirely - server holds it)
        // mapData is used to store the target coordinates
        const mapillaryUrl = `/api/location-geometry?id=${targetMapillaryId}`;
        const mapRes = await fetch(mapillaryUrl);
        const mapData = await mapRes.json();

        // store the target coordinates in global state for later use in answer checking and modal map
        targetLongitude = mapData.computed_geometry.coordinates[0];
        targetLatitude = mapData.computed_geometry.coordinates[1];

        // Use reverse geocoding to get the country code and country name for the target location
        const geo = await reverseGeocodeCountry(targetLatitude, targetLongitude);
        MapillarycountryCode = geo.country_code;

        // Fetch additional country info via our own server (which holds the REST Countries
        // API key) to set up clues. This includes region, population, capital, and flag.
        // country info is stored in the RevealClue array which is used to reveal clues in order when the player clicks the "Reveal Clue" button
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

async function AnswerChecker() {
    // checks if player has made a guess by clicking on the map.
    // if not then an alert is shown asking to click a location
    if (!lastClicked) {
        alert("Please select a location on the map first!");
        return;
    }

    clearRoundTimer();

    // initialise variables for points and distance
    let pointsEarned = 0;
    let distance = 0;

    // calculate distance with haversine formula function
    // used for precision mode scoring
    distance = haversine(Number(lastClicked.lat), Number(lastClicked.lng), targetLatitude, targetLongitude);

    // precision mode scoring
    if (gameMode === "precision") {
        // Exponential Scoring with points capped at 5000
        // steep drop in points for first 2000 km
        // decreases slower after 2000km
        pointsEarned = Math.round(5000 * Math.exp(-distance / 2000));

    } else {
        // Country Match Scoring
        // points determined based on how many clues were used before getting right country
        // max 7 points if no clues were used
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

    // add score
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
        showCustomModal(null, coordsObj, distance, pointsEarned);

        // disable the modal button and change text to waiting for opponent
        // this is to ensure the player doesn't go on the next round before the opponent
        const modalBtn = document.getElementById("modalBtn");
        modalBtn.disabled = true;
        modalBtn.innerText = "WAITING FOR OPPONENT...";

        // submit the guess to the server with fetch to update the room file with the player's guess and score
        (async () => {
            try {
                await fetch(`submitGuess?code=${myRoomCode}&player=${myPlayerNum}&score=${pointsEarned}`);
                // wait interval to check if the opponent has submitted their guess
                // checks every 2 seconds if the room file has updated
                const waitInterval = setInterval(async () => {
                    const statusRes = await fetch(`checkStatus?code=${myRoomCode}`);
                    const roomData = await statusRes.json();

                    // if the room round number has increased it means the opponent has guessed
                    if (roomData.round > roundNumber) {
                        clearInterval(waitInterval);
                        // change round number to match the server
                        roundNumber = roomData.round;

                        // initialise countdown for the next round to allow the player to see the results before moving on
                        const modalBtn = document.getElementById("modalBtn");
                        let countdown = 5;
                        modalBtn.disabled = true;

                        // countdown interval to show the countdown on the modal button before transitioning to the next round
                        const countdownTimer = setInterval(() => {
                            modalBtn.innerText = `NEXT ROUND IN ${countdown}...`;
                            countdown--;

                            if (countdown < 0) {
                                // Once countdown is complete, clear the timer and transition to the next round
                                clearInterval(countdownTimer);
                                playTransitionSound();

                                document.getElementById("resultModal").style.display = "none";

                                // logic to check if its the end of the game or transition to the next round
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

// function for revealing next clue
function revealNext() {
    if (RevealClueIndex < RevealClue.length - 1) {
        RevealClueIndex++;
        document.getElementById("countryOutput").innerHTML = RevealClue.slice(0, RevealClueIndex + 1).join("");
    }
}

// end game function to show final results
// multiplayer shows who won based on score
// single player just shows final score
function endgame(roomData = null) {

    document.getElementById("resultModal").style.display = "none";

    const endgameModal = document.getElementById("endgameModal"); // Get endgame modal elements for displaying final results
    const titleEl = document.getElementById("endgameTitle"); // get element for title of endgame modal
    const scoreEl = document.getElementById("finalTotalScore"); // get element for final score display in endgame modal
    const msgEl = document.getElementById("endgameMessage"); // get element for endgame message display in endgame modal
    const oppSection = document.getElementById("opponentSection"); // get element for opponent score section in endgame modal
    const oppScoreEl = document.getElementById("opponentScore"); // get element for opponent score display in endgame modal

    let titleText = ""; // variable to hold the title text for the endgame modal
    let messageText = ""; // variable to hold the message text for the endgame modal

    // Handle Multiplayer Logic
    if (myRoomCode && myPlayerNum && roomData) {
        oppSection.style.display = "block";
        const myScore = roomData[`player${myPlayerNum}`].score; // get the player's score from the room data
        const oppNum = myPlayerNum === '1' ? '2' : '1'; // determine opponent player number. if player 1 then opponent is 2, if player 2 then opponent is 1
        const oppScore = roomData[`player${oppNum}`].score; // get opponent score from room data

        scoreEl.innerText = myScore; // set player's final score in the endgame modal
        oppScoreEl.innerText = oppScore; // set opponent's final score in the endgame modal

        // logic to determine the endgame message based on who won
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