// audio.js
// Sound effects - synthesized with the Web Audio API so there's no external
// audio file to load, host, or license.

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