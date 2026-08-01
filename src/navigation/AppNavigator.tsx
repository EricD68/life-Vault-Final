import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useVault } from '../context/VaultContext';
import OnboardingScreen from '../screens/OnboardingScreen';
import UnlockScreen from '../screens/UnlockScreen';
import VaultListScreen from '../screens/VaultListScreen';
import AddEditItemScreen from '../screens/AddEditItemScreen';
import ItemDetailScreen from '../screens/ItemDetailScreen';
import RenewalsScreen from '../screens/RenewalsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import RestoreScreen from '../screens/RestoreScreen';

const Stack = createNativeStackNavigator();
const screenOptions = { headerStyle: { backgroundColor: '#FFFFFF' }, headerTintColor: '#12151A', headerShadowVisible: false };

export default function AppNavigator() {
  const { loading, setupComplete, unlocked } = useVault();
  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator
        key={!setupComplete ? 'setup' : unlocked ? 'unlocked' : 'locked'}
        screenOptions={screenOptions}
      >
        {!setupComplete ? (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Restore" component={RestoreScreen} options={{ title: 'Restore' }} />
          </>
        ) : !unlocked ? (
          <Stack.Screen name="Unlock" component={UnlockScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="VaultList" component={VaultListScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AddEdit" component={AddEditItemScreen} options={{ title: 'Add / Edit' }} />
            <Stack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: 'Details' }} />
            <Stack.Screen name="Renewals" component={RenewalsScreen} options={{ title: 'Renewals' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
            <Stack.Screen name="Restore" component={RestoreScreen} options={{ title: 'Restore' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
