---
name: web-animation
description: Animation and motion design principles for web UI, following Emil Kowalski's "Animations on the Web". Use when adding transitions, drawers, dropdowns, popovers, page/tab transitions, list stagger, loading states, or any micro-interaction — and when a UI feels janky, laggy, or "flashy in a bad way".
---

# Web Animation

Motion is a tool for **explaining change**, not decoration. Every animation should answer:
"what moved, where did it come from, and where did it go?" If it doesn't answer that, delete it.

## The non-negotiables

1. **Animate only `transform` and `opacity`.** These run on the compositor and never trigger
   layout or paint. Animating `width`, `height`, `top`, `left`, `margin`, or `box-shadow`
   causes jank. Use `scale`/`translate` instead. For size changes, animate a wrapper's
   `transform: scaleY()` or use FLIP.
2. **Respect `prefers-reduced-motion`.** Wrap every non-essential animation. Reduce to an
   opacity fade or nothing — never leave the user without feedback, just without movement.
3. **Never animate on every render.** Entrance animations must play *once*, on mount. If a
   state change re-runs the entrance animation, the whole UI flashes and reads as a page
   refresh. This is the single most common animation bug in hand-rolled apps.
4. **Animations must be interruptible.** Never block input during a transition. Use CSS
   transitions (naturally interruptible) over `@keyframes` for state-driven motion.

## Duration

Shorter than you think. Users notice slowness far more than they notice polish.

| Interaction | Duration |
|---|---|
| Hover, focus, color, small state change | 100–150ms |
| Dropdown, popover, tooltip, toggle | 150–200ms |
| Modal, drawer, sheet, page/tab transition | 250–350ms |
| Large travel across the viewport | 350–500ms |

Rule of thumb: bigger element or longer distance → longer duration. Anything over 500ms in a
UI response feels broken. Exit animations should be **faster than enters** (~70% of the enter
duration) — the user has already decided to leave.

## Easing

Easing communicates more than duration does. Never use `linear` for UI (only for continuous
loops like spinners). Never use the default `ease`.

```css
:root {
  /* Enters: fast start, gentle settle. The workhorse. */
  --ease-out-quart:  cubic-bezier(0.25, 1, 0.5, 1);
  /* Softer enter for large surfaces */
  --ease-out-expo:   cubic-bezier(0.16, 1, 0.3, 1);
  /* Movement between two on-screen positions */
  --ease-in-out:     cubic-bezier(0.65, 0, 0.35, 1);
  /* Exits: accelerate away */
  --ease-in-quart:   cubic-bezier(0.5, 0, 0.75, 0);
  /* Spring-like, no overshoot. Emil's own (used in Vaul/Sonner). */
  --ease-spring:     cubic-bezier(0.32, 0.72, 0, 1);
}
```

- **Entering** the screen → ease-**out**. Objects arriving decelerate.
- **Leaving** the screen → ease-**in**. Objects departing accelerate.
- **Moving** within the screen → ease-in-out.
- Overshoot/bounce is for playful, low-stakes moments only. In a data tool, it reads as noise.

## Origin

Motion must start from where the thing came from. A dropdown that fades in from the center
is disorienting; one that scales out from the button that opened it is obvious.

```css
.popover           { transform-origin: top left; }
.popover[data-side="bottom-end"] { transform-origin: top right; }
```

Combine a small `scale` (0.96 → 1, never below ~0.9) with `opacity` and a few px of
`translateY`. Large scale jumps look cheap.

## Stagger

Stagger a list only on **first paint**, never on filter/sort/re-render. Keep the increment
tiny — 20–40ms — and cap the total: after ~6 items, stop incrementing, or the last row
arrives after the user has already started reading.

```css
.row { animation: enter 260ms var(--ease-out-quart) both; }
.row:nth-child(1) { animation-delay: 0ms }
/* … cap at 6 × 30ms = 180ms total */
```

## FLIP — for layout changes you can't animate directly

When items reorder or resize, you cannot transition `top`/`left`. Measure **F**irst, apply the
**L**ast state, **I**nvert with a transform, then **P**lay it back to zero.

```js
const first = el.getBoundingClientRect();
mutateDom();
const last = el.getBoundingClientRect();
el.animate(
  [{ transform: `translateY(${first.top - last.top}px)` }, { transform: 'translateY(0)' }],
  { duration: 250, easing: 'cubic-bezier(0.32,0.72,0,1)' }
);
```

## Specific patterns

**Drawer / bottom sheet** — slide on `translateY(100%) → 0` with `--ease-spring`, overlay
fades `0 → 1` in parallel but ~50ms shorter. Never animate `height`.

**Dropdown / popover** — `opacity 0→1`, `scale 0.96→1`, `translateY(-4px)→0` over 150ms
with `--ease-out-quart`, `transform-origin` at the trigger corner.

**Tab switch** — animate a shared underline indicator with `transform: translateX()` +
`scaleX()` (not `left`/`width`). Cross-fade the panels; never re-run their entrance stagger.

**Toast** — enter from the edge it lives on, `--ease-spring`, exit faster with `--ease-in-quart`.

**Skeleton / shimmer** — only if the wait exceeds ~400ms. Below that, show nothing; a flash of
skeleton is worse than no skeleton.

**Number changes** — count up over ~600ms with ease-out, but only on first paint. Re-animating
counters on every data refresh is distracting.

## Checklist before shipping

- [ ] Only `transform`/`opacity` animate (check DevTools → Rendering → Paint flashing)
- [ ] `prefers-reduced-motion` handled
- [ ] Entrance animations run once, not on every state change
- [ ] Exits are faster than enters
- [ ] Nothing blocks input mid-animation
- [ ] Every popover/menu scales from its trigger's origin
- [ ] No animation exceeds 500ms
- [ ] The UI still makes sense with all animation removed
