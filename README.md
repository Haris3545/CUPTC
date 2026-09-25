# CUPTC — Cambridge University Padel Tennis Club

The club website, with a small retro game.

- **`/`**: the site. A split-screen start page opens into **Home**, **Membership** and the **Members Area**.
- **`/play/`**: **Padel Pong**, a 16-bit padel rally game.

The pages are plain HTML with no build step. A few small server functions in `api/` handle what can't be public:

| Function | What it does |
|---|---|
| `api/login.js` | Checks the members and committee passwords and signs people in. |
| `api/code.js` | Checks the full-member code and the committee discount code. |
| `api/checkout.js`, `api/confirm.js` | Payments through Stripe Checkout (card, Apple Pay, Google Pay). After a paid membership, shows the members password. |
| `api/merch.js` | The members' shop. Prices are only sent to signed-in members; the committee can add, edit and remove items. |
| `api/committee.js` | Committee photo uploads. Signed in as committee, each person on the home page gets **Change photo**. |
| `api/merch-image.js` | Shop photo uploads, from the **Upload photo** button in the committee merch form. |
| `api/status.js` | Open `/api/status` to see which settings the live site can see (yes/no only, never the values). |

## Put it live on Vercel

1. Import the repository in Vercel (no framework, no build command).
2. **Storage → Create → Blob**, and connect it to the project. This stores the shop and uploaded photos.
3. **Settings → Environment Variables**, add:
   - `MEMBER_PASSWORD`, `COMMITTEE_PASSWORD`, `FULL_MEMBER_CODE`, `COMMITTEE_DISCOUNT_CODE`
   - `AUTH_SECRET`: any long random string
   - `STRIPE_SECRET_KEY`: from the Stripe dashboard, when you're ready to take payments. Until then the buy buttons say payments open soon.
4. Redeploy.

Payments show up in the Stripe dashboard, including the size chosen for merch (in the payment's metadata) and the delivery address.

## Run it locally

```sh
npm install
npm run dev
# then open http://localhost:3000
```

Locally, uploads are saved to `.data/`, payments are simulated, and any setting not in a `.env` file (see `.env.example`) gets a dev-only default. The dev passwords are printed when it starts.

## Padel Pong

| | Desktop | Mobile |
|---|---|---|
| Move | Mouse (move or drag), arrow keys or WASD | Drag anywhere on the screen |
| Hit | Automatic when the ball is in reach | Automatic |
| Pause / mute | `P` / `M` | On-screen buttons |

Every return scores a point (more with power-ups). The game speeds up slowly as the rally grows. The ball may come off the back glass, and the rally ends when it bounces twice on your side. Your best score is saved in the browser.

### Power-ups and events

After a few hits, pickups appear on your half (run over them to grab one) and the game triggers events every dozen or so hits.

| | What it does |
|---|---|
| **Big Racket** | Bigger racket and reach for 4 shots. |
| **Glass Guardian** | Saves the next ball that would double-bounce. |
| **Combo Streak** | 5 volleys, smashes or off-the-glass shots in a row doubles your points; 10 triples them. |
| **Smash Zone** | Smash from inside the gold circle near the net for +5. |
| **Cambridge Weather** | Rain for 15 seconds: low, skiddy bounces. |
| **Doubles Rally** | A teammate and a second opponent join for 20 seconds. |
| **Crowd Wave** | The crowd does a wave and every hit is worth double for 10 seconds. |

The speed-up and milestones still follow the number of hits in the rally, not the score.

### How it's built

| File | What it does |
|---|---|
| `play/js/court.js` | Camera and scene. The court, glass walls, stands, sponsor boards and skyline are ray-cast pixel by pixel into a low-resolution canvas (SNES "Mode 7" style) once per resize. |
| `play/js/sprites.js` | Procedural pixel-art players built from a simple skeleton, with automatic 1px outlines, run cycles and swing poses. |
| `play/js/game.js` | Game loop, ball physics (bounces, glass rebounds), opponent AI, power-ups and events, input, effects and HUD. |
| `play/js/font.js` | 5×7 bitmap font for in-game text. |
| `play/js/audio.js` | Chiptune sound effects generated with WebAudio (no audio files). |

To tune the difficulty, look at the constants at the top of `play/js/game.js`, `updateSpeed()` (the speed curve) and `oppHit()` (shot choice and aim).

For development, `play/?debug&autoplay` lets a bot play the game.

## Credits

- Logo © Cambridge University Padel Tennis Club.
- [Old Standard TT](https://fonts.google.com/specimen/Old+Standard+TT) and [Caveat](https://fonts.google.com/specimen/Caveat) via Google Fonts.
- [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) by CodeMan38, self-hosted under the SIL Open Font License (`play/fonts/OFL.txt`).
