// App.tsx
import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Platform, View } from 'react-native';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const ACCENT = '#3B6FD4';
const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const tabIcons: Record<string, string> = {
  Home:     'home',
  History:  'clock',
  Profile:  'user',
  Settings: 'settings',
};

function DashboardNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0F1014',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.055)',
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 10,
        },
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.25)',
        tabBarShowLabel: false,
        tabBarIcon: ({ color, focused }) => (
          <View style={[tabStyles.wrap, focused && tabStyles.wrapActive]}>
            <Feather name={tabIcons[route.name] as any} size={21} color={color} />
          </View>
        ),
      })}
    >
      <Tab.Screen name="Home"     component={HomeScreen} />
      <Tab.Screen name="History"  component={HistoryScreen} />
      <Tab.Screen name="Profile"  component={ProfileScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const tabStyles = {
  wrap: {
    width: 44, height: 34, borderRadius: 11,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  wrapActive: {
    backgroundColor: 'rgba(59,111,212,0.12)',
  },
};

function RootNavigator() {
  const { user } = useAuth();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {user ? (
        <Stack.Screen name="Dashboard" component={DashboardNavigator} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
          <StatusBar style="light" />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}