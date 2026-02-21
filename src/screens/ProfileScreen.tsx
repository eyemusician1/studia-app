// src/screens/ProfileScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const ACCENT        = '#3B6FD4';
const ACCENT_DIM    = 'rgba(59,111,212,0.10)';
const ACCENT_BORDER = 'rgba(59,111,212,0.22)';
const CARD_BG       = 'rgba(255,255,255,0.035)';
const SUCCESS       = '#34C78A';

export default function ProfileScreen() {
  const { profile, user } = useAuth();
  const [stats, setStats] = useState({
    totalDocs: 0,
    totalFlashcards: 0,
    totalQuizzes: 0,
    totalConcepts: 0,
  });
  const [loading, setLoading] = useState(true);

  const initials = profile
    ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
    : '?';
  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : 'Student';

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const { data } = await supabase
      .from('study_results')
      .select('flashcards, quiz, key_concepts')
      .eq('user_id', user?.id);

    if (data) {
      setStats({
        totalDocs:       data.length,
        totalFlashcards: data.reduce((s, r) => s + (r.flashcards?.length ?? 0), 0),
        totalQuizzes:    data.reduce((s, r) => s + (r.quiz?.length ?? 0), 0),
        totalConcepts:   data.reduce((s, r) => s + (r.key_concepts?.length ?? 0), 0),
      });
    }
    setLoading(false);
  };

  const statItems = [
    { label: 'Documents',  value: stats.totalDocs,       icon: 'file-text' },
    { label: 'Flashcards', value: stats.totalFlashcards, icon: 'layers' },
    { label: 'Quiz items', value: stats.totalQuizzes,    icon: 'check-square' },
    { label: 'Concepts',   value: stats.totalConcepts,   icon: 'tag' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.glow} />

      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Profile</Text>
          </View>

          {/* Avatar card */}
          <View style={styles.avatarCard}>
            <View style={styles.avatarRing}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.fullName}>{fullName}</Text>
            <Text style={styles.studentId}>ID: {profile?.student_id ?? '—'}</Text>

            {/* Active badge */}
            <View style={styles.activeBadge}>
              <View style={styles.activeDot} />
              <Text style={styles.activeBadgeText}>Active learner</Text>
            </View>
          </View>

          {/* Stats grid */}
          <Text style={styles.sectionLabel}>Your stats</Text>
          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ marginTop: 20 }} />
          ) : (
            <View style={styles.statsGrid}>
              {statItems.map((item, i) => (
                <View key={i} style={styles.statCard}>
                  <View style={styles.statIconWrap}>
                    <Feather name={item.icon as any} size={16} color={ACCENT} />
                  </View>
                  <Text style={styles.statValue}>{item.value}</Text>
                  <Text style={styles.statLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Info section */}
          <Text style={styles.sectionLabel}>Account info</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}>
                <Feather name="user" size={14} color={ACCENT} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Full name</Text>
                <Text style={styles.infoValue}>{fullName}</Text>
              </View>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}>
                <Feather name="hash" size={14} color={ACCENT} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Student ID</Text>
                <Text style={styles.infoValue}>{profile?.student_id ?? '—'}</Text>
              </View>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}>
                <Feather name="mail" size={14} color={ACCENT} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{user?.email ?? '—'}</Text>
              </View>
            </View>
          </View>

          {/* Achievement strip */}
          <Text style={styles.sectionLabel}>Achievements</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgeScroll}>
            {[
              { icon: 'upload-cloud', label: 'First upload',   unlocked: stats.totalDocs >= 1 },
              { icon: 'layers',       label: '10 flashcards',  unlocked: stats.totalFlashcards >= 10 },
              { icon: 'check-circle', label: '5 quiz items',   unlocked: stats.totalQuizzes >= 5 },
              { icon: 'star',         label: '5 documents',    unlocked: stats.totalDocs >= 5 },
              { icon: 'award',        label: '50 flashcards',  unlocked: stats.totalFlashcards >= 50 },
            ].map((badge, i) => (
              <View key={i} style={[styles.badge, !badge.unlocked && styles.badgeLocked]}>
                <Feather
                  name={badge.icon as any}
                  size={22}
                  color={badge.unlocked ? ACCENT : 'rgba(255,255,255,0.15)'}
                />
                <Text style={[styles.badgeLabel, !badge.unlocked && styles.badgeLabelLocked]}>
                  {badge.label}
                </Text>
                {badge.unlocked && (
                  <View style={styles.unlockedDot} />
                )}
              </View>
            ))}
          </ScrollView>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0C0D12' },
  glow: {
    position: 'absolute', width: 480, height: 480, borderRadius: 240,
    backgroundColor: 'rgba(59,111,212,0.04)', top: -140, alignSelf: 'center',
  },
  safe:        { flex: 1 },
  scroll:      { paddingBottom: 48 },

  header: {
    paddingHorizontal: 24, paddingTop: 14, paddingBottom: 4,
  },
  title: {
    fontSize: 19, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.4,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }),
  },

  // Avatar card
  avatarCard: {
    margin: 24, marginTop: 16,
    backgroundColor: CARD_BG, borderRadius: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', paddingVertical: 32, gap: 8,
  },
  avatarRing: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: ACCENT_DIM, borderWidth: 2, borderColor: ACCENT_BORDER,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  avatarText: {
    fontSize: 26, fontWeight: '700', color: ACCENT,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }),
  },
  fullName: {
    fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }),
  },
  studentId: {
    fontSize: 12, color: 'rgba(255,255,255,0.35)',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4, backgroundColor: 'rgba(52,199,138,0.10)',
    borderWidth: 1, borderColor: 'rgba(52,199,138,0.2)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
  },
  activeDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: SUCCESS,
  },
  activeBadgeText: {
    fontSize: 11, fontWeight: '600', color: SUCCESS,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },

  sectionLabel: {
    fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.28)',
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginLeft: 24, marginBottom: 10, marginTop: 4,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 24, gap: 10, marginBottom: 24,
  },
  statCard: {
    flex: 1, minWidth: '44%',
    backgroundColor: CARD_BG, borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    padding: 16, alignItems: 'flex-start', gap: 8,
  },
  statIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: {
    fontSize: 26, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.5,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }),
  },
  statLabel: {
    fontSize: 11, color: 'rgba(255,255,255,0.35)',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },

  // Info card
  infoCard: {
    marginHorizontal: 24, marginBottom: 24,
    backgroundColor: CARD_BG, borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  infoRow:    { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  infoIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  infoContent: { flex: 1, gap: 2 },
  infoLabel: {
    fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.28)',
    letterSpacing: 0.8, textTransform: 'uppercase',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  infoValue: {
    fontSize: 14, color: 'rgba(255,255,255,0.8)',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  infoDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 60 },

  // Achievements
  badgeScroll:  { paddingLeft: 24, marginBottom: 24 },
  badge: {
    width: 90, alignItems: 'center', gap: 8,
    backgroundColor: CARD_BG, borderRadius: 16,
    borderWidth: 1, borderColor: ACCENT_BORDER,
    padding: 16, marginRight: 10,
  },
  badgeLocked: {
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  badgeLabel: {
    fontSize: 10, fontWeight: '500', color: ACCENT,
    textAlign: 'center', lineHeight: 13,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  badgeLabelLocked: { color: 'rgba(255,255,255,0.2)' },
  unlockedDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: SUCCESS,
  },
});