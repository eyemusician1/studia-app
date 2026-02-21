// src/screens/HistoryScreen.tsx
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

type StudyResult = {
  id: string;
  file_name: string;
  summary: string;
  created_at: string;
  key_concepts: { term: string; definition: string }[];
  flashcards: { question: string; answer: string }[];
  quiz: any[];
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function fileIcon(name: string) {
  return name.toLowerCase().endsWith('.pdf') ? 'file-text' : 'file';
}

export default function HistoryScreen() {
  const { user } = useAuth();
  const [results, setResults]   = useState<StudyResult[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('study_results')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (!error && data) setResults(data);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('study_results').delete().eq('id', id);
    setResults(prev => prev.filter(r => r.id !== id));
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.glow} />
      <SafeAreaView style={styles.safe}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>History</Text>
          {results.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{results.length}</Text>
            </View>
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={ACCENT} />
          </View>
        ) : results.length === 0 ? (
          /* Empty state */
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Feather name="clock" size={32} color={ACCENT} />
            </View>
            <Text style={styles.emptyTitle}>No history yet</Text>
            <Text style={styles.emptySub}>Your analyzed documents will appear here</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {results.map((item) => {
              const isOpen = expanded === item.id;
              return (
                <View key={item.id} style={styles.card}>
                  {/* Card header */}
                  <TouchableOpacity
                    style={styles.cardHeader}
                    onPress={() => setExpanded(isOpen ? null : item.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.fileIconWrap}>
                      <Feather name={fileIcon(item.file_name) as any} size={17} color={ACCENT} />
                    </View>

                    <View style={styles.cardMeta}>
                      <Text style={styles.cardName} numberOfLines={1} ellipsizeMode="middle">
                        {item.file_name}
                      </Text>
                      <View style={styles.cardTagRow}>
                        <View style={styles.tag}>
                          <Feather name="layers" size={10} color={ACCENT} />
                          <Text style={styles.tagText}>{item.flashcards?.length ?? 0} flashcards</Text>
                        </View>
                        <View style={styles.tag}>
                          <Feather name="check-square" size={10} color={ACCENT} />
                          <Text style={styles.tagText}>{item.quiz?.length ?? 0} quiz</Text>
                        </View>
                        <Text style={styles.timeAgo}>{timeAgo(item.created_at)}</Text>
                      </View>
                    </View>

                    <View style={styles.cardActions}>
                      <Feather
                        name={isOpen ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color="rgba(255,255,255,0.3)"
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Expanded summary */}
                  {isOpen && (
                    <View style={styles.cardBody}>
                      <View style={styles.divider} />

                      <Text style={styles.summaryLabel}>Summary</Text>
                      <Text style={styles.summaryText}>{item.summary}</Text>

                      {/* Concepts preview */}
                      {item.key_concepts?.length > 0 && (
                        <>
                          <Text style={styles.summaryLabel}>Key Concepts</Text>
                          {item.key_concepts.slice(0, 3).map((c, i) => (
                            <View key={i} style={styles.conceptRow}>
                              <View style={styles.conceptDot} />
                              <Text style={styles.conceptTerm}>{c.term}</Text>
                            </View>
                          ))}
                          {item.key_concepts.length > 3 && (
                            <Text style={styles.moreText}>
                              +{item.key_concepts.length - 3} more concepts
                            </Text>
                          )}
                        </>
                      )}

                      {/* Delete */}
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDelete(item.id)}
                        activeOpacity={0.7}
                      >
                        <Feather name="trash-2" size={13} color="#FF5252" />
                        <Text style={styles.deleteBtnText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
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

  header: {
    paddingHorizontal: 24, paddingTop: 14, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  title: {
    fontSize: 19, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.4,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }),
  },
  countBadge: {
    backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  countText: {
    fontSize: 11, fontWeight: '700', color: ACCENT,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 17, fontWeight: '600', color: 'rgba(255,255,255,0.7)',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  emptySub: {
    fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingHorizontal: 40,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },

  list:        { flex: 1 },
  listContent: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40, gap: 12 },

  card: {
    backgroundColor: CARD_BG, borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden',
  },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  fileIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardMeta:    { flex: 1, gap: 5 },
  cardName: {
    fontSize: 14, fontWeight: '600', color: '#FFFFFF',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  cardTagRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: ACCENT_DIM, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10, borderWidth: 1, borderColor: ACCENT_BORDER,
  },
  tagText: {
    fontSize: 10, fontWeight: '500', color: ACCENT,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  timeAgo: {
    fontSize: 11, color: 'rgba(255,255,255,0.25)',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  cardActions: { paddingLeft: 4 },

  cardBody:    { paddingHorizontal: 14, paddingBottom: 16, gap: 10 },
  divider:     { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 4 },
  summaryLabel: {
    fontSize: 10, fontWeight: '600', color: ACCENT,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: -4,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  summaryText: {
    fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 20,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  conceptRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  conceptDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT, flexShrink: 0 },
  conceptTerm: {
    fontSize: 13, color: 'rgba(255,255,255,0.65)',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  moreText: {
    fontSize: 11, color: 'rgba(255,255,255,0.25)',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginTop: 4,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: 'rgba(255,82,82,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,82,82,0.18)',
  },
  deleteBtnText: {
    fontSize: 12, fontWeight: '500', color: '#FF5252',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
});