import {PluginManager} from 'sn-plugin-lib';
import {log} from './debug';
import {markViewClosed} from './viewState';

/**
 * Close the plugin view.
 * Gesture re-enable is handled automatically by the platform: the RN view
 * intercepts all touches while visible, so the motion listener naturally
 * resumes receiving events when the view is dismissed.
 */
export function closePlugin() {
  log('App', 'Closing plugin view');
  PluginManager.closePluginView();
  markViewClosed('closePlugin');
}
