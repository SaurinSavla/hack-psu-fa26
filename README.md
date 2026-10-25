# 🎨 Pictionary 64

**Paint in thin air with your phone. Everyone else races to guess it, while it spins into view.**

A 3D Pictionary party game for 4–12 players. No app install: phones join from the browser by scanning a QR code.

| Requirement | How Sculpt & Spin uses it |
|---|---|
| **Phone motion** | The sculptor's phone *is* the brush: **pointing and sweeping it through the air** paints in 3D, a **wrist flick** turns a shape as it grows, and a **shake** undoes. Guessers **shake** to unlock each guess and **flick** their phone to throw sabotage power-ups. |
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
5. Every phone shows who has joined. The **first player to join is the party leader 👑** until someone hands it over: on the TV, click the faint **👑** on any player card to make them leader (the leader can also pass it on from their phone). The leader can change rounds, time, word packs and power-ups, remove players (✕), and start the game from their phone. On the TV, hover a player card and click **✕** to remove someone, then press **Start game**.

### 🎬 Demo mode (the default)

Out of the box the game is tuned for a crowd: the **⭐ Demo: super easy** word pack (snowman, donut, ice cream cone, rocket, saturn, burger…, each built from one or two shapes), 1 round, 90s turns, **generous hints** (a letter right away, more at 30% and 55%) and **Gemini on Easy** (2 looks, only in the second half of the turn, and it doesn't see the letter hints). If you've changed things, **Settings → 🎬 Use demo setup** puts it all back. For a tougher game set Gemini to **Fair** and hints to **Normal**.

**Sculpting tips for the demo:** pick a shape, then **drag one finger** anywhere to turn it, **twist two fingers** to roll it, **slide two fingers** to spin your view, and **double-tap** to straighten it. Hold the button to grow it, let go to place it, then paint details on its surface.
6. During a game, **☰ Menu** (or **Esc**) pauses everything and lets you **Resume**, **Restart game**, go **Back to lobby** or **Quit to main menu**. Shortcuts: **P** pause, **N** skip turn, **F** fullscreen, **M** mute.

### 🤖 Gemini AI rival + 🎙️ ElevenLabs announcer (optional)

1. Copy `.env.example` to a new file called `.env` (same folder as `server.js`).
2. Paste your keys:
   - `GEMINI_API_KEY`: from [Google AI Studio](https://aistudio.google.com/apikey), created in a **team project** (see below)
   - `ELEVENLABS_API_KEY`: from your [ElevenLabs settings](https://elevenlabs.io/app/settings/api-keys)
3. Run `npm run check-ai`. It tests both keys and saves `check-voice.mp3` so you can hear the announcer.
4. `npm start`. The terminal shows whether each AI feature is on.

**What they do:**
- **Gemini 🤖 joins every game as a player.** On **Fair**, at about 35%, 58% and 80% of each turn (on **Easy**, the default, just twice at about 55% and 85%), the TV sends Gemini a snapshot of exactly what everyone is looking at, plus the word pattern (it skips a look if the sculpture hasn't changed). Gemini guesses (with a cheeky one-liner) and **if it's right it wins the turn**, scoring like a player (the sculptor still gets half). Players can throw power-ups at Gemini to blind it. At each reveal, Gemini reviews the sculpture like an art critic and scores it out of 10; the review also appears on the podium gallery.
- **The ElevenLabs announcer** voices the big moments on the TV: welcome, "you're up", the 3-2-1 countdown, correct guesses, Gemini's guesses and reviews, sabotage, power orbs, pause, and the winner. Lines are cached so repeats cost nothing. Without an ElevenLabs key it falls back to the browser's built-in voice.
- Toggle both in **Settings** on the TV; the party leader can toggle Gemini from their phone. Removing Gemini from the lobby turns it off.
- No keys? Everything else works as before. `AI_MOCK=1` (or `npm run dev:mock`) fakes both services for testing.

#### How much Gemini quota a game uses

Every guess and every review is **one request**. By default that's up to 3 guesses + 1 review = **4 requests per turn**, so a 6-player, 2-round game is about **50 requests**. Change it with `GEMINI_GUESSES_PER_TURN` (0–6) and `GEMINI_CRITIC=0` in `.env`.

Free-tier limits are counted **per Google Cloud project, per model**: a few requests per minute and a daily cap that resets at midnight Pacific time. Google changes these numbers often, so check your project's real limits on the [AI Studio rate-limit page](https://aistudio.google.com/rate-limit). The default model is `gemini-3.5-flash-lite`, the cheapest one with a free tier.

When Google answers "quota exceeded", the server stops calling Gemini until the limit resets, the TV shows 😴 next to Gemini with the reason, and the game carries on without it. It comes back by itself (per-minute limits after a short break, daily limits after midnight Pacific).

**Testing with bots spends quota too:** every bot game asks Gemini about every sculpture. Use `npm run dev:mock` (or `AI_MOCK=1`) while developing, and only switch the real key on for playtests and the demo.

#### Getting a Gemini key that isn't anyone's personal key

The key never leaves the server: the TV and phones only talk to `server.js`, which calls Gemini. So the only questions are whose quota it uses and who pays.

1. **Make a team project.** Sign in to [AI Studio](https://aistudio.google.com/apikey) with a shared team Google account (or one person's, then add the others), and create the key in a **new project** named after the app, not in anyone's default project. In the [Cloud console IAM page](https://console.cloud.google.com/iam-admin/iam) add each teammate as a member, so anyone can see usage or rotate the key and it doesn't belong to one person.
2. **Keep it in `.env` on the laptop that runs the server only.** Never commit it, paste it in chat, or put it in browser code. If a key leaks, delete it in AI Studio and make a new one.
3. **For the demo, link a billing account to that project** (Tier 1). New Google Cloud accounts get [free-trial credits](https://cloud.google.com/free) and hackathon sponsors often hand out cloud credits (check that they apply to the Gemini API). Flash-Lite costs a fraction of a cent per request, so a whole game is a few cents. Set a [budget alert](https://console.cloud.google.com/billing/budgets) (e.g. $5) so nobody gets surprised. Paid tiers have much higher limits, so it won't run out mid-demo.
4. **No billing at all?** Stay on the free tier: with the defaults above and mock mode for development, the daily free requests usually cover a few real games. If they run out, the game keeps working without the AI rival until the quota resets.

Swapping in teammates' personal keys one after another isn't a real fix: it just spends each person's own quota, and a second key from the same project shares the same limit anyway.

### Testing alone

Open the host screen and press **Start game**, then add bots:

```bash
npm run bots -- ABCD 3      # room code shown on screen, number of bots
```

Bots join, pick words, sculpt random 3D shapes, spam wrong guesses, grab power orbs and sabotage each other. Open `http://localhost:3000/?room=ABCD` in a desktop browser tab to play alongside them. Without motion sensors, the phone page switches to fallback controls: drag to look around, hold **Space** to sculpt, scroll to change depth, **Q**/**E** to spin the sculpture and **V** to peek.

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
2. **Sculpt (30, 60, 90 or 180s).** After a **3-2-1 SCULPT!** countdown on the TV and the sculptor's phone, the sculptor holds their phone like a camera and sees a "magic window" into the 3D space around them. They hold the big button and sweep to paint, and drag the depth slider (up = farther, down = nearer) to set how far away the brush paints; the brush dot grows and shrinks to show the depth, and a **?** button explains the controls at any time. **3D shapes:** the tool row has the 🖌️ brush plus 25 solid shapes: cube, cuboid, sphere, pyramid, cylinder, cone, tube, board, wall, dome, ring, capsule, egg, prism, hexagon, ramp, arch, tetrahedron, diamond, gem, star, heart, moon, knot and spring. Pick one (a faint preview shows where it will go), **drag the preview with a finger** to turn it (double-tap it to straighten) or **flick your wrist while it grows** to turn it 90°, then **hold** the big button to grow it (it grows away from you, capped so it can't swallow your view), and **let go** to place it in the current colour. Aim at an existing shape first to stand the new one on its surface. **🧲 Snap (on by default):** point the brush at a shape and a green ring shows you're on its surface. The depth is automatic, and as you paint the ink follows the surface. On a flat face it stays in that face's plane, even past the edge. On curved shapes (sphere, cone, ring) it wraps around them. Shapes sync to everyone, undo like strokes, and appear in the gallery and GIFs. **Easier sculpting:** the tool row shows the 16 most useful shapes. **🪞 Mirror** copies every stroke and shape to the other side of a dotted middle line (faces, animals, cars in half the time). **〰️ Round / ▬ Flat** switches between 3D tube paint and flat paint that lies on surfaces like paint on a wall (eyes, stripes, windows). A built-in **stabiliser** smooths out hand shake, and **undo** takes back a whole action (a mirrored pair, or a flat stroke that wrapped round a curve). **Shake to undo:** shake the phone to take back the last stroke or shape. To build a real 3D object, **swipe on the scene**: sideways spins the sculpture on a turntable, up/down tips it so you can paint its top or bottom (double-tap for the front view; ◀ ▶ spin 45°; on a laptop Shift- or right-drag, or Q/E/R/F/0) (45° at a time) so its sides and back face you, and paint them too; the label shows which side you're painting. **👁 Peek** steps outside to see the sculpture from the audience's side (drag to orbit, pinch to zoom; tap the big button to get back to sculpting). Everyone else sees the sculptor's orb move around the sculpture as they spin it.
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

**Ink colours:** the sculptor's colour row scrolls through 24 inks (including greens, browns, skin tones and greys), and the 🌈 swatch at the start opens a picker for any colour, remembered on that phone.

**Scoring:** the guesser earns `100 + 400 × fraction of time left` points, multiplied by difficulty (easy ×1, medium ×1.25, hard ×1.5). The **sculptor earns half** of that, so drawing clearly pays off. Nobody else scores that turn.

**Word packs** live in `lib/words.js`, about 1,000 different words in all: 🎨 Classic (375), 🎃 Spooky (120), 🦁 Penn State & HackPSU, 💻 Tech & Code, 🍕 Food, 🦒 Animals (about 105 each), ⚽ Sports & Games, 🏠 Around the House, 🌋 Nature & Space and 🐉 Fantasy & Fairy Tales (70 each). Each is sorted into easy/medium/hard by how hard it is to sculpt and recognize in 3D. Mix packs in Settings, and paste your own **custom words** (comma or one per line; difficulty is guessed from length). An `ALIASES` map lists synonyms that also count (e.g. *carousel* = *merry go round*). After editing the packs, run `npm run check-words` to catch duplicates and typos.

**No repeats:** a room never offers the same word twice until it has run out of fresh ones. The server also remembers which words were offered recently in *any* room (saved in `.data/recent-words.json`, so it survives restarts), so opening a new room or restarting the laptop doesn't bring back the same few words.

**Take-home GIFs:** at the end, the laptop renders every sculpture as a spinning, captioned GIF (it builds up stroke by stroke, then does a full 360°). Each phone downloads every GIF as soon as it's ready and keeps it, even after **Play again** or the room closing, with **Save** and **Share** buttons (your own sculptures first). A **🎞️ Last game's GIFs** button appears in the lobby and join screens. The TV podium also shows a QR code for the full gallery page (`/gallery/ROOM`).

---

## How it works

```
server.js        Express + Socket.IO; HTTP :3000 (host) and HTTPS :3443 (phones), QR codes, rooms
lib/game.js      Game state machine: lobby → choose → draw → reveal → … → podium; scoring, hints, validation
lib/ai.js        Gemini (guess + critic) and ElevenLabs (cached text-to-speech) clients
lib/env.js       Tiny .env loader
lib/words.js     Word packs tuned for 3D, sorted by difficulty, custom words, recently-played memory
public/js/
  motion.js      DeviceOrientation → quaternion, recentering, shake + flick detection
  scene.js       Three.js renderer: glowing tube strokes, reveal-orbit camera, drawer "magic window"
  play.js        Phone controller (join, sculpt, orbit, shake-to-guess, power-ups, practice mode, take-home GIFs)
  host.js        TV screen (title menu, settings, lobby/QR, live sculpture, scoreboard, power toasts, podium)
  announcer.js   TV announcer queue (ElevenLabs audio, browser-voice fallback)
  confetti.js    Confetti bursts
  shapes.js      The 25 stampable 3D shapes (shared geometries, meshes with edge outlines)
  gif.js         Renders a sculpture to a spinning, captioned GIF (gifenc) for the gallery
scripts/bots.js  Bot players for solo testing
scripts/check-words.js  Checks the word packs for duplicates and typos
```

**Why orientation, not position?** A phone's accelerometer can't track position: integrating acceleration twice drifts tens of centimetres within a second. The gyroscope's **rotation** is accurate and stable, though. So the brush is projected along the direction the phone points (like a laser pointer onto a sphere around you), and a **depth slider** on screen sets the distance. That gives real, drift-free 3D strokes in any phone browser, with no AR framework required.

**Networking:** the drawer streams points in batches about every 50 ms. The server validates them (only the current drawer can draw, coordinates are bounded, and there are caps on stroke count and size) and relays them to the room. Phase deadlines are sent as "time remaining" rather than timestamps, so devices with different clocks stay in sync. If a phone drops briefly, it rejoins with the same identity, and the sculptor gets an 8-second grace period before their turn is skipped.

### Config

| Env var | Default | |
|---|---|---|
| `PORT` | `3000` | HTTP port (host screen) |
| `HTTPS_PORT` | `3443` | HTTPS port (phones) |
| `PUBLIC_URL` | auto (LAN IP) | URL encoded in the QR code, e.g. a tunnel |
| `CHOOSE_MS` / `REVEAL_MS` | `15000` / `8000` | Phase lengths |
| `FORCE_POWER` | (unset) | Dev only: make every power-up one type, e.g. `fog` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | (unset) / `gemini-3.5-flash-lite` | Gemini AI rival + critic |
| `GEMINI_GUESSES_PER_TURN` / `GEMINI_CRITIC` | `3` / `1` | Gemini requests per turn: guesses (0–6) and the review (`0` = off) |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL` | (unset) / George / `eleven_flash_v2_5` | Announcer voice |
| `AI_MOCK` | (unset) | `1` = fake both AI services (testing); same as `npm run dev:mock` |

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
