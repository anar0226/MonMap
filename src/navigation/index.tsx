import React, { useState } from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSupabase } from '../context/SupabaseContext';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import MapScreen from '../screens/MapScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import SettingsScreen from '../screens/profile/SettingsScreen';
import SavedPlacesScreen from '../screens/profile/SavedPlacesScreen';
import BookingsScreen from '../screens/profile/BookingsScreen';
import WalletScreen from '../screens/profile/WalletScreen';
import ContactScreen from '../screens/profile/ContactScreen';
import AboutScreen from '../screens/profile/AboutScreen';
import HelpScreen from '../screens/profile/HelpScreen';
import FeedbackScreen from '../screens/profile/FeedbackScreen';
import VerifyOtpScreen from '../screens/auth/VerifyOtpScreen';
import PhoneLoginScreen from '../screens/auth/PhoneLoginScreen';
import CompleteProfileScreen from '../screens/auth/CompleteProfileScreen';
import LegalScreen from '../screens/LegalScreen';
import SplashScreen from '../screens/SplashScreen';
import IndoorNavScreen from '../screens/IndoorNavScreen';
import { colors } from '../theme';

type LegalParams = { kind: 'terms' | 'privacy' };

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  PhoneLogin: undefined;
  VerifyOtp: { method: 'email' | 'phone'; identifier: string; fullName?: string };
  Legal: LegalParams;
};

export type AppStackParamList = {
  Map: { focusPlaceId?: string; focusLng?: number; focusLat?: number } | undefined;
  Profile: undefined;
  Settings: undefined;
  SavedPlaces: undefined;
  Bookings: undefined;
  Wallet: undefined;
  Contact: undefined;
  About: undefined;
  Help: undefined;
  Feedback: undefined;
  Legal: LegalParams;
  IndoorNav: {
    venueId:           string;
    destinationNodeId: string;
    destinationName:   string;
    startFloor:        number;
  };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
      <AuthStack.Screen name="VerifyOtp" component={VerifyOtpScreen} />
      <AuthStack.Screen name="Legal" component={LegalScreen} />
    </AuthStack.Navigator>
  );
}

function AppNavigator() {
  return (
    <AppStack.Navigator screenOptions={{ headerShown: false }}>
      <AppStack.Screen name="Map" component={MapScreen} />
      <AppStack.Screen name="Profile" component={ProfileScreen} />
      <AppStack.Screen name="Settings" component={SettingsScreen} />
      <AppStack.Screen name="SavedPlaces" component={SavedPlacesScreen} />
      <AppStack.Screen name="Bookings" component={BookingsScreen} />
      <AppStack.Screen name="Wallet" component={WalletScreen} />
      <AppStack.Screen name="Contact" component={ContactScreen} />
      <AppStack.Screen name="About" component={AboutScreen} />
      <AppStack.Screen name="Help" component={HelpScreen} />
      <AppStack.Screen name="Feedback" component={FeedbackScreen} />
      <AppStack.Screen name="Legal" component={LegalScreen} />
      <AppStack.Screen name="IndoorNav" component={IndoorNavScreen} />
    </AppStack.Navigator>
  );
}

export default function RootNavigator() {
  const { session, isLoading, needsName } = useSupabase();
  const [isSplashAnimationDone, setIsSplashAnimationDone] = useState(false);

  const isReady = !isLoading && isSplashAnimationDone;

  if (!isReady) {
    return (
      <SplashScreen onFinish={() => setIsSplashAnimationDone(true)} />
    );
  }

  if (session && needsName) {
    return <CompleteProfileScreen />;
  }

  return (
    <NavigationContainer>
      {session ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
