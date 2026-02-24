// src/screens/SettingsScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar,
  Modal, KeyboardAvoidingView, TextInput, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCENT = '#3B6FD4';
const ACCENT_DIM = 'rgba(59,111,212,0.10)';
const ACCENT_BORDER = 'rgba(59,111,212,0.22)';

interface RowProps {
  icon: string;
  label: string;
  onPress?: () => void;
  danger?: boolean;
}

function Row({ icon, label, onPress, danger }: RowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Feather name={icon as any} size={16} color={danger ? '#FF5252' : ACCENT} />
      </View>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      {!danger && <Feather name="chevron-right" size={15} color="rgba(255,255,255,0.18)" />}
    </TouchableOpacity>
  );
}

// Custom Alert Configuration Type
type AlertConfig = {
  title: string;
  message: string;
  type: 'info' | 'danger';
  confirmText?: string;
  onConfirm?: () => void;
};

export default function SettingsScreen() {
  const { signOut } = useAuth();
  
  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);

  // Password Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // ─── Custom Alert Helper ───
  const showAlert = (config: AlertConfig) => {
    setAlertConfig(config);
    setAlertVisible(true);
  };

  const closeAlert = () => {
    setAlertVisible(false);
    setTimeout(() => setAlertConfig(null), 300); // Clear after animation
  };

  // ─── Handlers for Settings Options ───
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
          // Show a success info alert right after
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
    showAlert({
      title: "About Studia", 
      message: "Version 1.0.0\n\nStudia is an AI-powered study assistant designed to help you learn smarter, not harder.\n\nDeveloped by Sayr",
      type: "info"
    });
  };

  const handlePrivacy = () => {
    showAlert({
      title: "Privacy Policy", 
      message: "Your privacy is our priority. Your uploaded documents are processed securely and are never sold to third parties.",
      type: "info"
    });
  };

  // ─── Change Password Logic ───
  const closePasswordModal = () => {
    setModalVisible(false);
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      showAlert({ title: 'Weak Password', message: 'Your new password must be at least 6 characters long.', type: 'info' });
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert({ title: 'Passwords Mismatch', message: 'Your new passwords do not match. Please try again.', type: 'info' });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;
      
      closePasswordModal();
      setTimeout(() => {
        showAlert({ title: 'Success', message: 'Your password has been successfully updated!', type: 'info' });
      }, 400);
    } catch (error: any) {
      showAlert({ title: 'Update Failed', message: error.message || 'Something went wrong. Please try again.', type: 'info' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe}>

        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        <View style={styles.body}>

          {/* Account section */}
          <Text style={styles.sectionLabel}>Account & Data</Text>
          <View style={styles.section}>
            <Row icon="lock" label="Change Password" onPress={() => setModalVisible(true)} />
            <View style={styles.divider} />
            <Row icon="hard-drive" label="Clear Offline Data" onPress={handleClearData} />
            <View style={styles.divider} />
            <Row icon="bell" label="Notifications" onPress={handleNotifications} />
          </View>

          {/* App section */}
          <Text style={styles.sectionLabel}>App</Text>
          <View style={styles.section}>
            <Row icon="info" label="About Studia" onPress={handleAbout} />
            <View style={styles.divider} />
            <Row icon="shield" label="Privacy Policy" onPress={handlePrivacy} />
          </View>

          {/* Logout */}
          <View style={[styles.section, styles.logoutSection]}>
            <Row icon="log-out" label="Sign out" onPress={handleSignOut} danger />
          </View>

        </View>

      </SafeAreaView>

      {/* ── Custom Alert Modal ── */}
      <Modal visible={alertVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={closeAlert}>
        <View style={styles.modalWrapper}>
          <TouchableOpacity style={styles.overlay} onPress={closeAlert} activeOpacity={1} />
          
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>{alertConfig?.title}</Text>
            <Text style={styles.alertMessage}>{alertConfig?.message}</Text>

            <View style={styles.alertActionRow}>
              {alertConfig?.type === 'danger' ? (
                <>
                  <TouchableOpacity style={styles.alertCancelBtn} onPress={closeAlert} activeOpacity={0.7}>
                    <Text style={styles.alertCancelText}>No, cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.alertDangerBtn} 
                    activeOpacity={0.7}
                    onPress={() => {
                      closeAlert();
                      if (alertConfig.onConfirm) alertConfig.onConfirm();
                    }}
                  >
                    <Text style={styles.alertDangerText}>{alertConfig.confirmText}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.alertPrimaryBtn} onPress={closeAlert} activeOpacity={0.7}>
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

          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>Change Password</Text>
                <Text style={styles.formSubtitle}>Create a new, strong password.</Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={closePasswordModal}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.fields}>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>New Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Min. 6 characters"
                    placeholderTextColor="rgba(255,255,255,0.18)"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)} activeOpacity={0.7}>
                    <Feather name={showPassword ? "eye" : "eye-off"} size={18} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Confirm Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Re-type new password"
                    placeholderTextColor="rgba(255,255,255,0.18)"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.submitBtn, isLoading && { opacity: 0.6 }]} 
              onPress={handleChangePassword} 
              activeOpacity={0.75} 
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#0E1117" />
              ) : (
                <Text style={styles.submitBtnText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0D12' },
  safe: { flex: 1 },

  header: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 4 },
  title: { fontSize: 19, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.4, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },

  body: { flex: 1, paddingHorizontal: 24, paddingTop: 28, gap: 8 },

  sectionLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.28)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4, marginLeft: 4, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  section: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 16, overflow: 'hidden' },
  logoutSection: { marginTop: 4, borderColor: 'rgba(255,82,82,0.15)', backgroundColor: 'rgba(255,82,82,0.04)' },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 14 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: ACCENT_DIM, alignItems: 'center', justifyContent: 'center' },
  rowIconDanger: { backgroundColor: 'rgba(255,82,82,0.10)' },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.82)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  rowLabelDanger: { color: '#FF5252' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 62 },

  // ── General Modal Styles ──
  modalWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.68)' },
  
  // ── Custom Alert Styles ──
  alertCard: { 
    width: '100%', backgroundColor: '#181C25', borderRadius: 20, 
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', 
    padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 24 }, 
    shadowOpacity: 0.55, shadowRadius: 48, elevation: 24 
  },
  alertTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 10, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  alertMessage: { fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 22, marginBottom: 24, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  alertActionRow: { flexDirection: 'row', gap: 12 },
  
  alertPrimaryBtn: { flex: 1, backgroundColor: ACCENT, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  alertPrimaryText: { color: '#FFF', fontSize: 14, fontWeight: '600', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  
  alertCancelBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  alertCancelText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  
  alertDangerBtn: { flex: 1, backgroundColor: 'rgba(255,82,82,0.15)', borderWidth: 1, borderColor: 'rgba(255,82,82,0.3)', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  alertDangerText: { color: '#FF5252', fontSize: 14, fontWeight: '600', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },

  // ── Password Form Styles ──
  formCard: { 
    width: '100%', backgroundColor: '#181C25', borderRadius: 20, 
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', 
    paddingHorizontal: 24, paddingTop: 24, paddingBottom: 28, 
  },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  formTitle: { fontSize: 20, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.3, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  formSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.36)', marginTop: 3, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  closeBtnText: { color: 'rgba(255,255,255,0.38)', fontSize: 11, fontWeight: '700' },
  modalDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 20 },
  
  fields: { gap: 16, marginBottom: 26 },
  fieldWrap: { gap: 7 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.32)', letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 10 },
  passwordInput: { flex: 1, paddingVertical: 13, paddingHorizontal: 15, color: '#FFFFFF', fontSize: 15, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  eyeBtn: { padding: 13 },

  submitBtn: { backgroundColor: 'rgba(255,255,255,0.9)', paddingVertical: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { fontSize: 15, fontWeight: '600', color: '#0E1117', letterSpacing: 0.1, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
});