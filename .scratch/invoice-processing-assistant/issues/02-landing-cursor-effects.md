# 02 — Landing page with six switchable cursor effects

Status: ready-for-agent
Blocked by: 01

## What
A dark-only landing page `/` with a hero that explains the product, all six cursor effects, and a sticky switcher so the owner can pick one later. See spec "Landing cursor effects".

## Scope
- Sticky nav: Lens · Receipt · Stamp · Particles · Ruler · Scanner · Off. The selection is stored in `?cursor=<name>` and remembered in localStorage (wrapped in try/catch). The URL wins over localStorage.
- Each effect is its own lazily loaded component with a shared interface: mount and unmount, with listeners and requestAnimationFrame loops cleaned up on unmount.
  1. Lens: a loupe over a blurred scanned invoice reveals crisp, highlighted JSON.
  2. Receipt: a thermal receipt trails the cursor, prints, curls, and tears off when the cursor is idle.
  3. Stamp: each click leaves a rotated PAID ✓ / EXTRACTED ink stamp that fades.
  4. Particles: digits, `{}`, `€` and `$` drift and snap into a table grid near the cursor (canvas).
  5. Ruler: a ledger-ruled crosshair follows the cursor, and hovered hero text shows a field tooltip.
  6. Scanner: a horizontal light band tracks the cursor's Y position over a document mockup and digitises the lines it passes.
- All effects are disabled under `prefers-reduced-motion` and `(pointer: coarse)`, and the switcher shows why.
- Target 60fps with no layout thrash. Use the Ledger Noir palette.

## Acceptance
- Each `?cursor=` value renders its effect. Switching cleans up the previous effect, with no leaked listeners.
- With reduced motion or touch emulation, the hero is static.
