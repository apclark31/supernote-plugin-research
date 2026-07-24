# Gesture Options & Configurability Roadmap

> What finger/pen gestures are possible and reliable on Supernote via the motion
> listener, which are worth offering, and which parameters deserve config exposure.
> Distilled from `../../docs/gesture-research.md` [R], `design-gesture-audit.md` [A],
> and `design-gesture-guards.md` [G] (session 34 research pass).
>
> **Design constraints (non-negotiable):** classify on UP from buffered events
> (JS timers are suspended while the plugin view is closed); `onMsg` stays
> SDK-free until a gesture is classified (B-021); no hover events exist; palm
> rejection is firmware-level.

## Device facts that shape every gesture decision

| Fact | Value | Source |
|------|-------|--------|
| Pointer count cap | 3 on dev A5X, but an external device reported 5 -- use `>=` checks, never `==` | [R], [A] Session 29 |
| Natural bezel swipe duration | 1400-2000ms (up to 7s when frustrated); 1200ms limit caused 13/13 failures | [A] Problem 1 |
| Long press signature | ZERO MOVE events, no drift -- trivially detectable | [R] |
| Finger event rate | ~25/sec during drags; single tap = clean DOWN->UP | [R] |
| Phantom multi-touch | Second pointer at identical coords, vanishes in ~1 event; happens without sleep | [A] Problem 4 |
| Bezel-entry coordinate misreporting | Multi-finger bezel entry can report DOWN mid-page (y=884 instead of ~1860) | [A] Problem 2 |
| Canvas vs bezel | Separate input surfaces; system gestures (page turn, menus) never reach the listener | [R] |
| Only real native conflict | 2-finger-hold + pen (native lasso/erase) -- mixed-input guard handles it | [R] |
| Multi-pointer stagger | PTR_DOWN[1] arrives 50-150ms after DOWN -- fingers land sequentially | [R] |
| Untested edges | Top (system menu risk) and right (sidebar) bezel swipes -- avoid | [R] |

## Current gesture set (session 34)

| Gesture | Status | Config |
|---------|--------|--------|
| Long press on supertask link (800ms, no drift) | Always on | -- |
| Three-finger double tap -> task home | Always on | -- |
| Hold 400ms + drag lasso-add | Opt-in | `lassoGestureInput: 'finger'` |
| Finger hold + pen lasso assist | Opt-in | `lassoGestureInput: 'pen-lasso'` |
| Bezel swipe (2+ fingers up from bottom 4%) -> task home | Opt-in (F-021, session 34) | `bezelSwipeEnabled: true` |

### Bezel swipe implementation parameters (as shipped)

- Zone: bottom 4% of canvas height, self-calibrated from observed max y (default 1871, no SDK calls)
- Trigger: `maxPointers >= 2`, upward displacement >= 150px (>= 80px for 3+ fingers), duration <= 3500ms
- Recovery: misreported-DOWN entries land in multi-tap tracking; `onMultiTapEnd` reclassifies by displacement (taps have near-zero travel)
- Bezel-zone DOWNs are excluded from long-press/lasso paths (nothing linkable in the bottom 4%)

## Candidate future gestures (ranked by evidence)

**Tier A -- documented-reliable, low false-positive risk:**
1. **Two-finger tap** -> quick-add or open-tab. Clean DOWN->PTR_DOWN->UP, <20px drift. No system conflict; pure-tap has no pen events so the mixed-input guard already separates it from native lasso. [R rates High]
2. **Two-finger directional swipes** (up/down/left/right, mid-canvas) -> open-panel / dismiss / tab-switch. All 4 directions tested, 510-740px displacement. Disambiguate from bezel swipe by DOWN location. [R rates High]

**Tier B -- plausible, needs on-device validation:**
3. **Two-finger double tap** -> distinct toggle (extends proven primitives; buffer across two tap cycles)
4. **Triple tap (1 finger)** -> only under a gated mode (1-finger input overlaps normal use)
5. **Left bezel-in swipe** -> secondary open action (tested 220-317px travel in [R], never productized)

**Tier C -- speculative:**
6. **Finger-drawn shapes after hold** (circle/X/checkmark) -- rectangle primitive is proven; shape classification is fuzzy; needs the hold-gate for intent
7. **Corner taps** -- capturable but untested, ergonomically doubtful

**Avoid:** top/right bezel swipes (system menu/sidebar), plain 1-finger swipes always-on, any new pen+finger combo (crowded by native lasso/erase).

## Configurability guidance

**Expose to users:** gesture on/off + action binding per gesture (schema for a
`gestures: {id: action}` config map already sketched in [R]); long-press hold
duration (natural timing varies; 500-1200ms range); possibly a coarse edge-zone
sensitivity (narrow/medium/wide).

**Hardcode:** drift threshold (20px), min bbox (50px), hit padding (30px),
displacement thresholds, stagger windows, phantom dedup, mixed-input cooldown --
hardware-tied disambiguation internals, not preferences.

**Suggested binding vocabulary** (from [R], adjusted): open-task-home (default
tab / specific tab / specific project), quick-add, dismiss/cancel, undo (future).
F-021's "configurable target" idea plugs in here once the binding map exists.
