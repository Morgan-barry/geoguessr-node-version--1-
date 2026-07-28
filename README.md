World Quiz

A browser-based geography guessing game inspired by GeoGuessr, built as a COMP 390 project. Players are dropped into a real-world 360° street-level photo and have to figure out where in the world they are — either by guessing the exact spot on a map, or by narrowing down the country using a set of progressively revealed clues.

Game Modes
Precision Point — Guess the exact location on the map. Score is based on how close your guess is to the real spot (closer = more points, up to 5000 per round).
Country Match — Guess the correct country. You start with no clues; each clue you reveal (region, population, capital, flag) costs you points, so the fewer clues you need, the higher your score.

Both modes support:

Single player — play solo, 5 rounds per game.
Multiplayer (1v1) — host a room, share the 4-letter code with a friend, and compete over the same 5 rounds. Scores are tracked and compared at the end.

Every round also runs on a 45-second timer — if time runs out, whatever guess is currently placed on the map gets submitted automatically, or the round scores 0 if no guess was made at all.

Tech Stack

Backend

Node.js + Express — serves the frontend and handles all game logic via a small set of API routes (create/join rooms, check room status, submit guesses, fetch random locations).
SQLite via Node's built-in node:sqlite module — stores the pool of playable locations and live multiplayer room state (scores, round number, guessed flags). No native module compilation required, since node:sqlite ships with Node itself (v22.5+).

External APIs

Mapillary — provides the 360° street-level photos. The MapillaryJS Viewer SDK renders the interactive panorama in the browser, and the Graph API supplies each photo's real-world coordinates (fetched through a server-side proxy so the lookup token never reaches the client).
REST Countries (v5) — supplies country clue data (region, population, capital, flag) for Country Match mode, called through a server-side proxy to keep the API key off the client.

Frontend

Vanilla HTML/CSS/JavaScript — no framework, no build step.
Leaflet.js — powers the interactive maps used for placing guesses and for the post-round result recap (showing the guess vs. the actual location).
Sound effects are synthesized directly in the browser using the Web Audio API — no external audio files to host or license.

Hosting

Deployed on Render's free tier. Environment variables (MAPILLARY_TOKEN, REST_COUNTRIES_TOKEN) hold the API keys server-side and are never committed to source control
Known Limitations
The round timer runs independently on each player's device in multiplayer rather than being synchronized through the server, so timers may drift slightly between players (e.g. due to network lag). Both players' guesses are still scored and recorded correctly regardless.
Multiplayer currently supports exactly 2 players per room.