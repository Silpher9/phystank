# phystank

Een kleine top-down 3/4 tankgame in Babylon.js, geïnspireerd op het pantsermodel
van *Men of War: Assault Squad*.

## De kern

Tanks zijn niet "sterk" of "zwak" — hun **zijden** zijn dat. Elke plaat heeft een
eigen dikte en helling, en of een granaat doorslaat hangt af van de hoek waarin
hij inslaat:

- **PENETRATION** — doorslag, schade
- **RICOCHET** — te scherpe hoek, de granaat ketst af en vliegt zichtbaar door
- **SHATTER** — de plaat is simpelweg te dik

Daardoor gaat het spel over **positionering**: je sterke zijde naar de vijand
draaien en zijn zwakke zijde zien te vinden.

## Opzet

- `src/core/` — engine-onafhankelijke spelkern (geen Babylon-imports, unit-getest)
- De rest van de game bouwt daarop

Die scheiding is bewust: de ballistiek is de feel van het spel en moet
tuneable en testbaar zijn zonder de game te starten.

## Status

Fase 0 — schietbaan-MVP. Zie de
[issues](https://github.com/Silpher9/phystank/issues) en de milestone
*Fase 0 — Schietbaan MVP*.
