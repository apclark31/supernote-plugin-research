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
 * 3. THREE-FINGER DOUBLE TAP -- always active:
 *    - 3+ fingers tap anywhere on the canvas, twice within 800ms
 *    - Opens task home with the user's default tab
 *
 * 4. BEZEL SWIPE (F-021, config-gated, default OFF):
 *    - 2+ fingers swipe up from the bottom edge zone (bottom 4% of canvas)
 *    - Opens task home, same as three-finger double tap
 *    - Parameters from design-gesture-audit.md: natural swipes take
 *      1400-2000ms (max 3500ms), displacement 150px (80px relaxed for 3+
 *      fingers -- 3-finger swipes read shorter). Recovery path: the
 *      digitizer sometimes misreports a multi-finger bezel entry's DOWN
 *      mid-page, which lands in multi-tap tracking -- onMultiTapEnd checks
 *      displacement to reclassify those as bezel swipes.
 *
 * Config (`lassoGestureInput`): 'off' | 'finger' | 'pen-lasso'. Controls ONLY
 * the quick-add gesture (lasso-add / pen-lasso-assist). Long press and
 * three-finger double tap are always active -- they have no false-positive
 * overlap with normal note-taking. Default is 'off': hold-then-drag looks
 * like a paused scroll, so it must be opted into.
 * Config (`bezelSwipeEnabled`): default false. When on, DOWNs in the bottom
 * edge zone are bezel-swipe candidates and are excluded from long-press/
 * lasso-add (they aren't plausible link targets anyway).
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
 * Events only fire when the plugin UI is dismissed (full-screen RN view
 * intercepts all touches). The listener stays active across UI open/close.
 */

import {PluginManager, PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';
import {log} from './debug';
import {loadConfig} from './config';
import {fetchTaskData} from '../cache/taskCache';

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
const SDK_TIMEOUT_MS = 5000;     // Max wait for SDK calls (only works while JS timers run)
const WATCHDOG_MS = 8000;        // Event-driven force-clear of a stuck _actionInProgress

// --- Bezel swipe config (F-021; parameters from design-gesture-audit.md) ---
const BEZEL_ZONE_START = 0.96;      // Bottom 4% of canvas height is the entry zone
const BEZEL_MIN_DISP = 150;         // Min upward travel (px) for 2 fingers
const BEZEL_MIN_DISP_RELAXED = 80;  // Relaxed travel for 3+ fingers (they read shorter)
const BEZEL_MAX_MS = 3500;          // Natural swipes take 1400-2000ms; 1200ms killed 13/13

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
let _bezelTracking = null;     // {downY, downTime, maxPointers, minY} or null
let _maxSeenY = 1871;          // Self-calibrating canvas height (A5X/Nomad default;
                               // any device with a taller canvas calibrates on first touch)

// --- Three-finger double tap state ---
// Separate tracking path from long-press/lasso.
// Entered when PTR_DOWN (multi-touch) is detected during a standard gesture.
let _multiTapTracking = null;  // {maxPointers} or null -- active multi-tap sequence
let _threeFingerTap = null;    // {time} or null -- records first 3-finger tap, awaiting second

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
          if (msg.y < _bezelTracking.minY) _bezelTracking.minY = msg.y;
        } else if (baseAction === 5) {
          const ptrIdx = (msg.action >> 8) & 0xff;
          _bezelTracking.maxPointers = Math.max(_bezelTracking.maxPointers, ptrIdx + 1);
        } else if (baseAction === 1 || baseAction === 3) {
          onBezelEnd(msg.y, baseAction === 3);
        }
        return;
      }

      // --- Multi-tap tracking path (three-finger double tap + bezel recovery) ---
      if (_multiTapTracking) {
        if (baseAction === 5) {
          const ptrIdx = (msg.action >> 8) & 0xff;
          _multiTapTracking.maxPointers = Math.max(_multiTapTracking.maxPointers, ptrIdx + 1);
          log('Gesture', `Multi-tap: PTR_DOWN[${ptrIdx}], maxPointers=${_multiTapTracking.maxPointers}`);
        } else if (baseAction === 2) {
          // Track upward travel for the bezel-swipe recovery path (the
          // digitizer can misreport a bezel entry's DOWN mid-page)
          if (msg.y < _multiTapTracking.minY) _multiTapTracking.minY = msg.y;
        } else if (baseAction === 6) {
          // PTR_UP -- ignore (individual finger lifts are normal)
        } else if (baseAction === 1 || baseAction === 3) {
          // UP or CANCEL -- all released, evaluate the tap
          onMultiTapEnd(msg.y);
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
          const downY = _fingerDown.y;
          const downTime = _fingerDown.time;
          cancelGesture();
          _multiTapTracking = {maxPointers: ptrIdx + 1, downY, downTime, minY: downY};
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
  if (_gestureMode === 'off') {
    cancelGesture();
  }
  log('Gesture', `Config: quick-add mode=${_gestureMode}, bezelSwipe=${_bezelEnabled ? 'on' : 'off'} (long press + three-finger tap always on)`);
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
    _bezelTracking = {downY: y, downTime: Date.now(), maxPointers: 1, minY: y};
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

  const minY = Math.min(t.minY, finalY);
  const duration = Date.now() - t.downTime;
  if (isBezelSwipe(t.maxPointers, t.downY, minY, t.downTime)) {
    log('Gesture', `BEZEL SWIPE DETECTED: ${t.maxPointers} fingers, ${Math.round(t.downY - minY)}px up in ${duration}ms`);
    openTaskHome('bezel swipe');
  } else {
    log('Gesture', `Bezel end: ptrs=${t.maxPointers} disp=${Math.round(t.downY - minY)}px dur=${duration}ms -- not a swipe`);
  }
}

// --- Three-finger double tap detection ---

function onMultiTapEnd(finalY) {
  if (!_multiTapTracking) return;

  const {maxPointers, downY, downTime} = _multiTapTracking;
  const minY = Math.min(_multiTapTracking.minY, finalY ?? _multiTapTracking.minY);
  _multiTapTracking = null;

  // Bezel-swipe recovery: a multi-finger bezel entry whose DOWN was
  // misreported mid-page lands here instead of the bezel path. Taps have
  // near-zero travel, so real upward displacement means it was a swipe.
  if (isBezelSwipe(maxPointers, downY, minY, downTime)) {
    log('Gesture', `BEZEL SWIPE (recovered from multi-tap): ${maxPointers} fingers, ${Math.round(downY - minY)}px up`);
    openTaskHome('bezel swipe (recovered)');
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

    const elements = elemResult.result;
    const stLinks = elements.filter(
      (el) => el.type === 600 && el.link?.destPath?.startsWith('supertask://task/')
    );

    if (stLinks.length === 0) {
      log('Gesture', 'Link scan: no supertask links on page');
      recycleAll(elements);
      return null;
    }

    log('Gesture', `Link scan: ${stLinks.length} links, hit-testing...`);

    // Hit-test against touch point
    for (const el of stLinks) {
      const link = el.link;
      if (link.width > 0 && link.height > 0) {
        const left = link.X - HIT_PADDING_PX;
        const top = link.Y - HIT_PADDING_PX;
        const right = link.X + link.width + HIT_PADDING_PX;
        const bottom = link.Y + link.height + HIT_PADDING_PX;

        if (x >= left && x <= right && y >= top && y <= bottom) {
          const taskId = link.destPath.replace('supertask://task/', '');
          log('Gesture', `Link scan: hit link -> task ${taskId}`);
          recycleAll(elements);
          return {taskId};
        }
      }
    }

    log('Gesture', `Link scan: no hit among ${stLinks.length} links`);
    recycleAll(elements);
    return null;
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
    const result = await PluginManager.showPluginView();
    log('Gesture', `showPluginView result: ${result}`);
  } catch (e) {
    log('Gesture', `showPluginView failed: ${e.message}`);
  }
}
