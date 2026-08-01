import React from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { VaultProvider, useVault } from './src/context/VaultContext';
import AppNavigator from './src/navigation/AppNavigator';

function SecuredApplication() {
  const { recordActivity } = useVault();
  return (
    <View style={{ flex: 1 }} onTouchStart={recordActivity}>
      <AppNavigator />
      <StatusBar style="dark" />
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <VaultProvider>
        <SecuredApplication />
      </VaultProvider>
    </GestureHandlerRootView>
  );
}
