// src/screens/LoginScreen.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Animated, Easing, Platform, ActivityIndicator,
  TextInput, KeyboardAvoidingView, StatusBar, Modal, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext'; // <-- NEW IMPORT

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
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;

  const iconMap: Record<ToastType, string> = { success: '✓', error: '✕', info: 'i' };
  const colorMap: Record<ToastType, string> = { success: colors.success, error: colors.danger, info: colors.accent };
  const bgMap: Record<ToastType, string> = { success: colors.success + '1A', error: colors.danger + '1A', info: colors.accentDim };

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

    Animated.timing(progress, { toValue: 0, duration: 3500, easing: Easing.linear, useNativeDriver: false }).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -120, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => onHide());
    }, 3800);

    return () => clearTimeout(timer);
  }, []);

  const accentColor = colorMap[config.type];
  const bgColor = bgMap[config.type];
  const icon = iconMap[config.type];
  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Animated.View style={[
      { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 40, left: 16, right: 16, backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingRight: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.4 : 0.1, shadowRadius: 20, elevation: 20, zIndex: 9999 },
      { transform: [{ translateY }], opacity }
    ]}>
      <View style={[{ width: 4, alignSelf: 'stretch', borderRadius: 2, marginRight: 12, marginLeft: 4 }, { backgroundColor: accentColor }]} />
      <View style={[{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, { backgroundColor: bgColor }]}>
        <Text style={[{ fontSize: 14, fontWeight: '700' }, { color: accentColor }]}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) }}>{config.title}</Text>
        <Text style={{ fontSize: 12, color: colors.textDim, lineHeight: 17, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) }}>{config.message}</Text>
      </View>
      <TouchableOpacity style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }} onPress={onHide}>
        <Text style={{ color: colors.textDim, fontSize: 11, fontWeight: '700' }}>✕</Text>
      </TouchableOpacity>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: colors.border }}>
        <Animated.View style={[{ height: 2, borderRadius: 1 }, { backgroundColor: accentColor, width: progressWidth }]} />
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const styles = useStyles(); // <-- NEW: Dynamic Styles
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';
  
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { signIn, signUp, user } = useAuth();

  const [showForm, setShowForm] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<ToastConfig | null>(null);

  const showToast = useCallback((config: ToastConfig) => {
    setToast(null);
    setTimeout(() => setToast(config), 50);
  }, []);

  const wordmarkFade = useRef(new Animated.Value(0)).current;
  const wordmarkScale = useRef(new Animated.Value(0.92)).current;
  const subtitleFade = useRef(new Animated.Value(0)).current;
  const buttonFade = useRef(new Animated.Value(0)).current;

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslate = useRef(new Animated.Value(60)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;

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
      setIsSignUp(false); setShowPassword(false);
      overlayOpacity.setValue(0); sheetTranslate.setValue(60); sheetOpacity.setValue(0);
    });
  };

  const handleSubmit = async () => {
    if (!studentId.trim() || !password.trim()) {
      showToast({ type: 'error', title: 'Missing fields', message: 'Please fill in all required fields.' }); return;
    }
    if (isSignUp && (!firstName.trim() || !lastName.trim())) {
      showToast({ type: 'error', title: 'Missing fields', message: 'Please enter your first and last name.' }); return;
    }
    if (password.length < 6) {
      showToast({ type: 'error', title: 'Weak password', message: 'Password must be at least 6 characters.' }); return;
    }

    const email = `${studentId.trim()}@studia.app`;
    try {
      setIsLoading(true);
      if (isSignUp) {
        await signUp(email, password, firstName.trim(), lastName.trim(), studentId.trim());
        showToast({ type: 'success', title: 'Account created!', message: 'Welcome to Studia. You can now sign in.' });
        setIsSignUp(false); setPassword(''); setFirstName(''); setLastName('');
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
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View style={styles.radialGlow} />

      {toast && <Toast config={toast} onHide={() => setToast(null)} />}

      <View style={styles.hero}>
        <Animated.Text style={[styles.wordmark, { opacity: wordmarkFade, transform: [{ scale: wordmarkScale }] }]}>Studia</Animated.Text>
        <Animated.Text style={[styles.subtitle, { opacity: subtitleFade }]}>Learn smarter, not harder</Animated.Text>
        <Animated.View style={{ opacity: buttonFade }}>
          <TouchableOpacity style={styles.loginBtn} onPress={openForm} activeOpacity={0.7}>
            <Text style={styles.loginBtnText}>Login to continue</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Animated.Text style={[styles.legalText, { opacity: buttonFade }]}>
        By continuing you agree to our Terms & Privacy Policy
      </Animated.Text>

      <Modal visible={showForm} transparent animationType="none" statusBarTranslucent onRequestClose={closeForm}>
        <KeyboardAvoidingView style={styles.modalWrapper} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeForm} />
          </Animated.View>

          {toast && <Toast config={toast} onHide={() => setToast(null)} />}

          <Animated.View style={[styles.formCard, { opacity: sheetOpacity, transform: [{ translateY: sheetTranslate }] }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
              <View style={styles.formHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formTitle}>{isSignUp ? 'Create account' : 'Welcome back'}</Text>
                  <Text style={styles.formSubtitle}>{isSignUp ? 'Register with your student credentials' : 'Sign in with your student ID'}</Text>
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
                      <TextInput style={styles.fieldInput} placeholder="Juan" placeholderTextColor={colors.textDim} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
                    </View>
                    <View style={[styles.fieldWrap, { flex: 1 }]}>
                      <Text style={styles.fieldLabel}>Last Name</Text>
                      <TextInput style={styles.fieldInput} placeholder="Dela Cruz" placeholderTextColor={colors.textDim} value={lastName} onChangeText={setLastName} autoCapitalize="words" />
                    </View>
                  </View>
                )}

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Student ID</Text>
                  <TextInput style={styles.fieldInput} placeholder="2026123456" placeholderTextColor={colors.textDim} value={studentId} onChangeText={setStudentId} autoCapitalize="none" autoCorrect={false} />
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder={isSignUp ? 'Min. 6 characters' : 'Enter your password'}
                      placeholderTextColor={colors.textDim}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)} activeOpacity={0.7}>
                      <Feather name={showPassword ? "eye" : "eye-off"} size={18} color={colors.textDim} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <TouchableOpacity style={[styles.submitBtn, isLoading && { opacity: 0.6 }]} onPress={handleSubmit} activeOpacity={0.75} disabled={isLoading}>
                {isLoading ? <ActivityIndicator size="small" color={isDark ? "#0E1117" : "#FFFFFF"} /> : <Text style={styles.submitBtnText}>{isSignUp ? 'Create account' : 'Continue'}</Text>}
              </TouchableOpacity>

              <View style={styles.formFooter}>
                <TouchableOpacity onPress={() => { setIsSignUp(!isSignUp); setPassword(''); setFirstName(''); setLastName(''); setShowPassword(false); }} disabled={isLoading}>
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

// --- NEW: DYNAMIC STYLES ---
const useStyles = () => {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
    radialGlow: { position: 'absolute', width: width * 1.1, height: width * 1.1, borderRadius: width * 0.55, backgroundColor: colors.accentDim, alignSelf: 'center' },

    hero: { alignItems: 'center', gap: 14 },
    wordmark: { fontSize: 96, fontWeight: '700', color: colors.text, letterSpacing: -4, textAlign: 'center', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
    subtitle: { fontSize: 15, fontWeight: '400', color: colors.textDim, textAlign: 'center', letterSpacing: 0.2, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    loginBtn: { marginTop: 6, paddingVertical: 11, paddingHorizontal: 26, borderRadius: 100, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.2)' : colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.cardBg },
    loginBtnText: { fontSize: 14, fontWeight: '500', color: colors.text, letterSpacing: 0.1, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    legalText: { position: 'absolute', bottom: Platform.OS === 'ios' ? 44 : 28, fontSize: 11, color: isDark ? 'rgba(255,255,255,0.16)' : colors.textDim, textAlign: 'center', paddingHorizontal: 40, lineHeight: 16 },

    modalWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.68)' },
    formCard: { width: '100%', backgroundColor: colors.cardBg, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 24 }, shadowOpacity: isDark ? 0.55 : 0.1, shadowRadius: 48, elevation: 24 },
    
    formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    formTitle: { fontSize: 20, fontWeight: '600', color: colors.text, letterSpacing: -0.3, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    formSubtitle: { fontSize: 13, color: colors.textDim, marginTop: 3, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : colors.background, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    closeBtnText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 20 },
    
    fields: { gap: 16, marginBottom: 26 },
    nameRow: { flexDirection: 'row', gap: 12 },
    fieldWrap: { gap: 7 },
    fieldLabel: { fontSize: 11, fontWeight: '600', color: colors.textDim, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    fieldInput: { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 15, color: colors.text, fontSize: 15, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    
    passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
    passwordInput: { flex: 1, paddingVertical: 13, paddingHorizontal: 15, color: colors.text, fontSize: 15, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    eyeBtn: { padding: 13 },

    submitBtn: { backgroundColor: colors.text, paddingVertical: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    submitBtnText: { fontSize: 15, fontWeight: '600', color: colors.background, letterSpacing: 0.1, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    formFooter: { alignItems: 'center', marginTop: 16 },
    toggleText: { fontSize: 13, color: colors.textDim, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    toggleLink: { color: colors.text, fontWeight: '600' },
  });
};