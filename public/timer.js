// timer.js
// Round timer - client-side only, not synced between players in multiplayer.
// If time runs out: submits whatever guess is already placed on the map,
// or scores 0 for the round if no guess was made at all.
//
// In single player this just counts down locally. In multiplayer, it's
// anchored to round_started_at (a timestamp the server stamps every time a
// round begins), so both players' timers stay in sync with each other and
// with the server's own understanding of the round, instead of each player
// just running their own independent 45s countdown.

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