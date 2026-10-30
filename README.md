# arcade

A landing page for my games, drawn as an arcade cabinet. The page eases in
from the whole cabinet to its screen; picking a game zooms the rest of the way
in, fills a loading bar and opens the game.

Plain HTML/CSS/JS, no build step. Open `index.html` in a browser.

## Adding a game

Copy one of the `<a class="tile">` blocks in `index.html` and change its
`href`, `data-name` (shown on the loading screen), artwork, name and
description. The artwork is an inline 200x110 SVG. The screen shows it as a
thumbnail and, for the selected game, big in the preview with the name and
description beside it.

## Controls

Hover or tap a thumbnail to select it, click or tap it again to start. The
joystick moves the selection and any of the three buttons starts the game.
The selection clears after 5 seconds; until something is selected the
preview cycles through the games.

## Tuning

- Camera shots (how much of the cabinet each step shows) and timings are at
  the top of `arcade.js`.
- Colours are the CSS variables at the top of `style.css`, the same palette as
  turn7 and squared.
- Respects `prefers-reduced-motion`: no camera moves or blinking, just a quick
  cut to the loading screen.

## Deploying to GitHub Pages

Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/`.
