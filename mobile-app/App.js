import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import LibraryScreen from './src/screens/LibraryScreen';
import SearchScreen from './src/screens/SearchScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PhotoDetailScreen from './src/screens/PhotoDetailScreen';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const TAB_ICONS = { Library: '🖼️', Search: '🔎', Settings: '⚙️' };

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerTitle: route.name,
        tabBarIcon: () => <Text style={{ fontSize: 18 }}>{TAB_ICONS[route.name]}</Text>,
        tabBarActiveTintColor: '#4f6df5',
      })}
    >
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootStack.Navigator>
          <RootStack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
          <RootStack.Screen name="PhotoDetail" component={PhotoDetailScreen} options={{ headerTitle: '' }} />
        </RootStack.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
