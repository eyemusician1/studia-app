// src/screens/ProfileScreen.tsx
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

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
  const [greeting, setGreeting] = useState('Welcome back');

  const initials = profile ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase() : '?';
  const firstName = profile ? profile.first_name : 'Student';
  const fullName = profile ? `${profile.first_name} ${profile.last_name}` : 'Student';

  useFocusEffect(
    useCallback(() => {
      const hour = new Date().getHours();
      if (hour < 12) setGreeting('Good morning');
      else if (hour < 18) setGreeting('Good afternoon');
      else setGreeting('Good evening');

      fetchOfflineStats();
    }, [])
  );

  const fetchOfflineStats = async () => {
    try {
      const localData = await AsyncStorage.getItem('@studia_history');
      if (localData) {
        const history = JSON.parse(localData);
        let fCount = 0; let qCount = 0; let cCount = 0;

        history.forEach((item: any) => {
          fCount += item.content?.flashcards?.length || 0;
          qCount += (item.content?.quiz?.length || 0) + (item.content?.hardQuiz?.length || 0);
          cCount += item.content?.keyConceptsList?.length || 0;
        });

        setStats({
          totalDocs: history.length,
          totalFlashcards: fCount,
          totalQuizzes: qCount,
          totalConcepts: cCount,
        });
      } else {
        // Reset stats if data was cleared
        setStats({ totalDocs: 0, totalFlashcards: 0, totalQuizzes: 0, totalConcepts: 0 });
      }
    } catch (error) {
      console.error("Failed to fetch profile stats:", error);
    }
    setLoading(false);
  };

  const totalXP = (stats.totalDocs * 50) + (stats.totalFlashcards * 5) + (stats.totalQuizzes * 10);
  const currentLevel = Math.floor(totalXP / 500) + 1;
  const xpIntoCurrentLevel = totalXP % 500;
  const xpProgress = (xpIntoCurrentLevel / 500) * 100;

  const statItems = [
    { label: 'Documents',  value: stats.totalDocs,       icon: 'file-text' },
    { label: 'Flashcards', value: stats.totalFlashcards, icon: 'layers' },
    { label: 'Quiz items', value: stats.totalQuizzes,    icon: 'check-square' },
    { label: 'Concepts',   value: stats.totalConcepts,   icon: 'tag' },
  ];

  const handleBadgeTap = (badge: any) => {
    Alert.alert(
      badge.unlocked ? `Unlocked: ${badge.label}` : `Locked: ${badge.label}`,
      badge.desc
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.glow} />

      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <Text style={styles.greetingText}>{greeting},</Text>
            <Text style={styles.title}>{firstName}!</Text>
          </View>

          <View style={styles.avatarCard}>
            <View style={styles.avatarRing}>
              <Text style={styles.avatarText}>{initials}</Text>
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>Lvl {currentLevel}</Text>
              </View>
            </View>
            
            <Text style={styles.fullName}>{fullName}</Text>
            <Text style={styles.studentId}>Total XP: {totalXP}</Text>

            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Level {currentLevel}</Text>
                <Text style={styles.progressLabel}>Level {currentLevel + 1}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${xpProgress}%` }]} />
              </View>
              <Text style={styles.xpRemainingText}>{500 - xpIntoCurrentLevel} XP to next level</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Your study impact</Text>
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

          <Text style={styles.sectionLabel}>Achievements</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgeScroll}>
            {[
              { icon: 'upload-cloud', label: 'First upload',   desc: 'Analyze your very first document with AI.', unlocked: stats.totalDocs >= 1 },
              { icon: 'layers',       label: '10 flashcards',  desc: 'Generate at least 10 flashcards.', unlocked: stats.totalFlashcards >= 10 },
              { icon: 'check-circle', label: '10 quiz items',  desc: 'Generate at least 10 multiple-choice quiz questions.', unlocked: stats.totalQuizzes >= 10 },
              { icon: 'star',         label: 'Scholar',        desc: 'Upload and analyze 5 different documents.', unlocked: stats.totalDocs >= 5 },
              { icon: 'award',        label: '50 flashcards',  desc: 'Become a memory master by generating 50 flashcards.', unlocked: stats.totalFlashcards >= 50 },
            ].map((badge, i) => (
              <TouchableOpacity key={i} onPress={() => handleBadgeTap(badge)} activeOpacity={0.7} style={[styles.badge, !badge.unlocked && styles.badgeLocked]}>
                <Feather
                  name={badge.icon as any}
                  size={24}
                  color={badge.unlocked ? ACCENT : 'rgba(255,255,255,0.15)'}
                />
                <Text style={[styles.badgeLabel, !badge.unlocked && styles.badgeLabelLocked]}>
                  {badge.label}
                </Text>
                {badge.unlocked && <View style={styles.unlockedDot} />}
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.sectionLabel}>Account info</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}><Feather name="user" size={14} color={ACCENT} /></View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Full name</Text>
                <Text style={styles.infoValue}>{fullName}</Text>
              </View>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}><Feather name="hash" size={14} color={ACCENT} /></View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Student ID</Text>
                <Text style={styles.infoValue}>{profile?.student_id ?? '—'}</Text>
              </View>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}><Feather name="mail" size={14} color={ACCENT} /></View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{user?.email ?? '—'}</Text>
              </View>
            </View>
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0C0D12' },
  glow: { position: 'absolute', width: 480, height: 480, borderRadius: 240, backgroundColor: 'rgba(59,111,212,0.04)', top: -140, alignSelf: 'center' },
  safe:        { flex: 1 },
  scroll:      { paddingBottom: 48 },

  header: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 4 },
  greetingText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }), marginBottom: 2 },
  title: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },

  avatarCard: { margin: 24, marginTop: 16, backgroundColor: CARD_BG, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center', paddingTop: 28, paddingBottom: 24, gap: 6 },
  avatarRing: { width: 84, height: 84, borderRadius: 42, backgroundColor: ACCENT_DIM, borderWidth: 2, borderColor: ACCENT_BORDER, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  avatarText: { fontSize: 28, fontWeight: '700', color: ACCENT, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
  levelBadge: { position: 'absolute', bottom: -8, backgroundColor: ACCENT, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 2, borderColor: '#181C25' },
  levelText: { color: '#FFF', fontSize: 10, fontWeight: '800', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
  
  fullName: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }), marginTop: 6 },
  studentId: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }), marginBottom: 12 },

  progressContainer: { width: '85%', marginTop: 10 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.4)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  progressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: SUCCESS, borderRadius: 3 },
  xpRemainingText: { fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 8, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },

  sectionLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.28)', letterSpacing: 1.2, textTransform: 'uppercase', marginLeft: 24, marginBottom: 10, marginTop: 4, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24, gap: 10, marginBottom: 24 },
  statCard: { flex: 1, minWidth: '44%', backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 16, alignItems: 'flex-start', gap: 8 },
  statIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 26, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.5, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },

  infoCard: { marginHorizontal: 24, marginBottom: 24, backgroundColor: CARD_BG, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  infoIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, alignItems: 'center', justifyContent: 'center' },
  infoContent: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.28)', letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  infoValue: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  infoDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 60 },

  badgeScroll: { paddingLeft: 24, marginBottom: 24 },
  badge: { width: 100, alignItems: 'center', gap: 10, backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: ACCENT_BORDER, padding: 16, marginRight: 10 },
  badgeLocked: { borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' },
  badgeLabel: { fontSize: 11, fontWeight: '600', color: '#FFFFFF', textAlign: 'center', lineHeight: 14, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  badgeLabelLocked: { color: 'rgba(255,255,255,0.3)', fontWeight: '500' },
  unlockedDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: SUCCESS },
});