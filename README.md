# Serpent

Serpent is a client-side Canvas 2D game about a sleepy sky serpent. Gather dreamlight, grow longer, and reach the moon across a 25-level campaign.

## Campaign

The game has five stages with five levels each:

1. Pillow Dusk introduces movement, growth, clouds, and the moon goal.
2. Windward Dreams adds periodic gusts that move dreamlight and storms.
3. Rainy Reverie adds storm clouds that cost rest points.
4. Deep Dream hides the distant parts of the serpent inside sleepy fog.
5. The Moon Palace adds paired portals, followed by wrapping sky edges.

Progress, stars, personal bests, sound preference, and unlocked levels stay in browser local storage. There are no accounts, dependencies, build steps, or runtime network requests beyond the optional web font stylesheet.

## Controls

- Keyboard: Arrow keys or WASD to steer; P or Escape to pause.
- Mouse: Click beside the serpent to turn, or drag in a direction.
- Touch: Swipe on the sky or use the on-screen direction pad.

The game automatically pauses when the tab loses focus or becomes hidden.

## Run and test

Open `index.html` directly, or serve this folder with any static web server:

```sh
python3 -m http.server 8000
```

Run the deterministic game-rule tests with Node 18 or newer:

```sh
node --test tests/*.test.js
```
