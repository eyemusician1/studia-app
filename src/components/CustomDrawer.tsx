// src/components/CustomDrawer.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

export default function CustomDrawer(props: any) {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  const initials = profile
    ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
    : '?';
  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : 'Student';
  const studentId = profile?.student_id ?? '';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <DrawerContentScrollView {...props} contentContainerStyle={styles.scrollContent}>

        {/* Profile Header */}
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{fullName}</Text>
            <Text style={styles.studentId}>ID: {studentId}</Text>
          </View>
        </View>

        {/* Menu Links */}
        <View style={styles.menuContainer}>
          <DrawerItemList {...props} />
        </View>

      </DrawerContentScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0F0F10',
    borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.05)',
  },
  scrollContent: { paddingTop: 20 },
  profileSection: {
    paddingHorizontal: 20, marginBottom: 30,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(79, 209, 197, 0.12)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(79, 209, 197, 0.25)',
  },
  avatarText: { color: '#4FD1C5', fontSize: 18, fontWeight: '700' },
  profileInfo: { flex: 1 },
  name: { color: '#fff', fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },
  studentId: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 },
  menuContainer: { paddingHorizontal: 10 },
});