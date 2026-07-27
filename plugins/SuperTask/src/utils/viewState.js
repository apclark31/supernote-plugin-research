/**
 * View state -- tracks whether the plugin's full-screen RN view is
 * (believed) open, and which screen is currently showing.
 *
 * Why this exists (B-031): the EMR pen is a separate input plane from
 * capacitive touch. Our full-screen view hides the note but does NOT detach
 * the pen from it -- pen strokes made while any plugin screen is open COMMIT
 * ink to the note underneath (confirmed on-device 2026-07-26). The gesture
 * detector needs to know "is the view up right now?" so it can log every
 * pen event that arrives in that window -- prevention is not possible from
 * JS, so characterising each incident is the best the plugin can do until a
 * native or SDK-level fix exists. There is no SDK query for view
 * visibility, so every open/close path reports here:
 *   open:  button/config press listeners (index.js + App.tsx), App mount,
 *          gestureDetector.openPluginView()
 *   close: closePlugin(), noteOpener intents, App unmount
 *
 * If the system dismisses the view through a path we don't know about, the
 * flag goes stale-open. The B-031 diagnostic logs FINGER events seen while
 * "open" precisely to catch that: per the architecture notes, touch events
 * never arrive while the view is truly up, so finger traffic while the flag
 * is set means either the flag is stale or the touch claim is wrong.
 */
import {log} from './debug';

let _viewOpen = false;
let _currentScreen = null;
let _sessionTab = null;

export function markViewOpen(source) {
  if (!_viewOpen) log('ViewState', `view OPEN (${source})`);
  _viewOpen = true;
}

export function markViewClosed(source) {
  if (_viewOpen) log('ViewState', `view CLOSED (${source})`);
  _viewOpen = false;
  _sessionTab = null; // next open honors the configured default tab (F-038)
}

/**
 * Session tab memory (F-038): the TaskHome tab the user is currently on.
 * TaskHome unmounts whenever another screen pushes over it, so without this
 * a pop back would snap to the configured default mid-workflow. Survives
 * remounts, cleared when the plugin view closes.
 */
export function setSessionTab(tab) {
  _sessionTab = tab;
}

export function getSessionTab() {
  return _sessionTab;
}

export function setCurrentScreen(name) {
  _currentScreen = name;
}

export function isViewOpen() {
  return _viewOpen;
}

export function getCurrentScreen() {
  return _currentScreen;
}
