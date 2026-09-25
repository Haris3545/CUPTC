# CUPTC — Cambridge University Padel Club

Placeholder website for the Cambridge University Padel Club, with a small retro game to tide visitors over until the full site launches.

- **`/`**: landing page with the logo, "Full Website Coming Soon", and a **To Tide You Over** button.
- **`/play/`**: **Padel Pong**, a 16-bit padel rally game with a behind-the-player camera, glass walls, a crowd in club colours and a Cambridge skyline.

It's a plain static site with no build step and no dependencies.

## Run it locally

Any static file server works, for example:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` straight from disk works for the landing page. The link to `play/` needs a server so the folder resolves to `play/index.html`.)

## Publish with GitHub Pages

1. Merge into `main`.
2. In the repository go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then pick `main` and `/ (root)`.

The site will be served at `https://<user>.github.io/<repo>/`. All links are relative, so it also works at a custom domain.

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
| **Espresso Shot** | You run about 55% faster for 5 shots. |
| **Big Racket** | Bigger racket and reach for 4 shots. |
| **Glass Guardian** | Saves the next ball that would double-bounce. |
| **Golden Ball** | Each hit scores 3 for 6 shots, but the ball is 25% faster. |
| **Combo Streak** | 5 volleys, smashes or off-the-glass shots in a row doubles your points; 10 triples them. |
| **Bandeja Boost** | High balls fill a gauge; when it's full, your next smash is a winner worth +5. |
| **Smash Zone** | Smash from inside the gold circle near the net for +5. |
| **Mirror Match** | Left and right swap for 3 shots. |
| **Cambridge Weather** | Rain for 15 seconds: low, skiddy bounces. |
| **Night Session** | Floodlights only for 15 seconds. |
| **Rival Rage** | 3 fast, wide attacking shots; survive them for +3. |
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

- Logo © Cambridge University Padel Club.
- [Old Standard TT](https://fonts.google.com/specimen/Old+Standard+TT) (landing page, via Google Fonts).
- [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) by CodeMan38, self-hosted under the SIL Open Font License (`play/fonts/OFL.txt`).
