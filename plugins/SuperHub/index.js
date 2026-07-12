import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

PluginManager.registerButton(1, ['NOTE'], {
  id: 100,
  name: JSON.stringify({
    en: 'SuperHub',
    zh_CN: 'SuperHub',
    zh_TW: 'SuperHub',
    ja: 'SuperHub',
  }),
  icon: Image.resolveAssetSource(require('./assets/icon.png')).uri,
  showType: 1,
});

global.__superHubButtonId = null;

PluginManager.registerButtonListener({
  onButtonPress: (msg) => {
    global.__superHubButtonId = msg.id;
  },
});

PluginManager.registerConfigButton();

PluginManager.registerConfigButtonListener({
  onClick: () => {
    global.__superHubButtonId = 'config';
  },
  onConfigButtonPress: () => {
    global.__superHubButtonId = 'config';
  },
});
