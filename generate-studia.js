const fs = require('fs');
const path = require('path');

// --- File Contents ---

const authContextContent = `import React, { createContext, useContext, useState } from 'react';

type AuthContextType = {
  user: any | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any | null>(null);

  const signInWithGoogle = async () => {
    // Simulating a delay for the loading spinner
    await new Promise(resolve => setTimeout(resolve, 2000));
    setUser({ name: "Student User", email: "student@studia.com" });
    console.log("Mock Sign In Successful");
  };

  const signOut = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
`;

const loginScreenContent = `import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';

const { width, height } = Dimensions.get('window');

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
};

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export default function LoginScreen() {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { signInWithGoogle, user } = useAuth();
  const [isLoading, setIsLoading] = React.useState(false);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (user) {
      navigation.replace('Home');
    }
  }, [user, navigation]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 40,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in error:', error);
      alert('Failed to sign in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0F1419', '#1A1F2E', '#252A3A']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={styles.glowCircle1} />
      <View style={styles.glowCircle2} />

      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
          <Text style={styles.appNameLarge}>Studia</Text>
          <Text style={styles.tagline}>Learn smarter, not harder</Text>
        </Animated.View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
            activeOpacity={0.85}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.termsText}>
            By continuing, you agree to our{'\n'}
            <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1419' },
  gradient: { ...StyleSheet.absoluteFillObject },
  glowCircle1: {
    position: 'absolute',
    width: 600,
    height: 600,
    borderRadius: 300,
    backgroundColor: 'rgba(20, 184, 166, 0.04)',
    top: -250,
    right: -200,
    opacity: 0.5,
  },
  glowCircle2: {
    position: 'absolute',
    width: 500,
    height: 500,
    borderRadius: 250,
    backgroundColor: 'rgba(13, 148, 136, 0.03)',
    bottom: -200,
    left: -150,
    opacity: 0.4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: { alignItems: 'center', marginBottom: height * 0.12 },
  appNameLarge: {
    fontSize: 100,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 16,
    letterSpacing: -3,
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }),
  },
  tagline: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '400',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  buttonContainer: { width: '100%', alignItems: 'center' },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 200,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  termsText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.35)',
    textAlign: 'center',
    marginTop: 32,
    lineHeight: 18,
  },
  termsLink: {
    color: 'rgba(255, 255, 255, 0.5)',
    textDecorationLine: 'underline',
  },
});
`;

const appContent = `import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen, { RootStackParamList } from './src/screens/LoginScreen';
import { View, Text, StyleSheet } from 'react-native';

const Stack = createNativeStackNavigator<RootStackParamList>();

function HomeScreen() {
  const { signOut } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Welcome to Studia!</Text>
      <Text style={styles.subtext} onPress={signOut}>Tap here to Sign Out</Text>
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
        </Stack.Navigator>
        <StatusBar style="light" />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1419', alignItems: 'center', justifyContent: 'center' },
  text: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  subtext: { color: '#14b8a6', marginTop: 20, fontSize: 16 },
});
`;

// --- Execution ---

const createDir = (dir) => {
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
};

const writeFile = (filePath, content) => {
  fs.writeFileSync(filePath, content);
  console.log(`✅ Created file: ${filePath}`);
};

// 1. Create Directories
createDir(path.join(__dirname, 'src', 'context'));
createDir(path.join(__dirname, 'src', 'screens'));

// 2. Write Files
writeFile(path.join(__dirname, 'src', 'context', 'AuthContext.tsx'), authContextContent);
writeFile(path.join(__dirname, 'src', 'screens', 'LoginScreen.tsx'), loginScreenContent);
writeFile(path.join(__dirname, 'App.tsx'), appContent);

console.log("\n🚀 Studia project scaffolded successfully! Run 'npx expo start' to launch.");