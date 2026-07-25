// server.js
// Node/Express replacement for the original PHP backend.
// Same game logic as createRoom.php, joinRoom.php, checkStatus.php,
// submitGuess.php, and SinglePlayerRandomLocation.php — just running on Node
// instead of PHP, with room state kept in geoguessr.db (SQLite) instead of
// loose room_XXXX.json files.

const path = require('path');
const express = require('express');
const { DatabaseSync } = require('node:sqlite'); // built-in, no native build step needed (Node 22+)

const app = express();
const PORT = process.env.PORT || 3000;

// geoguessr.db must exist in the project root and contain a `locations`
// table with a `mapillary_id` column (same as the original PHP version).
const db = new DatabaseSync(path.join(__dirname, 'geoguessr.db'));

// Create the rooms table if it doesn't exist yet (rooms used to be JSON files;
// now they're rows in the same SQLite file as your locations).
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    room_code TEXT PRIMARY KEY,
    round INTEGER NOT NULL DEFAULT 1,
    locations TEXT NOT NULL,
    player1_score INTEGER NOT NULL DEFAULT 0,
    player1_guessed INTEGER NOT NULL DEFAULT 0,
    player2_score INTEGER NOT NULL DEFAULT 0,
    player2_guessed INTEGER NOT NULL DEFAULT 0,
    player2_joined INTEGER NOT NULL DEFAULT 0
  )
`);

// Serve the static frontend (html/js) from /public
app.use(express.static(path.join(__dirname, 'public')));

// ---- helpers -------------------------------------------------------------

function getRandomLocations(count) {
  const stmt = db.prepare('SELECT mapillary_id FROM locations ORDER BY RANDOM() LIMIT ?');
  return stmt.all(count).map(row => row.mapillary_id);
}

function roomToJson(row) {
  return {
    room_code: row.room_code,
    round: row.round,
    locations: JSON.parse(row.locations),
    player1: { score: row.player1_score, guessed: !!row.player1_guessed },
    player2: { score: row.player2_score, guessed: !!row.player2_guessed },
    player2_joined: !!row.player2_joined
  };
}

function generateRoomCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}

// ---- routes (mirrors the original PHP endpoints) --------------------------

// was createRoom.php
app.get('/createRoom', (req, res) => {
  try {
    const roomCode = generateRoomCode();
    const locations = getRandomLocations(5);

    if (locations.length < 5) {
      return res.json({ success: false, error: 'Problem fetching locations from the database. (need at least 5)' });
    }

    db.prepare(`
      INSERT INTO rooms (room_code, round, locations, player1_score, player1_guessed, player2_score, player2_guessed, player2_joined)
      VALUES (?, 1, ?, 0, 0, 0, 0, 0)
    `).run(roomCode, JSON.stringify(locations));

    res.json({ success: true, room_code: roomCode });
  } catch (err) {
    res.json({ success: false, error: 'Database error: ' + err.message });
  }
});

// was joinRoom.php
app.get('/joinRoom', (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.json({ success: false, error: 'No code' });
  }

  const roomCode = String(code).trim().toUpperCase();
  const row = db.prepare('SELECT * FROM rooms WHERE room_code = ?').get(roomCode);

  if (!row) {
    return res.json({ success: false, error: 'Room not found' });
  }

  db.prepare('UPDATE rooms SET player2_joined = 1 WHERE room_code = ?').run(roomCode);
  res.json({ success: true, room_code: roomCode });
});

// was checkStatus.php
app.get('/checkStatus', (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.json({ error: 'No room code provided' });
  }

  const roomCode = String(code).trim().toUpperCase();
  const row = db.prepare('SELECT * FROM rooms WHERE room_code = ?').get(roomCode);

  if (!row) {
    return res.json({ error: 'Room not found' });
  }

  res.json(roomToJson(row));
});

// was submitGuess.php
app.get('/submitGuess', (req, res) => {
  const roomCode = String(req.query.code || '').toUpperCase();
  const playerNum = req.query.player; // "1" or "2"
  const score = parseInt(req.query.score, 10) || 0;
  const playerCol = `player${playerNum}`;

  const row = db.prepare('SELECT * FROM rooms WHERE room_code = ?').get(roomCode);
  if (!row) {
    return res.json({ success: false, error: 'Room not found.' });
  }

  const newScore = row[`${playerCol}_score`] + score;
  db.prepare(`UPDATE rooms SET ${playerCol}_score = ?, ${playerCol}_guessed = 1 WHERE room_code = ?`)
    .run(newScore, roomCode);

  // re-read to check both-guessed condition
  const updated = db.prepare('SELECT * FROM rooms WHERE room_code = ?').get(roomCode);
  let round = updated.round;

  if (updated.player1_guessed && updated.player2_guessed) {
    round += 1;
    db.prepare('UPDATE rooms SET round = ?, player1_guessed = 0, player2_guessed = 0 WHERE room_code = ?')
      .run(round, roomCode);
  }

  res.json({ success: true, current_round: round });
});

// was SinglePlayerRandomLocation.php
app.get('/SinglePlayerRandomLocation', (req, res) => {
  try {
    const locations = getRandomLocations(5);
    if (locations.length >= 5) {
      res.json({ success: true, locations });
    } else {
      res.json({ success: false, error: 'Not enough locations in database.' });
    }
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Server-side proxy for the computed_geometry lookup — the token used here
// never gets sent to the browser, unlike the Viewer's token below.
app.get('/api/location-geometry', async (req, res) => {
  const imageId = req.query.id;
  if (!imageId) {
    return res.status(400).json({ error: 'Missing id' });
  }

  try {
    const url = `https://graph.mapillary.com/${imageId}?access_token=${process.env.MAPILLARY_TOKEN}&fields=computed_geometry`;
    const mapRes = await fetch(url);
    const mapData = await mapRes.json();
    res.json(mapData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// The MapillaryJS Viewer component needs its token in the browser by design
// (same model as a Mapbox public token) — this just hands it out from the
// server's environment variable so it's never hardcoded/committed in a file.
app.get('/api/mapillary-config', (req, res) => {
  res.json({ token: process.env.MAPILLARY_TOKEN || '' });
});

// Server-side proxy for REST Countries — keeps REST_COUNTRIES_TOKEN off the client.
app.get('/api/country-info', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).json({ error: 'Missing code' });
  }

  try {
    const fields = 'names.common,region,population,capitals,flag.url_svg';
    const url = `https://api.restcountries.com/countries/v5/codes.alpha_2/${code}?response_fields=${fields}`;
    const restRes = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.REST_COUNTRIES_TOKEN}` }
    });
    const restData = await restRes.json();

    if (restData.errors) {
      return res.status(restRes.status).json({ error: restData.errors[0]?.message || 'REST Countries error' });
    }

    const country = restData.data.objects[0];
    res.json(country);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});