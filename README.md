# ⚓ Battleship — Play vs. AI

A free, browser-based Battleship game where you play against an AI opponent.
No sign-up, no server, no tracking — just a single static page.

**Play it here:** https://maasapphire-blip.github.io/battleship/

## Features

- Classic 10×10 Battleship with the standard 5-ship fleet
- Manual ship placement (click to place, `R` to rotate) or one-click random placement
- Three AI difficulty levels:
  - **Easy** — fires randomly
  - **Normal** — hunts adjacent squares after a hit
  - **Hard** — infers ship direction, uses parity (checkerboard) search, and only fires where the smallest remaining ship could fit
- Built-in "How to Play" guide for first-time players, including strategy tips on how to win
- Works on desktop and mobile

## How to Win (short version)

1. Sink all 5 enemy ships before the AI sinks yours.
2. Fire spread-out shots until you get a hit, then fire at the squares next to it.
3. Once you have two hits in a line, keep firing along that line.
4. Use a checkerboard pattern when searching — every ship is at least 2 squares long.

The full guide is in the game under **How to Play**.

## Run locally

It's plain HTML/CSS/JS — just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Publishing (GitHub Pages)

1. Go to **Settings → Pages** in this repository.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, pick `main` and `/ (root)`, then **Save**.
3. After a minute the game is live at `https://maasapphire-blip.github.io/battleship/`.

## License

MIT
