// src/screens/HistoryScreen.tsx
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, ScrollView, ActivityIndicator, Modal, SafeAreaView as RNSafeAreaView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

const ACCENT        = '#3B6FD4';
const ACCENT_DIM    = 'rgba(59,111,212,0.10)';
const ACCENT_BORDER = 'rgba(59,111,212,0.22)';
const CARD_BG       = 'rgba(255,255,255,0.035)';
const SUCCESS       = '#34C78A';
const DANGER        = '#FF5252';

type Concept        = { term: string; definition: string };
type Flashcard      = { question: string; answer: string };
type QuizItem       = { question: string; options: string[]; correctIndex: number; explanation: string };
type ActiveView     = null | 'summary' | 'concepts' | 'flashcards' | 'quiz' | 'hardQuiz';

type OfflineLesson = {
  id: string; 
  fileName: string;
  date: string;
  content: {
    summary: string;
    keyConceptsList: Concept[];
    flashcards: Flashcard[];
    quiz: QuizItem[];
    hardQuiz?: QuizItem[];
  };
};

function timeAgo(timestampId: string) {
  const diff = Date.now() - parseInt(timestampId);
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function fileIcon(name: string) {
  return name.toLowerCase().endsWith('.pdf') ? 'file-text' : 'file';
}

function FlashCard({ card }: { card: Flashcard }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <TouchableOpacity
      style={[styles.flashCard, flipped && styles.flashCardFlipped]}
      onPress={() => setFlipped(!flipped)}
      activeOpacity={0.85}
    >
      <Text style={styles.flashCardHint}>{flipped ? 'Answer' : 'Question'}</Text>
      <Text style={styles.flashCardText}>{flipped ? card.answer : card.question}</Text>
      <Text style={styles.flashCardTap}>Tap to {flipped ? 'see question' : 'reveal answer'}</Text>
    </TouchableOpacity>
  );
}

function QuizCard({ item, index }: { item: QuizItem; index: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <View style={styles.quizCard}>
      <Text style={styles.quizQuestion}>{index + 1}. {item.question}</Text>
      <View style={styles.quizOptions}>
        {item.options.map((opt, i) => {
          const isCorrect  = i === item.correctIndex;
          const isSelected = selected === i;
          let bg = 'rgba(255,255,255,0.04)', border = 'rgba(255,255,255,0.08)', color = 'rgba(255,255,255,0.75)';
          if (selected !== null) {
            if (isCorrect)       { bg = 'rgba(52,199,138,0.12)'; border = SUCCESS; color = SUCCESS; }
            else if (isSelected) { bg = 'rgba(255,82,82,0.10)';  border = DANGER;  color = DANGER;  }
          }
          return (
            <TouchableOpacity key={`opt-${i}`}
              style={[styles.quizOption, { backgroundColor: bg, borderColor: border }]}
              onPress={() => { if (selected === null) setSelected(i); }}
              activeOpacity={0.8} disabled={selected !== null}
            >
              <Text style={[styles.quizOptionLetter, { color }]}>{String.fromCharCode(65 + i)}</Text>
              <Text style={[styles.quizOptionText, { color }]}>{opt}</Text>
              {selected !== null && isCorrect    && <Feather name="check-circle" size={14} color={SUCCESS} />}
              {selected !== null && isSelected && !isCorrect && <Feather name="x-circle" size={14} color={DANGER} />}
            </TouchableOpacity>
          );
        })}
      </View>
      {selected !== null && (
        <View style={styles.quizExplanation}>
          <Feather name="info" size={12} color="rgba(255,255,255,0.35)" />
          <Text style={styles.quizExplanationText}>{item.explanation}</Text>
        </View>
      )}
    </View>
  );
}

export default function HistoryScreen() {
  const [results, setResults]   = useState<OfflineLesson[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  
  const [studySession, setStudySession] = useState<OfflineLesson | null>(null);
  const [activeView, setActiveView]     = useState<ActiveView>(null);

  useFocusEffect(
    useCallback(() => {
      loadOfflineHistory();
    }, [])
  );

  const loadOfflineHistory = async () => {
    setLoading(true);
    try {
      const localData = await AsyncStorage.getItem('@studia_history');
      if (localData) {
        setResults(JSON.parse(localData));
      } else {
        setResults([]);
      }
    } catch (error) {
      console.error("Failed to load offline history", error);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const updatedResults = results.filter(r => r.id !== id);
      setResults(updatedResults);
      await AsyncStorage.setItem('@studia_history', JSON.stringify(updatedResults));
    } catch (error) {
      console.error("Failed to delete lesson", error);
    }
  };

  const OUTPUT_CARDS = studySession ? [
    { key: 'summary'   as ActiveView, icon: 'align-left',   label: 'Summary',    desc: 'Document overview',   count: null },
    { key: 'concepts'  as ActiveView, icon: 'tag',           label: 'Concepts',   desc: 'Key terms & ideas',   count: studySession.content.keyConceptsList?.length || 0 },
    { key: 'flashcards'as ActiveView, icon: 'layers',        label: 'Flashcards', desc: 'Q&A study cards',     count: studySession.content.flashcards?.length || 0 },
    { key: 'quiz'      as ActiveView, icon: 'check-square',  label: 'Quiz',       desc: 'Test your knowledge', count: studySession.content.quiz?.length || 0 },
    { key: 'hardQuiz'  as ActiveView, icon: 'award',         label: 'Hard Quiz',  desc: '15 Challenge questions', count: studySession.content.hardQuiz?.length || 0 },
  ] : [];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.glow} />
      <SafeAreaView style={styles.safe}>

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
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Feather name="clock" size={32} color={ACCENT} />
            </View>
            <Text style={styles.emptyTitle}>No history yet</Text>
            <Text style={styles.emptySub}>Your analyzed documents will appear here</Text>
          </View>
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {results.map((item) => {
              const isOpen = expanded === item.id;
              return (
                <View key={item.id} style={styles.card}>
                  <TouchableOpacity style={styles.cardHeader} onPress={() => setExpanded(isOpen ? null : item.id)} activeOpacity={0.8}>
                    <View style={styles.fileIconWrap}>
                      <Feather name={fileIcon(item.fileName) as any} size={17} color={ACCENT} />
                    </View>
                    <View style={styles.cardMeta}>
                      <Text style={styles.cardName} numberOfLines={1} ellipsizeMode="middle">{item.fileName}</Text>
                      <View style={styles.cardTagRow}>
                        <View style={styles.tag}><Feather name="layers" size={10} color={ACCENT} /><Text style={styles.tagText}>{item.content.flashcards?.length ?? 0}</Text></View>
                        <View style={styles.tag}><Feather name="check-square" size={10} color={ACCENT} /><Text style={styles.tagText}>{item.content.quiz?.length ?? 0}</Text></View>
                        <Text style={styles.timeAgo}>{timeAgo(item.id)}</Text>
                      </View>
                    </View>
                    <View style={styles.cardActions}><Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(255,255,255,0.3)" /></View>
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.cardBody}>
                      <View style={styles.divider} />
                      <Text style={styles.summaryLabel}>Summary Preview</Text>
                      <Text style={styles.summaryText} numberOfLines={3}>{item.content.summary}</Text>
                      
                      <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.studyBtn} onPress={() => { setStudySession(item); setActiveView(null); }} activeOpacity={0.8}>
                          <Feather name="play" size={14} color="#FFF" />
                          <Text style={styles.studyBtnText}>Study Now</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id)} activeOpacity={0.7}>
                          <Feather name="trash-2" size={14} color="#FF5252" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>

      <Modal visible={!!studySession} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setStudySession(null)}>
        <View style={styles.modalContainer}>
          <RNSafeAreaView style={{ flex: 1 }}>
            
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => activeView ? setActiveView(null) : setStudySession(null)} style={styles.modalBackBtn}>
                <Feather name={activeView ? "arrow-left" : "x"} size={20} color="#FFF" />
              </TouchableOpacity>
              <View style={styles.modalTitleContainer}>
                <Text style={styles.modalTitle} numberOfLines={1}>{activeView ? activeView.toUpperCase() : 'STUDY MENU'}</Text>
                <Text style={styles.modalSubTitle} numberOfLines={1}>{studySession?.fileName}</Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              
              {!activeView && studySession && (
                <View style={styles.outputGrid}>
                  {OUTPUT_CARDS.map((card) => (
                    <TouchableOpacity key={card.key} style={styles.outputCard} onPress={() => setActiveView(card.key)} activeOpacity={0.8}>
                      <View style={styles.outputCardTop}>
                        <View style={styles.outputIconWrap}><Feather name={card.icon as any} size={20} color={ACCENT} /></View>
                        <Feather name="arrow-right" size={14} color="rgba(255,255,255,0.2)" />
                      </View>
                      <Text style={styles.outputCardLabel}>{card.label}</Text>
                      <Text style={styles.outputCardDesc}>{card.desc}</Text>
                      {card.count !== null && (
                        <View style={styles.outputCardCount}><Text style={styles.outputCardCountText}>{card.count} items</Text></View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {activeView === 'summary' && studySession && (
                <View style={styles.summaryBox}><Text style={styles.summaryTextBody}>{studySession.content.summary}</Text></View>
              )}
              {activeView === 'concepts' && studySession && (
                <View style={styles.conceptsList}>
                  {studySession.content.keyConceptsList?.map((c, i) => (
                    <View key={`concept-${i}`} style={styles.conceptItem}>
                      <View style={styles.conceptDot} />
                      <View style={styles.conceptContent}>
                        <Text style={styles.conceptTerm}>{c.term}</Text>
                        <Text style={styles.conceptDef}>{c.definition}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              {activeView === 'flashcards' && studySession && (
                <View style={styles.flashList}>
                  {studySession.content.flashcards?.map((fc, i) => <FlashCard key={`flashcard-${i}`} card={fc} />)}
                </View>
              )}
              {activeView === 'quiz' && studySession && (
                <View style={styles.quizList}>
                  {studySession.content.quiz?.map((q, i) => <QuizCard key={`quiz-${i}`} item={q} index={i} />)}
                </View>
              )}
              {activeView === 'hardQuiz' && studySession && (
                <View style={styles.quizList}>
                  {studySession.content.hardQuiz?.map((q, i) => <QuizCard key={`hard-quiz-${i}`} item={q} index={i} />)}
                </View>
              )}

            </ScrollView>
          </RNSafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0C0D12' },
  glow: { position: 'absolute', width: 480, height: 480, borderRadius: 240, backgroundColor: 'rgba(59,111,212,0.04)', top: -140, alignSelf: 'center' },
  safe:        { flex: 1 },

  header: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 19, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.4, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
  countBadge: { backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countText: { fontSize: 11, fontWeight: '700', color: ACCENT, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: 'rgba(255,255,255,0.7)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  emptySub: { fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingHorizontal: 40, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },

  list:        { flex: 1 },
  listContent: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40, gap: 12 },

  card: { backgroundColor: CARD_BG, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  fileIconWrap: { width: 42, height: 42, borderRadius: 12, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardMeta:    { flex: 1, gap: 5 },
  cardName: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  cardTagRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: ACCENT_DIM, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: ACCENT_BORDER },
  tagText: { fontSize: 10, fontWeight: '500', color: ACCENT, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  timeAgo: { fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  cardActions: { paddingLeft: 4 },

  cardBody:    { paddingHorizontal: 14, paddingBottom: 16, gap: 10 },
  divider:     { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 4 },
  summaryLabel: { fontSize: 10, fontWeight: '600', color: ACCENT, letterSpacing: 1, textTransform: 'uppercase', marginBottom: -4, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  summaryText: { fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 20, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  studyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: ACCENT, paddingVertical: 10, borderRadius: 12 },
  studyBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  deleteBtn: { padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,82,82,0.1)', borderWidth: 1, borderColor: 'rgba(255,82,82,0.2)' },

  modalContainer: { flex: 1, backgroundColor: '#0C0D12' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', backgroundColor: '#0C0D12' },
  modalBackBtn: { padding: 5, marginRight: 15 },
  modalTitleContainer: { flex: 1 },
  modalTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
  modalSubTitle: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
  modalScroll: { padding: 20, paddingBottom: 60 },

  outputGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  outputCard: { width: '48%', backgroundColor: CARD_BG, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 16, gap: 6, marginBottom: 10 },
  outputCardTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  outputIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, alignItems: 'center', justifyContent: 'center' },
  outputCardLabel:{ fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.2, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
  outputCardDesc: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  outputCardCount:{ alignSelf: 'flex-start', marginTop: 4, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  outputCardCountText: { fontSize: 10, fontWeight: '600', color: ACCENT, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },

  summaryBox: { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 18 },
  summaryTextBody: { fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 22, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  conceptsList: { gap: 10 },
  conceptItem:  { flexDirection: 'row', gap: 12, backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 14 },
  conceptDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT, marginTop: 5, flexShrink: 0 },
  conceptContent: { flex: 1, gap: 4 },
  conceptTerm:  { fontSize: 14, fontWeight: '600', color: '#FFFFFF', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  conceptDef:   { fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 19, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  flashList: { gap: 12 },
  flashCard: { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: ACCENT_BORDER, padding: 20, gap: 10, alignItems: 'center', minHeight: 140, justifyContent: 'center' },
  flashCardFlipped: { backgroundColor: 'rgba(59,111,212,0.08)' },
  flashCardHint: { fontSize: 10, fontWeight: '600', color: ACCENT, letterSpacing: 1, textTransform: 'uppercase', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  flashCardText: { fontSize: 15, color: '#FFFFFF', textAlign: 'center', lineHeight: 22, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  flashCardTap:  { fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  quizList: { gap: 14 },
  quizCard: { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 16, gap: 12 },
  quizQuestion: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', lineHeight: 20, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  quizOptions:  { gap: 8 },
  quizOption:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  quizOptionLetter: { fontSize: 12, fontWeight: '700', width: 18, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  quizOptionText:   { fontSize: 13, flex: 1, lineHeight: 18, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  quizExplanation:  { flexDirection: 'row', gap: 7, alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10 },
  quizExplanationText: { fontSize: 12, color: 'rgba(255,255,255,0.45)', flex: 1, lineHeight: 17, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
});