/**
 * Gesture Detector -- finger gesture detection for SuperTask.
 *
 * Three gesture types detected from a single motion listener:
 *
 * 1. LONG PRESS (static hold) -- always active:
 *    - Finger down, hold >= 800ms, NO movement, finger up
 *    - Scans for supertask:// links at touch point -> opens task detail
 *
 * 2. LASSO-ADD (hold then drag) -- config 'finger' only:
 *    - Finger down, hold >= 400ms, THEN start moving (draw selection)
 *    - Aborted if the DOWN point sits on an existing supertask link
 *    - Bounding box of movement -> programmatic lassoElements -> QuickAdd
 *    - Minimum 50x50px bbox required to avoid tiny accidental selections
 *
 * 3. THREE-FINGER DOUBLE TAP (config-gated, default OFF since B-028):
 *    - 3+ fingers tap anywhere on the canvas, twice within 800ms
 *    - Opens task home with the user's default tab
 *    - Works ANYWHERE (no geometric constraint) -- which is exactly why palm
 *      clusters can mimic it and why it is opt-in
 *
 * 4. BEZEL SWIPE (F-021, config-gated, default OFF):
 *    - 2+ fingers swipe up from the bottom edge zone (bottom 4% of canvas)
 *    - Opens task home, same as three-finger double tap
 *    - Parameters from design-gesture-audit.md: natural swipes take
 *      1400-2000ms (max 3500ms), displacement 150px (80px relaxed for 3+
 *      fingers -- 3-finger swipes read shorter). The DOWN must land in the
 *      edge zone -- there is deliberately NO mid-page recovery path (see
 *      B-028: palm+pen multi-touch produces phantom displacement).
 *
 * PALM + PEN POISONING (B-028, on-device 2026-07-24): palm/hand-edge contacts
 * DO reach the listener during pen writing and look like multi-touch. Any pen
 * event cancels bezel tracking and poisons multi-tap tracking, so writing can
 * never fire taps or swipes. Real taps/swipes never involve pen contact.
 * Palm re-plants BETWEEN strokes are pen-free, so poisoning alone is not
 * enough: no tap or swipe may fire within PEN_COOLDOWN_MS (1.5s) of any pen
 * event, and a tap cluster must be crisp (<= TAP_MAX_MS). Consequence: after
 * writing, wait ~1.5s before three-finger tapping or bezel swiping.
 *
 * Config (`lassoGestureInput`): 'off' | 'finger' | 'pen-lasso'. Controls ONLY
 * the quick-add gesture (lasso-add / pen-lasso-assist). Default 'off'.
 * Config (`bezelSwipeEnabled`): default false. When on, DOWNs in the bottom
 * edge zone are bezel-swipe candidates and are excluded from long-press/
 * lasso-add (they aren't plausible link targets anyway).
 * Config (`threeFingerTapEnabled`): default false since B-028.
 * ONLY long press is always active: it is the one gesture with a geometric
 * target (a link's bounds) and zero observed false positives.
 *
 * ARCHITECTURE: the onMsg callback is SDK-FREE. It only tracks coordinates,
 * timestamps, and pointer counts -- pure JS, no bridge traffic. SDK calls
 * (link scan, lassoElements) run only AFTER a gesture has been classified on
 * finger UP. A normal tap, scroll, or pen stroke costs zero SDK calls.
 * (Previously a 3-SDK-call pre-scan fired on every finger DOWN, spamming the
 * AIDL bridge during normal writing -- suspected cause of device-level
 * interference that got the plugin uninstalled.)
 *
 * GESTURE-DEATH PROTECTION (B-019): SDK calls can hang indefinitely. Two
 * layers of defense keep `_actionInProgress` from locking up forever:
 *   1. withTimeout() races each SDK call against a 5s timer. BUT JS timers
 *      are suspended while the plugin view is closed (documented on-device
 *      learning), so the timer may never fire exactly when gestures run.
 *   2. Event-driven watchdog in onMsg: if _actionInProgress has been held
 *      longer than WATCHDOG_MS, the next motion event force-clears it. The
 *      motion event stream is the one thing guaranteed to keep flowing while
 *      the view is closed. Worst case is one dropped gesture, never a dead
 *      session. An action token (_actionId) makes the hung handler's
 *      finally{} a no-op so it can't clobber a newer action's guard.
 *
 * FINGER events only fire when the plugin UI is dismissed (full-screen RN
 * view intercepts capacitive touches). The listener stays active across UI
 * open/close. The EMR PEN is a separate input plane this does NOT hold for:
 * pen strokes made while the view is up commit ink to the note underneath
 * (B-031). onEventWhileViewOpen() logs that window and, when
 * penWriteGuardEnabled is set, closes the view on sustained pen movement.
 */

import {PluginManager, PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';
import {log} from './debug';
import {loadConfig} from './config';
import {fetchTaskData} from '../cache/taskCache';
import {isViewOpen, getCurrentScreen, markViewOpen, markViewClosed} from './viewState';

// --- Action / tool decoding (matches Diagnostics format) ---
const ACTION_NAMES = {0: 'DOWN', 1: 'UP', 2: 'MOVE', 3: 'CANCEL', 5: 'PTR_DOWN', 6: 'PTR_UP'};
const TOOL_NAMES = {0: '???', 1: 'FINGER', 2: 'PEN'};

function decodeAction(raw) {
  const action = raw & 0xff;
  const ptrIdx = (raw >> 8) & 0xff;
  const name = ACTION_NAMES[action] || String(action);
  return ptrIdx > 0 ? `${name}[${ptrIdx}]` : name;
}

// --- Config ---
const LONG_PRESS_MS = 800;    // Minimum hold time for static long press
const LASSO_HOLD_MS = 400;    // Minimum hold before movement = lasso-add
const MAX_DRIFT_PX = 20;      // Movement threshold to differentiate gestures
const MIN_LASSO_SIZE = 50;    // Minimum bbox dimension to count as valid lasso
const HIT_PADDING_PX = 30;    // Extra padding around link bounds for hit test

// --- Three-finger double tap config ---
const THREE_TAP_WINDOW_MS = 800; // Max time between first and second 3-finger tap
const PEN_COOLDOWN_MS = 1500;    // B-028: palm re-plants between strokes are pen-FREE
                                 // clusters -- poisoning misses them. No tap/swipe may
                                 // fire within this window of any pen activity.
const TAP_MAX_MS = 600;          // A tap cluster is crisp; longer = a resting palm
const SDK_TIMEOUT_MS = 5000;     // Max wait for SDK calls (only works while JS timers run)
const WATCHDOG_MS = 8000;        // Event-driven force-clear of a stuck _actionInProgress

// --- Bezel swipe config (F-021; parameters from design-gesture-audit.md) ---
const BEZEL_ZONE_START = 0.96;      // Bottom 4% of canvas height is the entry zone
const BEZEL_MIN_DISP = 150;         // Min upward travel (px) for 2 fingers
const BEZEL_MIN_DISP_RELAXED = 80;  // Relaxed travel for 3+ fingers (they read shorter)
const BEZEL_MAX_MS = 3500;          // Natural swipes take 1400-2000ms; 1200ms killed 13/13
// --- B-028 palm discrimination ---
const BEZEL_PTR_BAND = 0.60;        // Additional fingers must land in the bottom 40%
                                    // (generous: fingers register staggered 50-150ms,
                                    // a late finger may already be mid-swipe)
const BEZEL_MAX_STEP = 120;         // Max px between consecutive MOVEs that counts as
                                    // motion; bigger = stream switching between contact
                                    // points (palm + finger), ignored for displacement

/** Race a promise against a timeout. Returns null if the timeout fires first.
 * NOTE: JS timers are suspended while the plugin view is closed, so this is
 * best-effort only -- the onMsg watchdog is the guaranteed recovery path. */
function withTimeout(promise, ms = SDK_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

// --- Module state ---
let _sub = null;               // Motion listener subscription
let _fingerDown = null;        // {x, y, time} of last finger DOWN
let _gestureMode = 'off';      // 'off', 'finger', or 'pen-lasso' -- quick-add gesture only
let _actionInProgress = false; // Re-entry guard for async handlers
let _actionStartTime = 0;      // When _actionInProgress was set (watchdog deadline)
let _actionId = 0;             // Token: stale handlers' finally{} must not clear a newer action

// --- Bezel swipe state ---
let _bezelEnabled = false;     // Config-gated (bezelSwipeEnabled), default off
let _threeFingerEnabled = false; // Config-gated (threeFingerTapEnabled), default off --
                               // it fires ANYWHERE on canvas, so it must be opted into (B-028)
let _bezelTracking = null;     // {downY, downTime, maxPointers, minY} or null
let _maxSeenY = 1871;          // Self-calibrating canvas height (A5X/Nomad default;
                               // any device with a taller canvas calibrates on first touch)

// --- Three-finger double tap state ---
// Separate tracking path from long-press/lasso.
// Entered when PTR_DOWN (multi-touch) is detected during a standard gesture.
let _multiTapTracking = null;  // {maxPointers, penSeen, startTime} or null
let _threeFingerTap = null;    // {time} or null -- records first 3-finger tap, awaiting second
let _lastPenTime = 0;          // Last pen event -- gates taps/swipes near writing (B-028)

// --- B-031: pen-through-view diagnostic + guard state ---
let _penGuardEnabled = false;  // Config-gated (penWriteGuardEnabled), default off
let _viewOpenStroke = null;    // {downX, downY, startTime, moveCount, maxTravel} of pen stroke while view open
let _penGuardFiredAt = 0;      // Last guard fire -- throttles repeat closes
const PEN_GUARD_MIN_MOVES = 6;    // Sustained movement = writing; a UI tap with the
const PEN_GUARD_MIN_TRAVEL = 30;  // pen is a few MOVEs with near-zero travel
const PEN_GUARD_REFIRE_MS = 3000;

/**
 * B-031 diagnostic: an event arrived while the plugin view is (believed)
 * open. Logs the evidence and, when the pen-write guard is enabled, closes
 * the view on sustained pen movement so the ink lands on a note the user
 * can see -- it cannot PREVENT the write (no SDK API for that), it converts
 * silent corruption into a visible stroke.
 */
function onEventWhileViewOpen(msg) {
  const baseAction = msg.action & 0xff;
  const screen = getCurrentScreen() || '?';

  if (msg.toolType !== 1) {
    // Keep the B-028 pen cooldown honest across view close: writing that
    // happens while the view is up must still gate taps/swipes after it.
    _lastPenTime = Date.now();

    if (baseAction === 0) {
      _viewOpenStroke = {downX: msg.x, downY: msg.y, startTime: Date.now(), moveCount: 0, maxTravel: 0};
      log('Gesture', `B-031: PEN DOWN (${Math.round(msg.x)},${Math.round(msg.y)}) while view OPEN screen=${screen} -- ink commits to the note underneath`);
    } else if (baseAction === 2 && _viewOpenStroke) {
      _viewOpenStroke.moveCount++;
      const travel = Math.hypot(msg.x - _viewOpenStroke.downX, msg.y - _viewOpenStroke.downY);
      if (travel > _viewOpenStroke.maxTravel) _viewOpenStroke.maxTravel = travel;
      if (_viewOpenStroke.moveCount === 1 || _viewOpenStroke.moveCount % 25 === 0) {
        log('Gesture', `B-031: PEN MOVE #${_viewOpenStroke.moveCount} travel=${Math.round(travel)}px while view OPEN`);
      }
      if (
        _penGuardEnabled &&
        _viewOpenStroke.moveCount >= PEN_GUARD_MIN_MOVES &&
        _viewOpenStroke.maxTravel >= PEN_GUARD_MIN_TRAVEL &&
        Date.now() - _penGuardFiredAt > PEN_GUARD_REFIRE_MS
      ) {
        _penGuardFiredAt = Date.now();
        log('Gesture', `B-031 GUARD: pen writing detected on screen=${screen} (${_viewOpenStroke.moveCount} moves, ${Math.round(_viewOpenStroke.maxTravel)}px) -- closing plugin view`);
        try {
          PluginManager.closePluginView();
          markViewClosed('pen-guard');
        } catch (e) {
          log('Gesture', `B-031 GUARD: closePluginView failed: ${e.message}`);
        }
      }
    } else if ((baseAction === 1 || baseAction === 3) && _viewOpenStroke) {
      const s = _viewOpenStroke;
      _viewOpenStroke = null;
      log('Gesture', `B-031: PEN ${baseAction === 1 ? 'UP' : 'CANCEL'} while view OPEN screen=${screen} -- stroke ${s.moveCount} moves, ${Math.round(s.maxTravel)}px, ${Date.now() - s.startTime}ms`);
    }
    return;
  }

  // Finger while the view is believed open. Per the architecture claim this
  // never happens -- so any line here means the claim is wrong OR the
  // view-state flag went stale through an untracked dismiss path.
  if (baseAction === 0) {
    log('Gesture', `B-031: FINGER DOWN (${Math.round(msg.x)},${Math.round(msg.y)}) while view believed OPEN screen=${screen} -- stale view-state or touch pass-through`);
  }
}

/** Mark an async action as started. Returns a token for endAction(). */
function beginAction() {
  _actionId++;
  _actionInProgress = true;
  _actionStartTime = Date.now();
  return _actionId;
}

/** Clear the action guard -- but only if this handler still owns it. */
function endAction(id) {
  if (id === _actionId) {
    _actionInProgress = false;
  }
}

/**
 * Initialize the gesture detector. Call once at plugin startup.
 * Registers a motion listener for finger events.
 */
export function initGestureDetector() {
  if (_sub) {
    log('Gesture', 'Already initialized');
    return;
  }

  log('Gesture', 'Initializing gesture detector');

  // Load gesture config (quick-add mode + bezel swipe toggle)
  loadConfig().then(config => {
    applyGestureConfig(config);
  }).catch(() => {});

  let _eventCount = 0;
  _sub = PluginManager.registerMotionListener(1, {
    onMsg: (msg) => {
      _eventCount++;

      // B-031: pen strokes made while our full-screen view is up COMMIT ink
      // to the note underneath (the EMR pen is a separate input plane; the
      // view never owned it). The architecture note at the bottom of this
      // header -- "events only fire when the view is dismissed" -- was only
      // ever established for capacitive touch. Whether ANY events arrive
      // while the view is up is exactly what this block answers on-device.
      // Events in this window are never gesture-classified.
      if (isViewOpen()) {
        onEventWhileViewOpen(msg);
        return;
      }

      if (_actionInProgress) {
        // Watchdog: if a handler has been "in progress" past the deadline,
        // its SDK call hung (and withTimeout's timer may be suspended).
        // Force-clear so gestures recover instead of dying for the session.
        if (Date.now() - _actionStartTime > WATCHDOG_MS) {
          log('Gesture', `WATCHDOG: _actionInProgress stuck ${Date.now() - _actionStartTime}ms -- force-clearing`);
          _actionId++; // Invalidate the hung handler's endAction()
          _actionInProgress = false;
        } else {
          return;
        }
      }

      // Only handle finger events (toolType 1)
      if (msg.toolType !== 1) {
        // Pen contact means the user is WRITING, not gesturing. Palm/hand-edge
        // contacts do reach the listener during writing (confirmed on-device
        // 2026-07-24, B-028) and look like multi-touch -- poison any bezel or
        // multi-tap tracking so palm+pen can never open the plugin.
        _lastPenTime = Date.now();
        if (_bezelTracking) {
          log('Gesture', 'PEN during bezel tracking -- cancelled (writing, not swiping)');
          _bezelTracking = null;
        }
        if (_multiTapTracking && !_multiTapTracking.penSeen) {
          log('Gesture', 'PEN during multi-tap tracking -- poisoned (palm + pen writing)');
          _multiTapTracking.penSeen = true;
        }
        if (_fingerDown) {
          if (_gestureMode === 'pen-lasso') {
            // Pen-lasso mode: track pen activity for lasso interception
            if (!_mixedInput) {
              log('Gesture', `PEN during FINGER hold -- tracking pen-lasso-assist`);
              _mixedInput = true;
            }
            _penAssistEvents++;
            const penAction = msg.action & 0xff;
            if (penAction === 1) { // PEN UP
              _penAssistLastUp = Date.now();
              log('Gesture', `PEN UP #${_penAssistEvents} during finger hold (finger held ${Date.now() - _fingerDown.time}ms)`);
            }
          } else {
            // Finger/off mode: pen during finger hold cancels the gesture
            if (!_mixedInput) {
              log('Gesture', `PEN during FINGER hold -- cancelling`);
              _mixedInput = true;
              _mixedCancelTime = Date.now();
            }
          }
        }
        return;
      }

      const action = decodeAction(msg.action);
      const x = Math.round(msg.x);
      const y = Math.round(msg.y);
      const p = msg.pressure?.toFixed(2) ?? '?';
      const ptrs = msg.pointerCount ?? msg.pointers?.length ?? '?';

      // Log every DOWN/UP/CANCEL, every 10th MOVE
      if ((msg.action & 0xff) !== 2 || _eventCount % 10 === 0) {
        log('Gesture', `#${_eventCount} ${action} FINGER (${x},${y}) p=${p} ptrs=${ptrs}`);
      }

      const baseAction = msg.action & 0xff;

      // Self-calibrate canvas height from the event stream (no SDK calls)
      if (msg.y > _maxSeenY) _maxSeenY = msg.y;

      // --- Bezel swipe tracking path ---
      if (_bezelTracking) {
        if (baseAction === 2) {
          // Continuity filter (B-028): a real swipe advances ~60-80px between
          // MOVE events. A bigger jump is the stream switching between contact
          // points, not motion -- track it but never count it as displacement.
          if (Math.abs(msg.y - _bezelTracking.lastY) <= BEZEL_MAX_STEP) {
            if (msg.y < _bezelTracking.minY) _bezelTracking.minY = msg.y;
          }
          _bezelTracking.lastY = msg.y;
        } else if (baseAction === 5) {
          const ptrIdx = (msg.action >> 8) & 0xff;
          // Spatial gate (B-028): all fingers of a real bezel swipe start near
          // the bottom edge. A new contact far above the band is palm+finger.
          if (msg.y < _maxSeenY * BEZEL_PTR_BAND) {
            log('Gesture', `Bezel cancelled: PTR_DOWN[${ptrIdx}] at y=${Math.round(msg.y)} above bottom band`);
            _bezelTracking = null;
          } else {
            _bezelTracking.maxPointers = Math.max(_bezelTracking.maxPointers, ptrIdx + 1);
            _bezelTracking.lastY = msg.y;
          }
        } else if (baseAction === 1 || baseAction === 3) {
          onBezelEnd(msg.y, baseAction === 3);
        }
        return;
      }

      // --- Multi-tap tracking path (three-finger double tap) ---
      if (_multiTapTracking) {
        if (baseAction === 5) {
          const ptrIdx = (msg.action >> 8) & 0xff;
          _multiTapTracking.maxPointers = Math.max(_multiTapTracking.maxPointers, ptrIdx + 1);
          log('Gesture', `Multi-tap: PTR_DOWN[${ptrIdx}], maxPointers=${_multiTapTracking.maxPointers}`);
        } else if (baseAction === 2 || baseAction === 6) {
          // MOVE or PTR_UP -- ignore (fingers drift on e-ink, individual lifts are normal)
        } else if (baseAction === 1 || baseAction === 3) {
          // UP or CANCEL -- all released, evaluate the tap
          onMultiTapEnd();
        }
        return;
      }

      // --- Standard gesture path (long-press / lasso-add) ---
      if (baseAction === 0) {
        onFingerDown(msg.x, msg.y);
      } else if (baseAction === 2) {
        onFingerMove(msg.x, msg.y);
      } else if (baseAction === 1) {
        onFingerUp(msg.x, msg.y);
      } else if (baseAction === 5) {
        // Additional pointer DOWN (multi-touch).
        // Cancel standard gesture, enter multi-tap tracking for three-finger double tap.
        const ptrIdx = (msg.action >> 8) & 0xff;
        if (_fingerDown) {
          log('Gesture', `Multi-touch detected (PTR_DOWN[${ptrIdx}]) -- entering multi-tap tracking`);
          // If pen was already active during this touch (writing, or a native
          // two-finger+pen lasso), carry the poison into multi-tap tracking
          // rather than starting it clean. _mixedInput is pen-set in all modes.
          const penActive = _mixedInput;
          const startTime = _fingerDown.time;
          cancelGesture();
          _multiTapTracking = {maxPointers: ptrIdx + 1, penSeen: penActive, startTime};
        }
      } else if (baseAction === 3) {
        cancelGesture();
      }
    },
  });

  log('Gesture', 'Motion listener registered');
}

/**
 * Clean up the gesture detector.
 */
export function destroyGestureDetector() {
  if (_sub) {
    _sub.remove();
    _sub = null;
  }
  cancelGesture();
  log('Gesture', 'Destroyed');
}

/**
 * Reload gesture config (call after settings change).
 */
export function reloadGestureConfig() {
  loadConfig().then(config => {
    applyGestureConfig(config);
  }).catch(() => {});
}

function applyGestureConfig(config) {
  const input = config?.lassoGestureInput;
  _gestureMode = input === 'pen-lasso' ? 'pen-lasso' : input === 'finger' ? 'finger' : 'off';
  _bezelEnabled = config?.bezelSwipeEnabled === true;
  _threeFingerEnabled = config?.threeFingerTapEnabled === true;
  _penGuardEnabled = config?.penWriteGuardEnabled === true;
  if (_gestureMode === 'off') {
    cancelGesture();
  }
  log('Gesture', `Config: quick-add mode=${_gestureMode}, bezelSwipe=${_bezelEnabled ? 'on' : 'off'}, threeFingerTap=${_threeFingerEnabled ? 'on' : 'off'}, penWriteGuard=${_penGuardEnabled ? 'on' : 'off'} (long press always on)`);
}

// --- Internal handlers ---
// NOTE: setTimeout does NOT fire when the plugin view is closed (JS timers
// are suspended). Long press is detected on the UP event by checking hold
// duration -- per gesture-research.md, long press has ZERO MOVE events.

let _driftExceeded = false;  // Track if finger moved too much (before hold threshold)
let _mixedInput = false;     // Track if pen occurred during hold
let _lassoMode = false;      // Whether we've entered lasso-drawing mode
let _lassoBbox = null;       // {minX, minY, maxX, maxY} bounding box of movement
let _mixedCancelTime = 0;    // Timestamp of last mixed-input cancellation

// --- Pen-lasso-assist probe ---
// Diagnostic: when finger is held and pen events arrive, track pen activity
// so we can probe getLassoElements() on finger UP to test native lasso interception.
let _penAssistEvents = 0;      // Count of PEN events seen during finger hold
let _penAssistLastUp = 0;      // Timestamp of last PEN UP during finger hold

function onFingerDown(x, y) {
  // Suppress new gesture starts shortly after a mixed-input cancellation.
  const MIXED_COOLDOWN_MS = 500;
  if (Date.now() - _mixedCancelTime < MIXED_COOLDOWN_MS) {
    log('Gesture', `DOWN suppressed: within ${MIXED_COOLDOWN_MS}ms of mixed-input cancel`);
    return;
  }

  // Bezel swipe: a DOWN in the bottom edge zone is a swipe candidate, not a
  // long-press/lasso start (nothing linkable lives in the bottom 4%).
  if (_bezelEnabled && y > _maxSeenY * BEZEL_ZONE_START) {
    _bezelTracking = {downY: y, downTime: Date.now(), maxPointers: 1, minY: y, lastY: y};
    log('Gesture', `BEZEL tracking started at y=${Math.round(y)} (zone > ${Math.round(_maxSeenY * BEZEL_ZONE_START)})`);
    return;
  }

  // Pure JS -- no SDK calls here. Link scanning happens post-classification
  // in handleLongPress/handleLassoAdd, so normal touches cost zero bridge calls.
  _fingerDown = {x, y, time: Date.now()};
  _driftExceeded = false;
  _mixedInput = false;
  _lassoMode = false;
  _lassoBbox = null;
  log('Gesture', `DOWN at (${Math.round(x)},${Math.round(y)}) tool=FINGER`);
}

function onFingerMove(x, y) {
  if (!_fingerDown || _mixedInput) return;

  // Quick-add drag-lasso disabled ('off') or pen draws the lasso ('pen-lasso'):
  // finger movement never enters lasso mode, but we still track drift so a
  // moved finger doesn't count as a long press.
  if (_gestureMode !== 'finger') {
    const dx = x - _fingerDown.x;
    const dy = y - _fingerDown.y;
    if (Math.sqrt(dx * dx + dy * dy) > MAX_DRIFT_PX) {
      _driftExceeded = true;
    }
    return;
  }

  // Already in lasso mode -- just extend the bounding box
  if (_lassoMode) {
    _lassoBbox.minX = Math.min(_lassoBbox.minX, x);
    _lassoBbox.minY = Math.min(_lassoBbox.minY, y);
    _lassoBbox.maxX = Math.max(_lassoBbox.maxX, x);
    _lassoBbox.maxY = Math.max(_lassoBbox.maxY, y);
    return;
  }

  const dx = x - _fingerDown.x;
  const dy = y - _fingerDown.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > MAX_DRIFT_PX) {
    const elapsed = Date.now() - _fingerDown.time;

    if (elapsed >= LASSO_HOLD_MS) {
      // Held long enough before moving -- enter lasso-add mode.
      // (The existing-link gate runs in handleLassoAdd, post-classification.)
      _lassoMode = true;
      _lassoBbox = {
        minX: Math.min(_fingerDown.x, x),
        minY: Math.min(_fingerDown.y, y),
        maxX: Math.max(_fingerDown.x, x),
        maxY: Math.max(_fingerDown.y, y),
      };
      log('Gesture', `LASSO MODE entered after ${elapsed}ms hold`);
    } else {
      // Moved too early -- not a gesture, just normal touch
      log('Gesture', `DRIFT: ${Math.round(dist)}px after ${elapsed}ms -- too early for gesture`);
      _driftExceeded = true;
    }
  }
}

function onFingerUp(x, y) {
  if (!_fingerDown) return;

  const held = Date.now() - _fingerDown.time;
  const downX = _fingerDown.x;
  const downY = _fingerDown.y;

  if (_lassoMode && _lassoBbox && !_mixedInput) {
    // Lasso-add gesture: compute final bbox
    _lassoBbox.minX = Math.min(_lassoBbox.minX, x);
    _lassoBbox.minY = Math.min(_lassoBbox.minY, y);
    _lassoBbox.maxX = Math.max(_lassoBbox.maxX, x);
    _lassoBbox.maxY = Math.max(_lassoBbox.maxY, y);

    const w = _lassoBbox.maxX - _lassoBbox.minX;
    const h = _lassoBbox.maxY - _lassoBbox.minY;

    log('Gesture', `LASSO UP: bbox=${Math.round(_lassoBbox.minX)},${Math.round(_lassoBbox.minY)} ${Math.round(w)}x${Math.round(h)} held=${held}ms`);

    if (w >= MIN_LASSO_SIZE && h >= MIN_LASSO_SIZE) {
      log('Gesture', `LASSO-ADD DETECTED: ${Math.round(w)}x${Math.round(h)}px`);
      handleLassoAdd(_lassoBbox, downX, downY);
    } else {
      log('Gesture', `Lasso too small (${Math.round(w)}x${Math.round(h)}), ignoring`);
    }

    resetState();
    return;
  }

  if (_mixedInput) {
    if (_gestureMode === 'pen-lasso' && _penAssistEvents > 0 && _penAssistLastUp > 0) {
      // Pen-lasso mode: finger was held while pen drew a lasso.
      // Check if a native lasso selection is available.
      const sincePenUp = Date.now() - _penAssistLastUp;
      log('Gesture', `PEN-LASSO-ASSIST: finger held ${held}ms, ${_penAssistEvents} pen events, pen UP was ${sincePenUp}ms ago`);
      handlePenLassoAssist();
    } else {
      log('Gesture', `UP ignored: mixed input (mode=${_gestureMode})`);
    }
    resetState();
    return;
  }

  log('Gesture', `UP at (${Math.round(x)},${Math.round(y)}) after ${held}ms drift=${_driftExceeded} mixed=${_mixedInput}`);

  // Static long press: held >= threshold, no drift, no mixed input
  if (held >= LONG_PRESS_MS && !_driftExceeded && !_mixedInput) {
    log('Gesture', `LONG PRESS DETECTED at (${Math.round(downX)},${Math.round(downY)}) held ${held}ms`);
    handleLongPress(downX, downY);
  }

  resetState();
}

function resetState() {
  _fingerDown = null;
  _driftExceeded = false;
  _mixedInput = false;
  _lassoMode = false;
  _lassoBbox = null;
  _penAssistEvents = 0;
  _penAssistLastUp = 0;
}

function cancelGesture() {
  resetState();
  _multiTapTracking = null;
  _bezelTracking = null;
  // Note: _threeFingerTap is NOT cleared here -- it must persist across
  // gesture cycles so the second tap of a double-tap can be detected.
}

// --- Bezel swipe detection (F-021) ---

function isBezelSwipe(maxPointers, downY, minY, downTime) {
  if (!_bezelEnabled || maxPointers < 2) return false;
  const disp = downY - minY;
  const needed = maxPointers >= 3 ? BEZEL_MIN_DISP_RELAXED : BEZEL_MIN_DISP;
  return disp >= needed && Date.now() - downTime <= BEZEL_MAX_MS;
}

function onBezelEnd(finalY, cancelled) {
  const t = _bezelTracking;
  _bezelTracking = null;
  if (!t || cancelled) return;

  // Pen cooldown (B-028): a bezel swipe within 1.5s of pen activity is a
  // hand shuffle around writing, not a deliberate open.
  const sincePen = Date.now() - _lastPenTime;
  if (sincePen < PEN_COOLDOWN_MS) {
    log('Gesture', `Bezel end ignored: pen active ${sincePen}ms ago (writing)`);
    return;
  }

  // Same continuity filter as MOVE: an UP that jumps far from the last
  // tracked position is a contact switch, not swipe travel.
  const minY = Math.abs(finalY - t.lastY) <= BEZEL_MAX_STEP
    ? Math.min(t.minY, finalY)
    : t.minY;
  const duration = Date.now() - t.downTime;
  if (isBezelSwipe(t.maxPointers, t.downY, minY, t.downTime)) {
    log('Gesture', `BEZEL SWIPE DETECTED: ${t.maxPointers} fingers, ${Math.round(t.downY - minY)}px up in ${duration}ms`);
    openTaskHome('bezel swipe');
  } else {
    log('Gesture', `Bezel end: ptrs=${t.maxPointers} disp=${Math.round(t.downY - minY)}px dur=${duration}ms -- not a swipe`);
  }
}

// --- Three-finger double tap detection ---

function onMultiTapEnd() {
  if (!_multiTapTracking) return;

  const {maxPointers, penSeen, startTime} = _multiTapTracking;
  _multiTapTracking = null;

  // Pen was active during this touch cluster: the user was writing (palm +
  // pen) or doing a native pen lasso. Never interpret it as a tap.
  // NOTE: the old "bezel swipe recovery" that reclassified multi-tap ends by
  // upward displacement lived here -- removed after on-device testing
  // (2026-07-24, B-028): with palm + finger contacts far apart, MOVE y-coords
  // jump between contact points, producing phantom 1000px+ "displacement"
  // during normal writing. Indistinguishable from a real swipe, so the
  // recovery path is gone; the primary bezel path (DOWN in the edge zone,
  // confirmed working on-device) is the only trigger.
  if (penSeen) {
    log('Gesture', `Multi-tap end ignored: pen active during touch (writing)`);
    return;
  }

  // Palm re-plants BETWEEN strokes are pen-free clusters that poisoning
  // can't see (on-device 2026-07-24, second B-028 log): two palm plants
  // within 800ms fired a false three-finger double tap mid-page. Real taps
  // don't happen within a beat of writing, and they're crisp -- gate on both.
  const sincePen = Date.now() - _lastPenTime;
  if (sincePen < PEN_COOLDOWN_MS) {
    log('Gesture', `Multi-tap end ignored: pen active ${sincePen}ms ago (palm re-plant between strokes)`);
    return;
  }
  const clusterMs = startTime ? Date.now() - startTime : 0;
  if (clusterMs > TAP_MAX_MS) {
    log('Gesture', `Multi-tap end ignored: cluster lasted ${clusterMs}ms (resting hand, not a tap)`);
    return;
  }

  if (!_threeFingerEnabled) {
    if (maxPointers >= 3) {
      log('Gesture', 'Three-finger tap ignored: disabled in config');
    }
    return;
  }

  if (maxPointers >= 3) {
    if (_threeFingerTap && (Date.now() - _threeFingerTap.time <= THREE_TAP_WINDOW_MS)) {
      // Second 3-finger tap within window -- double tap!
      log('Gesture', `THREE-FINGER DOUBLE TAP DETECTED (${Date.now() - _threeFingerTap.time}ms between taps)`);
      _threeFingerTap = null;
      openTaskHome('three-finger double tap');
    } else {
      // First 3-finger tap (or previous expired) -- record and wait
      _threeFingerTap = {time: Date.now()};
      log('Gesture', `Three-finger tap (first) -- waiting for second within ${THREE_TAP_WINDOW_MS}ms`);
    }
  } else {
    log('Gesture', `Multi-tap ended with ${maxPointers} pointers, ignoring`);
  }
}

// Shared open-task-home action (three-finger double tap + bezel swipe)
async function openTaskHome(trigger) {
  if (_actionInProgress) {
    log('Gesture', `openTaskHome(${trigger}): skipped, action already in progress`);
    return;
  }
  const aid = beginAction();

  try {
    const config = await loadConfig();
    const focusTab = config.defaultTab || 'today';
    log('Gesture', `${trigger} -> tab: ${focusTab}`);
    // Prefetch task data while React mounts (fire-and-forget)
    fetchTaskData().catch(() => {});
    global.__superTaskDeepLink = {action: 'this-page', focusTab};
    openPluginView();
  } catch (e) {
    log('Gesture', `openTaskHome(${trigger}) error: ${e.message}`);
  } finally {
    endAction(aid);
  }
}

// --- Link scan: runs AFTER gesture classification (finger UP), never on DOWN ---
// This is the only place the gesture detector touches the SDK for page data.
// Normal touches never reach here, so writing/scrolling costs zero bridge calls.
//
// F-027 latency fix: link rectangles are cached per (filePath, pageNum). A
// repeat press validates the cache with one cheap getElementCounts call and
// hit-tests in memory, skipping the expensive full-page getElements marshal
// (the source of the "sometimes slow" variance). The cache clears whenever
// the plugin view opens (links only change through plugin actions or manual
// erase; erases are caught by the element-count check).

const LINK_CACHE_MAX = 8; // pages; oldest evicted
const _linkCache = new Map(); // "path|page" -> {links: [{taskId,left,top,right,bottom}], count}

// Exported: App.tsx also clears on toolbar-button opens (they bypass
// openPluginView but equally lead to link-changing plugin actions).
export function clearLinkCache() {
  if (_linkCache.size > 0) _linkCache.clear();
}

function hitTestLinks(links, x, y) {
  for (const l of links) {
    if (
      x >= l.left - HIT_PADDING_PX && x <= l.right + HIT_PADDING_PX &&
      y >= l.top - HIT_PADDING_PX && y <= l.bottom + HIT_PADDING_PX
    ) {
      log('Gesture', `Link scan: hit link -> task ${l.taskId}`);
      return {taskId: l.taskId};
    }
  }
  log('Gesture', `Link scan: no hit among ${links.length} links`);
  return null;
}

async function scanLinksAt(x, y) {
  try {
    const combined = await withTimeout(Promise.all([
      PluginCommAPI.getCurrentFilePath(),
      PluginCommAPI.getCurrentPageNum(),
    ]));

    if (!combined) {
      log('Gesture', 'Link scan: page context timed out');
      return null;
    }
    const [fpResult, pnResult] = combined;

    const filePath = fpResult?.result || '';
    const pageNum = pnResult?.result ?? 0;

    if (!filePath) {
      log('Gesture', 'Link scan: no active note');
      return null;
    }

    // Fast path: cached page whose element count is unchanged
    const cacheKey = `${filePath}|${pageNum}`;
    const cached = _linkCache.get(cacheKey);
    if (cached) {
      const countResult = await withTimeout(PluginFileAPI.getElementCounts(pageNum, filePath));
      if (countResult?.success && countResult.result === cached.count) {
        log('Gesture', `Link scan: cache hit (${cached.links.length} links, ${cached.count} elements unchanged)`);
        return hitTestLinks(cached.links, x, y);
      }
      log('Gesture', 'Link scan: cache stale (element count changed) -- rescanning');
      _linkCache.delete(cacheKey);
    }

    log('Gesture', `Link scan: page ${pageNum} of ${filePath} at (${Math.round(x)},${Math.round(y)})`);

    const elemPromise = PluginFileAPI.getElements(pageNum, filePath);
    const elemResult = await withTimeout(elemPromise);

    if (!elemResult) {
      log('Gesture', 'Link scan: getElements timed out');
      // If the hung call resolves later, recycle its elements -- otherwise
      // every timeout leaks a page's worth of native-side element memory.
      elemPromise.then(r => {
        if (r?.result) recycleAll(r.result);
      }).catch(() => {});
      return null;
    }

    if (!elemResult?.success || !elemResult.result) {
      const errCode = elemResult?.error?.code ?? elemResult?.error ?? 'unknown';
      const errMsg = elemResult?.error?.message ?? '';
      log('Gesture', `Link scan: getElements failed (code=${errCode}${errMsg ? ' msg=' + errMsg : ''} page=${pageNum} success=${elemResult?.success} resultType=${typeof elemResult?.result})`);
      return null;
    }

    // Extract link rectangles, recycle the elements immediately, then cache.
    const elements = elemResult.result;
    const links = [];
    for (const el of elements) {
      const link = el.link;
      if (
        el.type === 600 &&
        link?.destPath?.startsWith('supertask://task/') &&
        link.width > 0 && link.height > 0
      ) {
        links.push({
          taskId: link.destPath.replace('supertask://task/', ''),
          left: link.X,
          top: link.Y,
          right: link.X + link.width,
          bottom: link.Y + link.height,
        });
      }
    }
    const count = elements.length;
    recycleAll(elements);

    if (_linkCache.size >= LINK_CACHE_MAX) {
      _linkCache.delete(_linkCache.keys().next().value); // evict oldest
    }
    _linkCache.set(cacheKey, {links, count});

    if (links.length === 0) {
      log('Gesture', `Link scan: no supertask links on page (cached, ${count} elements)`);
      return null;
    }

    log('Gesture', `Link scan: ${links.length} links (cached, ${count} elements), hit-testing...`);
    return hitTestLinks(links, x, y);
  } catch (e) {
    log('Gesture', `Link scan error: ${e.message}`);
    return null;
  }
}

// --- Pen-lasso-assist action ---
// When finger was held during a pen lasso, check if native lasso data is
// available. If getLassoRect() returns a rect, open QuickAdd.
// If it returns error 904 (no lasso), the user was just writing -- do nothing.

async function handlePenLassoAssist() {
  if (_actionInProgress) {
    log('Gesture', 'handlePenLassoAssist: skipped, action already in progress');
    return;
  }
  const aid = beginAction();

  try {
    // Quick check: is a native lasso selection active?
    // If not (error 904 = no lasso), the user was just writing -- bail silently.
    const rectResult = await withTimeout(PluginCommAPI.getLassoRect());

    if (!rectResult?.success || !rectResult.result) {
      const code = rectResult?.error?.code;
      log('Gesture', `PEN-LASSO-ASSIST: no active lasso (error=${code || 'none'}) -- ignoring`);
      return;
    }

    const rect = rectResult.result;
    log('Gesture', `PEN-LASSO-ASSIST: lasso active at l=${rect.left} t=${rect.top} r=${rect.right} b=${rect.bottom} -- opening QuickAdd`);

    // Open QuickAdd -- it will call getLassoElements() itself
    global.__superTaskDeepLink = {action: 'lasso-add'};
    openPluginView();
  } catch (e) {
    log('Gesture', `handlePenLassoAssist error: ${e.message}`);
  } finally {
    endAction(aid);
  }
}

// --- Long press action ---

async function handleLongPress(x, y) {
  if (_actionInProgress) {
    log('Gesture', 'handleLongPress: skipped, action already in progress');
    return;
  }
  const aid = beginAction();

  try {
    cancelGesture(); // Prevent re-entry

    const result = await scanLinksAt(x, y);
    if (!result) {
      log('Gesture', 'No link at touch point, ignoring');
      return;
    }

    const {taskId} = result;
    log('Gesture', `Matched task: ${taskId}`);

    // Set deep link and open the plugin UI
    global.__superTaskDeepLink = {taskId, action: 'view-task'};
    openPluginView();

  } catch (e) {
    log('Gesture', `Error in handleLongPress: ${e.message}`);
  } finally {
    endAction(aid);
  }
}

// --- Lasso-add action ---

async function handleLassoAdd(bbox, downX, downY) {
  if (_actionInProgress) {
    log('Gesture', 'handleLassoAdd: skipped, action already in progress');
    return;
  }
  const aid = beginAction();

  try {
    // Gate: if the DOWN point sits on an existing supertask link, abort --
    // that content is already captured. Scan runs here (post-classification),
    // so it only costs SDK calls on an actual lasso-add gesture.
    const scanResult = await scanLinksAt(downX, downY);
    if (scanResult?.taskId) {
      log('Gesture', `LASSO-ADD ABORTED: DOWN point on existing task ${scanResult.taskId}`);
      return;
    }

    const rect = {
      left: Math.round(bbox.minX),
      top: Math.round(bbox.minY),
      right: Math.round(bbox.maxX),
      bottom: Math.round(bbox.maxY),
    };

    log('Gesture', `lassoElements rect: l=${rect.left} t=${rect.top} r=${rect.right} b=${rect.bottom}`);

    const result = await withTimeout(PluginCommAPI.lassoElements(rect));
    log('Gesture', `lassoElements result: ${JSON.stringify(result)}`);

    // lassoElements returns {success: true, result: false} when the API call
    // succeeds but nothing was actually selected in the region. Must check both.
    if (!result?.success || result.result === false) {
      log('Gesture', 'lassoElements: no content selected in region');
      return;
    }

    // Open plugin to QuickAdd (same screen as lasso toolbar button 200)
    global.__superTaskDeepLink = {action: 'lasso-add'};
    openPluginView();
  } catch (e) {
    log('Gesture', `handleLassoAdd error: ${e.message}`);
  } finally {
    endAction(aid);
  }
}

function recycleAll(elements) {
  try {
    elements.forEach((el) => {
      if (el.recycle) el.recycle();
    });
  } catch {}
}

async function openPluginView() {
  try {
    // If App is already mounted, navigate directly via the exposed callback.
    // This handles the re-show case where getInitialScreen() won't re-run.
    const deepLink = global.__superTaskDeepLink;
    if (deepLink && global.__superTaskNavigate) {
      global.__superTaskDeepLink = null;
      log('Gesture', `Navigating via __superTaskNavigate: ${deepLink.action} taskId=${deepLink.taskId}`);
      if (deepLink.action === 'view-task' && deepLink.taskId) {
        global.__superTaskNavigate('deep-link-loading', {taskId: deepLink.taskId});
      } else if (deepLink.action === 'lasso-add') {
        global.__superTaskNavigate('capture-lasso');
      } else if (deepLink.action === 'view-project' && deepLink.projectId) {
        global.__superTaskNavigate('project-view', {
          projectId: deepLink.projectId,
          projectName: deepLink.projectName || 'Project',
        });
      } else if (deepLink.action === 'this-page') {
        global.__superTaskNavigate('task-home', {focusTab: deepLink.focusTab || 'today'});
      }
    }
    // If App isn't mounted yet, getInitialScreen() reads the global on mount.

    cancelGesture(); // Clear any in-progress gesture state before showing the view
    clearLinkCache(); // Plugin actions (capture, convert, mark) change page links
    const result = await PluginManager.showPluginView();
    markViewOpen('gesture');
    log('Gesture', `showPluginView result: ${result}`);
  } catch (e) {
    log('Gesture', `showPluginView failed: ${e.message}`);
  }
}
