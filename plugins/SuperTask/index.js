/**
 * SuperTask - Lasso-to-Todoist plugin for Supernote
 *
 * Entry points:
 *   Button 100 (toolbar, NOTE): "Tasks" - open task viewer
 *   Button 200 (lasso, NOTE):   "Add Task" - capture lassoed handwriting
 *   Button 300 (toolbar, DOC):  "Add Task" - capture selected PDF text
 *   Config button:              Settings - API token, default project
 *
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';
import {initGestureDetector} from './src/utils/gestureDetector';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

// Register motion listener at init so long-press gestures work
// even before the plugin UI has ever been opened. The onMsg callback is
// SDK-free (pure JS tracking); SDK calls only run after a gesture is
// classified on finger UP. Config 'off' disables the quick-add lasso
// gesture only (long press + three-finger tap always on) -- no restart needed.
initGestureDetector();

const icon = Image.resolveAssetSource(require('./assets/icon.png')).uri;

// Toolbar in NOTE - opens task viewer. Named 'SuperTask' (not 'Tasks') so the
// plugin is identifiable in the sidebar plugins list among other plugins.
PluginManager.registerButton(1, ['NOTE'], {
  id: 100,
  name: 'SuperTask',
  icon,
  showType: 1,
});

// Lasso toolbar in NOTE - capture handwritten task
PluginManager.registerButton(2, ['NOTE'], {
  id: 200,
  name: 'Add Task',
  icon,
  editDataTypes: [0, 1, 3], // strokes, titles, text
  showType: 1,
});

// Toolbar in DOC - capture selected text as task
PluginManager.registerButton(1, ['DOC'], {
  id: 300,
  name: 'Add Task',
  icon,
  showType: 1,
});

// Config button - settings/API token
PluginManager.registerConfigButton();

// Set initial button ID BEFORE React mounts.
// The config event fires before App.tsx useEffect, so we need
// to capture it here. App.tsx reads this global on mount.
global.__superTaskButtonId = null;

PluginManager.registerButtonListener({
  onButtonPress: (msg) => {
    global.__superTaskButtonId = msg.id;
  },
});

// Config listener: try both callback names (SDK docs say onClick,
// older code used onConfigButtonPress -- belt and suspenders)
PluginManager.registerConfigButtonListener({
  onClick: () => {
    global.__superTaskButtonId = 'config';
  },
  onConfigButtonPress: () => {
    global.__superTaskButtonId = 'config';
  },
});
