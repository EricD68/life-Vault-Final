import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';

import App from './App';

// This app requires a native Android build because the vault security core is Kotlin.
registerRootComponent(App);
