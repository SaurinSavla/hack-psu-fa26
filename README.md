# 🎨 Sculpt & Spin

**Paint in thin air with your phone. Everyone else races to guess it, while it spins into view.**

A 3D Pictionary party game for 4–12 players. No app install: phones join from the browser by scanning a QR code.

| Requirement | How Sculpt & Spin uses it |
|---|---|
| **Phone motion** | The drawer's phone *is* the brush. Sweeping it paints in 3D, twisting the wrist pushes ink nearer or farther. Guessers **shake** to unlock each guess and **flick** their phone to throw sabotage power-ups. |
| **Rivalry** | The first correct guess ends the turn, and faster guesses score more. Sabotage rivals with fog, flip, dizzy and freeze power-ups. Live scoreboard, podium, and take-home GIFs of every sculpture. |
| **Group play** | Built for 4+ people (works from 2, up to 12). Everyone takes a turn sculpting each round. |

---

## Quick start (localhost)

You need **Node.js 18+**, and the phones must be on the **same Wi-Fi** as your laptop.

```bash
npm install
npm start
```

The terminal prints two addresses:

```
Big screen (this laptop):  http://localhost:3000/host
Phones (same Wi-Fi):       https://192.168.x.x:3443
```

1. Open **http://localhost:3000/host** on the laptop (put it on a TV or projector if you have one). You'll see the title menu: **Start game**, **How to play** and **Settings** (rounds, time, word packs, custom words, power-ups, sound).
2. Press **Start game** to open a room, then players **scan the QR code** on screen.
3. The first time, each phone shows a certificate warning, because the server uses a self-signed HTTPS certificate. Tap **Advanced → Proceed** (Chrome) or **Show Details → visit this website** (Safari). Phones only expose motion sensors over HTTPS, which is why the warning appears.
4. Tap **Join game**. On iPhone, tap **Allow** when asked for Motion & Orientation access.
5. Every phone shows who has joined. The **first player to join is the party leader 👑**: from their phone they can change rounds, time, word packs and power-ups, remove players (✕), and start the game. On the TV, hover a player card and click **✕** to remove someone, then press **Start game**.
6. During a game, **☰ Menu** (or **Esc**) pauses everything and lets you **Resume**, **Restart game**, go **Back to lobby** or **Quit to main menu**. Shortcuts: **P** pause, **N** skip turn, **F** fullscreen, **M** mute.

### 🤖 Gemini AI rival + 🎙️ ElevenLabs announcer (optional)

1. Copy `.env.example` to a new file called `.env` (same folder as `server.js`).
2. Paste your keys:
   - `GEMINI_API_KEY`: free at [Google AI Studio](https://aistudio.google.com/apikey)
   - `ELEVENLABS_API_KEY`: from your [ElevenLabs settings](https://elevenlabs.io/app/settings/api-keys)
3. Run `npm run check-ai`. It tests both keys and saves `check-voice.mp3` so you can hear the announcer.
4. `npm start`. The terminal shows whether each AI feature is on.

**What they do:**
- **Gemini 🤖 joins every game as a player.** At 35%, 55% and 75% of each turn, the TV sends Gemini a snapshot of exactly what everyone is looking at, plus the word pattern. Gemini guesses (with a cheeky one-liner) and **if it's right it wins the turn**, scoring like a player (the sculptor still gets half). Players can throw power-ups at Gemini to blind it. At each reveal, Gemini reviews the sculpture like an art critic and scores it out of 10; the review also appears on the podium gallery.
- **The ElevenLabs announcer** voices the big moments on the TV: welcome, "you're up", the 3-2-1 countdown, correct guesses, Gemini's guesses and reviews, sabotage, power orbs, pause, and the winner. Lines are cached so repeats cost nothing. Without an ElevenLabs key it falls back to the browser's built-in voice.
- Toggle both in **Settings** on the TV; the party leader can toggle Gemini from their phone. Removing Gemini from the lobby turns it off.
- No keys? Everything else works as before. `AI_MOCK=1` fakes both services for testing.

### Testing alone

Open the host screen and press **Start game**, then add bots:

```bash
npm run bots -- ABCD 3      # room code shown on screen, number of bots
```

Bots join, pick words, sculpt random 3D shapes, spam wrong guesses, grab power orbs and sabotage each other. Open `http://localhost:3000/?room=ABCD` in a desktop browser tab to play alongside them. Without motion sensors, the phone page switches to fallback controls: drag to look around, hold **Space** to sculpt, scroll to change depth.

### No shared Wi-Fi, or venue Wi-Fi blocks device-to-device traffic?

Use a tunnel, which also gives you a real certificate (no warning):

```bash
npx cloudflared tunnel --url https://localhost:3443 --no-tls-verify
# then restart with the URL it prints, so the QR code uses it:
PUBLIC_URL=https://your-tunnel.trycloudflare.com npm start
```

---

## How a turn works

1. **Choose (15s).** The sculptor picks one of three words: easy (×1), medium (×1.25) or hard (×1.5 points).
2. **Sculpt (30, 60, 90 or 180s).** After a **3-2-1 SCULPT!** countdown on the TV and the sculptor's phone, the sculptor holds their phone like a camera and sees a "magic window" into the 3D space around them. They hold the big button and sweep to paint, and twist the wrist to push the brush farther away (🔓 locks the depth if twisting feels fiddly).
3. **Spin.** The TV shows the sculpture from a deliberately bad angle (edge-on, from above) that slowly swings round to the front. On their own phones, guessers can **drag to orbit** the sculpture and **pinch to zoom**; double-tap returns to the auto-spin. Letter hints appear at 50% and 75% of the time.
4. **Shake to guess.** Shake your phone to unlock the guess box. A wrong guess freezes you for 4s, then you have to shake again.
5. **Power-ups.** Everyone starts with one; you get another for guessing right, and two **power orbs** drop during each turn (first to tap *Grab* keeps it). Up to 3 slots. Pick a rival and **flick your phone** to throw:
   - 🌫️ **Fog**: blurs their view for 7s
   - 🙃 **Flip**: turns their view upside down for 8s
   - 🌀 **Dizzy**: spins their camera wildly for 6s
   - 🧊 **Freeze**: they can't guess for 6s
   - 💡 **Secret hint**: reveals a letter only you can see
   - 🛡️ **Shield**: blocks the next attack on you
6. **Reveal.** The **first correct guess ends the turn**. The word appears and the sculpture is shown from the front.

**Scoring:** the guesser earns `100 + 400 × fraction of time left` points, multiplied by difficulty (easy ×1, medium ×1.25, hard ×1.5). The **sculptor earns half** of that, so drawing clearly pays off. Nobody else scores that turn.

**Word packs** live in `lib/words.js`: 🎨 Classic (120), 🎃 Spooky, 🦁 Penn State & HackPSU, 💻 Tech & Code, 🍕 Food and 🦒 Animals. Each is sorted into easy/medium/hard by how hard it is to sculpt and recognize in 3D. Mix packs in Settings, and paste your own **custom words** (comma or one per line; difficulty is guessed from length). An `ALIASES` map lists synonyms that also count (e.g. *carousel* = *merry go round*).

**Take-home GIFs:** at the end, the laptop renders every sculpture as a spinning, captioned GIF (it builds up stroke by stroke, then does a full 360°). Each phone downloads every GIF as soon as it's ready and keeps it, even after **Play again** or the room closing, with **Save** and **Share** buttons (your own sculptures first). A **🎞️ Last game's GIFs** button appears in the lobby and join screens. The TV podium also shows a QR code for the full gallery page (`/gallery/ROOM`).

---

## How it works

```
server.js        Express + Socket.IO; HTTP :3000 (host) and HTTPS :3443 (phones), QR codes, rooms
lib/game.js      Game state machine: lobby → choose → draw → reveal → … → podium; scoring, hints, validation
lib/ai.js        Gemini (guess + critic) and ElevenLabs (cached text-to-speech) clients
lib/env.js       Tiny .env loader
lib/words.js     Word packs tuned for 3D, sorted by difficulty, plus custom-word handling
public/js/
  motion.js      DeviceOrientation → quaternion, recentering, wrist-twist depth, shake + flick detection
  scene.js       Three.js renderer: glowing tube strokes, reveal-orbit camera, drawer "magic window"
  play.js        Phone controller (join, sculpt, orbit, shake-to-guess, power-ups, practice mode, take-home GIFs)
  host.js        TV screen (title menu, settings, lobby/QR, live sculpture, scoreboard, power toasts, podium)
  announcer.js   TV announcer queue (ElevenLabs audio, browser-voice fallback)
  confetti.js    Confetti bursts
  gif.js         Renders a sculpture to a spinning, captioned GIF (gifenc) for the gallery
scripts/bots.js  Bot players for solo testing
```

**Why orientation, not position?** A phone's accelerometer can't track position: integrating acceleration twice drifts tens of centimetres within a second. The gyroscope's **rotation** is accurate and stable, though. So the brush is projected along the direction the phone points (like a laser pointer onto a sphere around you), and the **wrist twist** around that axis sets the distance. That gives real, drift-free 3D strokes in any phone browser, with no AR framework required.

**Networking:** the drawer streams points in batches about every 50 ms. The server validates them (only the current drawer can draw, coordinates are bounded, and there are caps on stroke count and size) and relays them to the room. Phase deadlines are sent as "time remaining" rather than timestamps, so devices with different clocks stay in sync. If a phone drops briefly, it rejoins with the same identity, and the sculptor gets an 8-second grace period before their turn is skipped.

### Config

| Env var | Default | |
|---|---|---|
| `PORT` | `3000` | HTTP port (host screen) |
| `HTTPS_PORT` | `3443` | HTTPS port (phones) |
| `PUBLIC_URL` | auto (LAN IP) | URL encoded in the QR code, e.g. a tunnel |
| `CHOOSE_MS` / `REVEAL_MS` | `15000` / `8000` | Phase lengths |
| `FORCE_POWER` | (unset) | Dev only: make every power-up one type, e.g. `fog` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | (unset) / `gemini-3.5-flash` | Gemini AI rival + critic |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL` | (unset) / George / `eleven_flash_v2_5` | Announcer voice |
| `AI_MOCK` | (unset) | `1` = fake both AI services (testing) |

---

## Troubleshooting

- **Phone can't load the page:** make sure the phone is on the same Wi-Fi, and use the exact `https://…:3443` URL. Some venue and guest networks block device-to-device traffic; use the tunnel option above.
- **"No motion data" in the lobby:** on iPhone, Motion access is only requested when you tap **Join**. Reload and join again, and check *Settings → Safari → Motion & Orientation Access*. On Android Chrome it works automatically over HTTPS.
- **The brush points the wrong way:** point at the TV and tap **⟲** (recenter).
- **Wrong address in the QR code** (several network adapters): the terminal lists other LAN addresses. Run with `PUBLIC_URL=https://<right-ip>:3443 npm start`.

## Ideas for the demo / next steps

- Put the host screen on a projector and have a judge sculpt something. The edge-on → front reveal is the "aha" moment.
- Team mode (2v2 relay sculpting), "everyone sculpts the same word" voting rounds, or exporting sculptures as `.glb` for 3D printing.
- Use WebXR on Android for true 6-DoF sculpting as an optional "pro brush".

## Credits

Sculpt & Spin was built at HackPSU Fall 2026. It stands on these open-source projects and services:

| What | Used for | License |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | 3D rendering of the sculptures, cameras and turntable | MIT |
| [Socket.IO](https://github.com/socketio/socket.io) (server and client) | Real-time game state and stroke streaming between phones and the TV | MIT |
| [Express](https://github.com/expressjs/express) | Web server for the TV and phone pages | MIT |
| [gifenc](https://github.com/mattdesl/gifenc) | Encoding the take-home spinning GIFs | MIT |
| [node-qrcode](https://github.com/soldair/node-qrcode) | Join and gallery QR codes | MIT |
| [selfsigned](https://github.com/jfromaniello/selfsigned) | Local HTTPS certificate (phones only allow motion sensors over HTTPS) | MIT |
| [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) and [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) via Google Fonts | Typography | SIL Open Font License |
| [Google Gemini API](https://ai.google.dev/gemini-api/docs) | The AI rival's guesses and the art-critic reviews | Google API terms |
| [ElevenLabs API](https://elevenlabs.io/docs) | The game-show announcer voice | ElevenLabs terms |
| [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (optional) | Public HTTPS link when venue Wi-Fi blocks phones | Cloudflare terms |

References we read along the way: [MDN DeviceOrientationEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent), [MDN DeviceMotionEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent), the [three.js docs](https://threejs.org/docs/) and the [Socket.IO docs](https://socket.io/docs/v4/).
