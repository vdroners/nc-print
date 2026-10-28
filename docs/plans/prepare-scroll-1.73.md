# Prepare scroll — one workspace, panel scroll inside (1.73.0)

Status: implemented on `cursor/prepare-scrollbars-dc93`. Do not ship. Do not merge.
Do not contact the live printer.

## Problem (live 1.72.0, 1280×800)

The Prepare card is a fixed-height overlay (`100dvh` minus the workflow bar only).
That is about 100px taller than the shell body, so:

- The far-right scrollbar (Nextcloud `#app-content` / the shell, whichever
  ancestor the overflow reaches) scrolls ~100px and moves the whole card.
- The left panel (Import / Profiles / Mesh & health) is its own vertical
  scroller. At the end of that scroll, the wheel chains and the card jumps.
- The right “Ready to slice” card does not overflow, so the wheel hits the page.
- Comfortable density shows a horizontal bar on the left panel because
  Draft / Standard / Fine do not wrap (`overflow-y: auto` promotes `overflow-x`).
- Scrolling that ~100px slides Prepare content (Change printer) and Print
  content (nozzle targets) under the sticky workflow bar, which does not paint
  an opaque slab below the pill.

## Behavior

- The app root fills the Nextcloud content box and does not let `#app-content`
  scroll the card (`overflow: hidden` on the root and on `#app-content`).
- On wide screens the immersive studio height is the shell’s free space
  (banner, footer, body padding, and workflow bar subtracted — measured, with
  a `100%` flex fill as well). The page does not scroll the Prepare card.
- Left and right panels stay `overflow-y: auto` + `overscroll-behavior: contain`
  and `overflow-x: hidden`, with `min-width: 0`. They scroll inside the card
  when their content is taller. The bed does not scroll.
- Quality tiers wrap, so Comfortable does not grow a horizontal bar.
- The workflow bar is an opaque sticky slab (app background, padding below the
  pill, no negative top margin) so scrolled Print content does not show through
  and does not tuck under the pill.
- Below 1200px the studio stays a normal column flow and the shell body scrolls
  once. Open recent keeps its own short menu scroll.

## Files

| File | Change |
|---|---|
| `css/style.scss` | Root fills the content box; page overflow hidden; chrome slab; tab-scroll flex |
| `src/components/PrepareStudioLayout.vue` | Studio fills the free space; side panels scroll inside, no horizontal bar |
| `src/utils/prepare-stage.js` | Free-space measurement |
| `src/App.vue` | Write `--nc-print-stage-h` from the shell |
| `src/components/PrepareOverrides.vue` | Wrap the quality row |
| `src/__tests__/prepare-scroll.spec.js` | Regression for the scrollbar map |
