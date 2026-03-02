// src/screens/SettingsScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
  Modal, KeyboardAvoidingView, TextInput, ActivityIndicator, Switch
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';

interface RowProps {
  icon: string;
  label: string;
  onPress?: () => void;
  danger?: boolean;
  colors: any;
}

function Row({ icon, label, onPress, danger, colors }: RowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.rowIcon, danger ? { backgroundColor: colors.dangerDim } : { backgroundColor: colors.accentDim }]}>
        <Feather name={icon as any} size={16} color={danger ? colors.danger : colors.accent} />
      </View>
      <Text style={[styles.rowLabel, danger ? { color: colors.danger } : { color: colors.text }]}>{label}</Text>
      {!danger && <Feather name="chevron-right" size={15} color={colors.textDim} />}
    </TouchableOpacity>
  );
}

type AlertConfig = {
  title: string;
  message: string;
  type: 'info' | 'danger';
  confirmText?: string;
  onConfirm?: () => void;
};

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { theme, toggleTheme, colors } = useTheme();
  const isDark = theme === 'dark';
  
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const showAlert = (config: AlertConfig) => {
    setAlertConfig(config);
    setAlertVisible(true);
  };

  const closeAlert = () => {
    setAlertVisible(false);
    setTimeout(() => setAlertConfig(null), 300); 
  };

  const handleSignOut = () => {
    showAlert({
      title: "Sign out",
      message: "Are you sure you want to sign out of your account? You will need to log back in to access your cloud history.",
      type: "danger",
      confirmText: "Yes, sign out",
      onConfirm: signOut
    });
  };

  const handleClearData = () => {
    showAlert({
      title: "Clear Offline Data",
      message: "Are you sure you want to delete all saved flashcards and quizzes from your phone's offline storage?",
      type: "danger",
      confirmText: "Yes, clear it",
      onConfirm: async () => {
        try {
          await AsyncStorage.removeItem('@studia_history');
          setTimeout(() => {
            showAlert({ title: "Cleared!", message: "Your offline storage has been successfully emptied.", type: "info" });
          }, 400);
        } catch (error) {
          setTimeout(() => {
            showAlert({ title: "Error", message: "Failed to clear offline data.", type: "info" });
          }, 400);
        }
      }
    });
  };

  const handleNotifications = () => {
    showAlert({
      title: "Notifications", 
      message: "Push notifications for daily study reminders will be rolling out in the next major update!",
      type: "info"
    });
  };

  const handleAbout = () => {
    showAlert({ title: "About Studia", message: "Version 1.0.0\n\nStudia is an AI-powered study assistant designed to help you learn smarter, not harder.\n\nDeveloped by Sayr", type: "info" });
  };

  const handlePrivacy = () => {
    showAlert({ title: "Privacy Policy", message: "Your privacy is our priority. Your uploaded documents are processed securely and are never sold to third parties.", type: "info" });
  };

  const closePasswordModal = () => {
    setModalVisible(false);
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) { showAlert({ title: 'Weak Password', message: 'Must be at least 6 characters.', type: 'info' }); return; }
    if (newPassword !== confirmPassword) { showAlert({ title: 'Passwords Mismatch', message: 'Your new passwords do not match.', type: 'info' }); return; }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      closePasswordModal();
      setTimeout(() => showAlert({ title: 'Success', message: 'Password successfully updated!', type: 'info' }), 400);
    } catch (error: any) {
      showAlert({ title: 'Update Failed', message: error.message, type: 'info' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safe}>

        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        </View>

        <View style={styles.body}>

          <Text style={[styles.sectionLabel, { color: colors.textDim }]}>Account & Data</Text>
          <View style={[styles.section, { backgroundColor: colors.sectionBg, borderColor: colors.border }]}>
            <Row icon="lock" label="Change Password" onPress={() => setModalVisible(true)} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Row icon="hard-drive" label="Clear Offline Data" onPress={handleClearData} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Row icon="bell" label="Notifications" onPress={handleNotifications} colors={colors} />
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textDim }]}>App Options</Text>
          <View style={[styles.section, { backgroundColor: colors.sectionBg, borderColor: colors.border }]}>
            
            {/* THEME TOGGLE */}
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: colors.accentDim }]}>
                <Feather name={isDark ? "moon" : "sun"} size={16} color={colors.accent} />
              </View>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Dark Mode</Text>
              <Switch 
                value={isDark} 
                onValueChange={toggleTheme} 
                trackColor={{ false: '#D1D5DB', true: colors.accentDim }}
                thumbColor={isDark ? colors.accent : '#f4f3f4'}
              />
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <Row icon="info" label="About Studia" onPress={handleAbout} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Row icon="shield" label="Privacy Policy" onPress={handlePrivacy} colors={colors} />
          </View>

          <View style={[styles.section, { backgroundColor: colors.dangerDim, borderColor: 'transparent', marginTop: 10 }]}>
            <Row icon="log-out" label="Sign out" onPress={handleSignOut} danger colors={colors} />
          </View>

        </View>
      </SafeAreaView>

      {/* ── Custom Alert Modal ── */}
      <Modal visible={alertVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={closeAlert}>
        <View style={styles.modalWrapper}>
          <TouchableOpacity style={styles.overlay} onPress={closeAlert} activeOpacity={1} />
          
          <View style={[styles.alertCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.alertTitle, { color: colors.text }]}>{alertConfig?.title}</Text>
            <Text style={[styles.alertMessage, { color: colors.textDim }]}>{alertConfig?.message}</Text>

            <View style={styles.alertActionRow}>
              {alertConfig?.type === 'danger' ? (
                <>
                  <TouchableOpacity style={[styles.alertCancelBtn, { borderColor: colors.border }]} onPress={closeAlert} activeOpacity={0.7}>
                    <Text style={[styles.alertCancelText, { color: colors.textDim }]}>No, cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.alertDangerBtn, { backgroundColor: colors.dangerDim, borderColor: colors.danger }]} activeOpacity={0.7} onPress={() => { closeAlert(); if (alertConfig.onConfirm) alertConfig.onConfirm(); }}>
                    <Text style={[styles.alertDangerText, { color: colors.danger }]}>{alertConfig.confirmText}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={[styles.alertPrimaryBtn, { backgroundColor: colors.accent }]} onPress={closeAlert} activeOpacity={0.7}>
                  <Text style={styles.alertPrimaryText}>Got it</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Change Password Modal ── */}
      <Modal visible={modalVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={closePasswordModal}>
        <KeyboardAvoidingView style={styles.modalWrapper} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.overlay} onPress={closePasswordModal} activeOpacity={1} />

          <View style={[styles.formCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={styles.formHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.formTitle, { color: colors.text }]}>Change Password</Text>
                <Text style={[styles.formSubtitle, { color: colors.textDim }]}>Create a new, strong password.</Text>
              </View>
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.border }]} onPress={closePasswordModal}>
                <Text style={[styles.closeBtnText, { color: colors.textDim }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.modalDivider, { backgroundColor: colors.border }]} />

            <View style={styles.fields}>
              <View style={styles.fieldWrap}>
                <Text style={[styles.fieldLabel, { color: colors.textDim }]}>New Password</Text>
                <View style={[styles.passwordContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.passwordInput, { color: colors.text }]}
                    placeholder="Min. 6 characters"
                    placeholderTextColor={colors.textDim}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                    <Feather name={showPassword ? "eye" : "eye-off"} size={18} color={colors.textDim} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.fieldWrap}>
                <Text style={[styles.fieldLabel, { color: colors.textDim }]}>Confirm Password</Text>
                <View style={[styles.passwordContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.passwordInput, { color: colors.text }]}
                    placeholder="Re-type new password"
                    placeholderTextColor={colors.textDim}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.accent }, isLoading && { opacity: 0.6 }]} onPress={handleChangePassword} disabled={isLoading}>
              {isLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.submitBtnText}>Update Password</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 28, gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4, marginLeft: 4, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-bold' }) },
  section: { borderRadius: 16, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 14 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  divider: { height: 1, marginLeft: 64 },
  
  // ── General Modal Styles ──
  modalWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  alertCard: { width: '100%', borderRadius: 24, borderWidth: 1, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 15 },
  alertTitle: { fontSize: 19, fontWeight: '700', marginBottom: 8, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-bold' }) },
  alertMessage: { fontSize: 14, lineHeight: 22, marginBottom: 24, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  alertActionRow: { flexDirection: 'row', gap: 12 },
  alertPrimaryBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  alertPrimaryText: { color: '#FFF', fontSize: 15, fontWeight: '600', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-bold' }) },
  alertCancelBtn: { flex: 1, borderWidth: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  alertCancelText: { fontSize: 14, fontWeight: '600', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  alertDangerBtn: { flex: 1, borderWidth: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  alertDangerText: { fontSize: 14, fontWeight: '600', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-bold' }) },

  // ── Password Form Styles ──
  formCard: { width: '100%', borderRadius: 24, borderWidth: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 28 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  formTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-bold' }) },
  formSubtitle: { fontSize: 13, marginTop: 4, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 12, fontWeight: '800' },
  modalDivider: { height: 1, marginVertical: 20 },
  fields: { gap: 16, marginBottom: 26 },
  fieldWrap: { gap: 8 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-bold' }) },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12 },
  passwordInput: { flex: 1, paddingVertical: 14, paddingHorizontal: 16, fontSize: 15, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  eyeBtn: { padding: 14 },
  submitBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.2, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-bold' }) },
});