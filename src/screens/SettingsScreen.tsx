// src/screens/SettingsScreen.tsx
import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

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

export default function SettingsScreen() {
  const { signOut } = useAuth();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe}>

        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        <View style={styles.body}>

          {/* Account section */}
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.section}>
            <Row icon="user" label="Profile" />
            <View style={styles.divider} />
            <Row icon="lock" label="Change Password" />
            <View style={styles.divider} />
            <Row icon="bell" label="Notifications" />
          </View>

          {/* App section */}
          <Text style={styles.sectionLabel}>App</Text>
          <View style={styles.section}>
            <Row icon="info" label="About Studia" />
            <View style={styles.divider} />
            <Row icon="shield" label="Privacy Policy" />
          </View>

          {/* Logout */}
          <View style={[styles.section, styles.logoutSection]}>
            <Row icon="log-out" label="Sign out" onPress={signOut} danger />
          </View>

        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0D12',
  },
  safe: { flex: 1 },

  header: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 4,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.4,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }),
  },

  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 8,
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.28)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
    marginLeft: 4,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },

  section: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
    overflow: 'hidden',
  },

  logoutSection: {
    marginTop: 4,
    borderColor: 'rgba(255,82,82,0.15)',
    backgroundColor: 'rgba(255,82,82,0.04)',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: ACCENT_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: {
    backgroundColor: 'rgba(255,82,82,0.10)',
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.82)',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  rowLabelDanger: {
    color: '#FF5252',
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginLeft: 62,
  },
});