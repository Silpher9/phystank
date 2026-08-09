# phystank

A small top-down 3/4-view tank game in Babylon.js, inspired by the armor model
in *Men of War: Assault Squad*.

## Core concept

Tanks are not simply "strong" or "weak" — their **facets** are. Each armor plate
has its own thickness and slope, and whether a shell penetrates depends on its
impact angle:

- **PENETRATION** — the shell penetrates and deals damage
- **RICOCHET** — the impact is too oblique; the shell deflects and visibly continues
- **SHATTER** — the plate is simply too thick

This makes the game about **positioning**: present your strongest armor while
trying to expose an opponent's weak side.

## Architecture

- `src/core/` — engine-independent game logic (no Babylon imports, unit tested)
- The rest of the game builds on that foundation

This separation is deliberate: ballistics define the feel of the game and must
remain tunable and testable without launching it.

## Status

Phase 0 — firing-range MVP. See the
[issues](https://github.com/Silpher9/phystank/issues) and the
*Phase 0 — Firing Range MVP* milestone.
