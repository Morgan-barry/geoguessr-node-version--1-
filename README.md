# GeoGuessr Clone — Node.js version

This is a Node/Express port of the original PHP backend. Same game logic,
same client-side files (`mainMenu.html`, `gameLayout.html`, `miner.html`,
`MainMenu.js`, `gameLogic.js`) — only the server changed.

## What changed from the PHP version

- `createRoom.php`, `joinRoom.php`, `checkStatus.php`, `submitGuess.php`,
  `SinglePlayerRandomLocation.php` → now routes inside `server.js`
  (`/createRoom`, `/joinRoom`, `/checkStatus`, `/submitGuess`,
  `/SinglePlayerRandomLocation`).
- Room state used to live in `room_XXXX.json` files. It's now a `rooms`
  table inside `geoguessr.db` (the same SQLite file your locations already
  live in), created automatically the first time the server starts.
- Uses Node's **built-in** `node:sqlite` module — no native compiling, no
  extra install step for the database driver.

## Before you run it

You need a `geoguessr.db` SQLite file in the project root with a
`locations` table containing a `mapillary_id` column, exactly like the PHP
version needed. It is **not** included here — copy your existing one over,
or recreate it with your location data.

## Running locally

```bash
npm install
npm start
```

Requires **Node.js 22.5 or newer** (for `node:sqlite`). Check with `node -v`.
If your host only offers an older Node version, let me know and I'll swap
the database layer to `better-sqlite3` instead (a package install, same
API, works on Node 18+).

Once running, open `http://localhost:3000/mainMenu.html`.

## Deploying for free

Because this no longer needs PHP, you have more free-hosting options than
before. A few solid ones:

- **Render** (free web service) — connect your GitHub repo, set the start
  command to `npm start`, done. Free tier spins the app down after
  inactivity and spins back up on the next request (a few seconds delay),
  and the disk is ephemeral — fine for a class demo, just know a restart
  clears the `rooms` table (your `locations` table would need to be
  re-seeded too unless you commit `geoguessr.db` to the repo).
- **Fly.io** — free allowance, supports a small persistent volume if you
  want room/location data to actually survive restarts.
- **Cyclic / Glitch** — also Node-friendly, good for quick demos.

Whichever you pick, the steps are basically: push this folder to GitHub,
connect the repo, set the start command to `npm start`, and make sure
`geoguessr.db` is either committed to the repo or uploaded separately.

Want me to walk through one of these end-to-end?
