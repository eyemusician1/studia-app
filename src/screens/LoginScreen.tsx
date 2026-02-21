import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Animated, Easing, Platform, ActivityIndicator,
  TextInput, KeyboardAvoidingView, StatusBar, Modal, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
};

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

// ─── Toast ───────────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info';

interface ToastConfig {
  type: ToastType;
  title: string;
  message: string;
}

function Toast({ config, onHide }: { config: ToastConfig; onHide: () => void }) {
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;

  const iconMap: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    info: 'i',
  };

  const colorMap: Record<ToastType, string> = {
    success: '#4FD1C5',
    error: '#FF5252',
    info: 'rgba(255,255,255,0.5)',
  };

  const bgMap: Record<ToastType, string> = {
    success: 'rgba(79,209,197,0.1)',
    error: 'rgba(255,82,82,0.1)',
    info: 'rgba(255,255,255,0.05)',
  };

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 12,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();

    // Progress bar drains over 3.5s
    Animated.timing(progress, {
      toValue: 0,
      duration: 3500,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // Auto hide after 3.8s
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -120,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => onHide());
    }, 3800);

    return () => clearTimeout(timer);
  }, []);

  const accentColor = colorMap[config.type];
  const bgColor = bgMap[config.type];
  const icon = iconMap[config.type];

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.toast,
        { transform: [{ translateY }], opacity },
      ]}
    >
      {/* Left accent bar */}
      <View style={[styles.toastAccentBar, { backgroundColor: accentColor }]} />

      {/* Icon */}
      <View style={[styles.toastIconWrap, { backgroundColor: bgColor }]}>
        <Text style={[styles.toastIcon, { color: accentColor }]}>{icon}</Text>
      </View>

      {/* Text */}
      <View style={styles.toastTextWrap}>
        <Text style={styles.toastTitle}>{config.title}</Text>
        <Text style={styles.toastMessage}>{config.message}</Text>
      </View>

      {/* Close */}
      <TouchableOpacity style={styles.toastClose} onPress={onHide}>
        <Text style={styles.toastCloseText}>✕</Text>
      </TouchableOpacity>

      {/* Progress bar */}
      <View style={styles.toastProgressTrack}>
        <Animated.View
          style={[
            styles.toastProgressBar,
            { backgroundColor: accentColor, width: progressWidth },
          ]}
        />
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { signIn, signUp, user } = useAuth();

  const [showForm, setShowForm] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Toast state
  const [toast, setToast] = useState<ToastConfig | null>(null);

  const showToast = useCallback((config: ToastConfig) => {
    setToast(null);
    setTimeout(() => setToast(config), 50);
  }, []);

  // Hero animations
  const wordmarkFade = useRef(new Animated.Value(0)).current;
  const wordmarkScale = useRef(new Animated.Value(0.92)).current;
  const subtitleFade = useRef(new Animated.Value(0)).current;
  const buttonFade = useRef(new Animated.Value(0)).current;

  // Form animations
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslate = useRef(new Animated.Value(60)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;

  // Navigation handled automatically by RootNavigator in App.tsx

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(wordmarkFade, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(wordmarkScale, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(subtitleFade, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(buttonFade, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const openForm = () => {
    setShowForm(true);
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(sheetOpacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(sheetTranslate, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  };

  const closeForm = () => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(sheetOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.timing(sheetTranslate, { toValue: 60, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setShowForm(false);
      setStudentId(''); setFirstName(''); setLastName(''); setPassword('');
      setIsSignUp(false);
      overlayOpacity.setValue(0); sheetTranslate.setValue(60); sheetOpacity.setValue(0);
    });
  };

  const handleSubmit = async () => {
    if (!studentId.trim() || !password.trim()) {
      showToast({ type: 'error', title: 'Missing fields', message: 'Please fill in all required fields.' });
      return;
    }
    if (isSignUp && (!firstName.trim() || !lastName.trim())) {
      showToast({ type: 'error', title: 'Missing fields', message: 'Please enter your first and last name.' });
      return;
    }
    if (password.length < 6) {
      showToast({ type: 'error', title: 'Weak password', message: 'Password must be at least 6 characters.' });
      return;
    }

    const email = `${studentId.trim()}@studia.app`;

    try {
      setIsLoading(true);
      if (isSignUp) {
        await signUp(email, password, firstName.trim(), lastName.trim(), studentId.trim());
        showToast({
          type: 'success',
          title: 'Account created!',
          message: 'Welcome to Studia. You can now sign in.',
        });
        setIsSignUp(false);
        setPassword('');
        setFirstName('');
        setLastName('');
      } else {
        await signIn(email, password);
      }
    } catch (error: any) {
      const msg: string = error.message ?? '';
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('unique')) {
        showToast({ type: 'error', title: 'Already registered', message: 'This Student ID already has an account. Try signing in.' });
      } else if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('credentials')) {
        showToast({ type: 'error', title: 'Invalid credentials', message: 'Check your Student ID and password and try again.' });
      } else {
        showToast({ type: 'error', title: 'Something went wrong', message: msg || 'Please try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.radialGlow} />

      {/* Toast — always on top */}
      {toast && (
        <Toast
          config={toast}
          onHide={() => setToast(null)}
        />
      )}

      {/* Hero */}
      <View style={styles.hero}>
        <Animated.Text style={[styles.wordmark, { opacity: wordmarkFade, transform: [{ scale: wordmarkScale }] }]}>
          Studia
        </Animated.Text>
        <Animated.Text style={[styles.subtitle, { opacity: subtitleFade }]}>
          Learn smarter, not harder
        </Animated.Text>
        <Animated.View style={{ opacity: buttonFade }}>
          <TouchableOpacity style={styles.loginBtn} onPress={openForm} activeOpacity={0.7}>
            <Text style={styles.loginBtnText}>Login to continue</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Animated.Text style={[styles.legalText, { opacity: buttonFade }]}>
        By continuing you agree to our Terms & Privacy Policy
      </Animated.Text>

      {/* Modal form */}
      <Modal visible={showForm} transparent animationType="none" statusBarTranslucent onRequestClose={closeForm}>
        <KeyboardAvoidingView style={styles.modalWrapper} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeForm} />
          </Animated.View>

          {/* Toast inside modal too */}
          {toast && (
            <Toast config={toast} onHide={() => setToast(null)} />
          )}

          <Animated.View style={[styles.formCard, { opacity: sheetOpacity, transform: [{ translateY: sheetTranslate }] }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
              {/* Header */}
              <View style={styles.formHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formTitle}>{isSignUp ? 'Create account' : 'Welcome back'}</Text>
                  <Text style={styles.formSubtitle}>
                    {isSignUp ? 'Register with your student credentials' : 'Sign in with your student ID'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.closeBtn} onPress={closeForm}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />

              <View style={styles.fields}>
                {isSignUp && (
                  <View style={styles.nameRow}>
                    <View style={[styles.fieldWrap, { flex: 1 }]}>
                      <Text style={styles.fieldLabel}>First Name</Text>
                      <TextInput
                        style={styles.fieldInput}
                        placeholder="Juan"
                        placeholderTextColor="rgba(255,255,255,0.18)"
                        value={firstName}
                        onChangeText={setFirstName}
                        autoCapitalize="words"
                      />
                    </View>
                    <View style={[styles.fieldWrap, { flex: 1 }]}>
                      <Text style={styles.fieldLabel}>Last Name</Text>
                      <TextInput
                        style={styles.fieldInput}
                        placeholder="Dela Cruz"
                        placeholderTextColor="rgba(255,255,255,0.18)"
                        value={lastName}
                        onChangeText={setLastName}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>
                )}

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Student ID</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="2026123456"
                    placeholderTextColor="rgba(255,255,255,0.18)"
                    value={studentId}
                    onChangeText={setStudentId}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder={isSignUp ? 'Min. 6 characters' : 'Enter your password'}
                    placeholderTextColor="rgba(255,255,255,0.18)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, isLoading && { opacity: 0.6 }]}
                onPress={handleSubmit}
                activeOpacity={0.75}
                disabled={isLoading}
              >
                {isLoading
                  ? <ActivityIndicator size="small" color="#0E1117" />
                  : <Text style={styles.submitBtnText}>{isSignUp ? 'Create account' : 'Continue'}</Text>
                }
              </TouchableOpacity>

              <View style={styles.formFooter}>
                <TouchableOpacity
                  onPress={() => { setIsSignUp(!isSignUp); setPassword(''); setFirstName(''); setLastName(''); }}
                  disabled={isLoading}
                >
                  <Text style={styles.toggleText}>
                    {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                    <Text style={styles.toggleLink}>{isSignUp ? 'Sign in' : 'Sign up'}</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E1117', justifyContent: 'center', alignItems: 'center' },
  radialGlow: {
    position: 'absolute', width: width * 1.1, height: width * 1.1,
    borderRadius: width * 0.55, backgroundColor: 'rgba(90,120,160,0.06)', alignSelf: 'center',
  },

  // ── Toast ──
  toast: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 40,
    left: 16, right: 16,
    backgroundColor: '#1E2330',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
    zIndex: 9999,
  },
  toastAccentBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 12,
    marginLeft: 4,
  },
  toastIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  toastIcon: { fontSize: 14, fontWeight: '700' },
  toastTextWrap: { flex: 1 },
  toastTitle: {
    fontSize: 14, fontWeight: '700', color: '#FFFFFF', marginBottom: 2,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  toastMessage: {
    fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 17,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  toastClose: {
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
  },
  toastCloseText: { color: 'rgba(255,255,255,0.25)', fontSize: 11, fontWeight: '700' },
  toastProgressTrack: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  toastProgressBar: { height: 2, borderRadius: 1 },

  // ── Hero ──
  hero: { alignItems: 'center', gap: 14 },
  wordmark: {
    fontSize: 96, fontWeight: '700', color: '#FFFFFF', letterSpacing: -4, textAlign: 'center',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }),
  },
  subtitle: {
    fontSize: 15, fontWeight: '400', color: 'rgba(255,255,255,0.42)',
    textAlign: 'center', letterSpacing: 0.2,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  loginBtn: {
    marginTop: 6, paddingVertical: 11, paddingHorizontal: 26, borderRadius: 100,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.05)',
  },
  loginBtnText: {
    fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.78)', letterSpacing: 0.1,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  legalText: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 44 : 28,
    fontSize: 11, color: 'rgba(255,255,255,0.16)', textAlign: 'center',
    paddingHorizontal: 40, lineHeight: 16,
  },

  // ── Modal ──
  modalWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.68)' },
  formCard: {
    width: '100%', backgroundColor: '#181C25', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 24, paddingTop: 24, paddingBottom: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.55, shadowRadius: 48, elevation: 24,
  },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  formTitle: {
    fontSize: 20, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.3,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  formSubtitle: {
    fontSize: 13, color: 'rgba(255,255,255,0.36)', marginTop: 3,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  closeBtnText: { color: 'rgba(255,255,255,0.38)', fontSize: 11, fontWeight: '700' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 20 },
  fields: { gap: 16, marginBottom: 26 },
  nameRow: { flexDirection: 'row', gap: 12 },
  fieldWrap: { gap: 7 },
  fieldLabel: {
    fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.32)',
    letterSpacing: 0.8, textTransform: 'uppercase',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  fieldInput: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', borderRadius: 10,
    paddingVertical: 13, paddingHorizontal: 15, color: '#FFFFFF', fontSize: 15,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  submitBtn: {
    backgroundColor: 'rgba(255,255,255,0.9)', paddingVertical: 15,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  submitBtnText: {
    fontSize: 15, fontWeight: '600', color: '#0E1117', letterSpacing: 0.1,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  formFooter: { alignItems: 'center', marginTop: 16 },
  toggleText: {
    fontSize: 13, color: 'rgba(255,255,255,0.32)',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  toggleLink: { color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
});