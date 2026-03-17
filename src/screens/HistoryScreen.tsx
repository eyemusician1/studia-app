// src/screens/HistoryScreen.tsx
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, ScrollView, ActivityIndicator, Modal, SafeAreaView as RNSafeAreaView, FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext'; // <-- NEW IMPORT
import { migrateHistoryOnce, replaceHistoryEntries } from '../lib/historyStorage';

const ACCENT = '#3B6FD4';

type Concept        = { term: string; definition: string };
type Flashcard      = { question: string; answer: string };
type QuizItem       = { question: string; options: string[]; correctIndex: number; explanation: string };
type IdItem         = { question: string; expectedAnswer: string };
type EnumItem       = { question: string; items: string[] };
type ShortItem      = { question: string; guidance: string };
type QuantItem      = { problem: string; stepSolution: string; finalAnswer: string };
type ExamBundle     = {
  multipleChoice: QuizItem[];
  identification: IdItem[];
  enumeration: EnumItem[];
  shortAnswer: ShortItem[];
  quantitative: QuantItem[];
};
type ActiveView     = null | 'summary' | 'concepts' | 'flashcards' | 'quiz' | 'hardQuiz' | 'exam';

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
    exam?: QuizItem[] | ExamBundle;
  };
};

function isExamBundle(exam: any): exam is ExamBundle {
  return !!exam && typeof exam === 'object' && Array.isArray(exam.multipleChoice);
}

function examItemCount(exam: QuizItem[] | ExamBundle | undefined): number {
  if (!exam) return 0;
  if (Array.isArray(exam)) return exam.length;
  return (
    (exam.multipleChoice?.length ?? 0) +
    (exam.identification?.length ?? 0) +
    (exam.enumeration?.length ?? 0) +
    (exam.shortAnswer?.length ?? 0) +
    (exam.quantitative?.length ?? 0)
  );
}

function normalizeLesson(raw: any): OfflineLesson | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.id || !raw.fileName) return null;

  const content = raw.content ?? {};
  return {
    id: String(raw.id),
    fileName: String(raw.fileName),
    date: String(raw.date ?? ''),
    content: {
      summary: typeof content.summary === 'string' ? content.summary : '',
      keyConceptsList: Array.isArray(content.keyConceptsList) ? content.keyConceptsList : [],
      flashcards: Array.isArray(content.flashcards) ? content.flashcards : [],
      quiz: Array.isArray(content.quiz) ? content.quiz : [],
      hardQuiz: Array.isArray(content.hardQuiz) ? content.hardQuiz : [],
      exam: Array.isArray(content.exam) || isExamBundle(content.exam) ? content.exam : undefined,
    },
  };
}

function timeAgo(timestampId: string) {
  const parsed = Number(timestampId);
  if (!Number.isFinite(parsed)) return 'Recently';
  const diff = Date.now() - parsed;
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

const FlashCard = React.memo(function FlashCard({ card }: { card: Flashcard }) {
  const styles = useStyles();
  const [flipped, setFlipped] = useState(false);
  return (
    <TouchableOpacity style={[styles.flashCard, flipped && styles.flashCardFlipped]} onPress={() => setFlipped(!flipped)} activeOpacity={0.85}>
      <Text style={styles.flashCardHint}>{flipped ? 'Answer' : 'Question'}</Text>
      <Text style={styles.flashCardText}>{flipped ? card.answer : card.question}</Text>
      <Text style={styles.flashCardTap}>Tap to {flipped ? 'see question' : 'reveal answer'}</Text>
    </TouchableOpacity>
  );
});

const QuizCard = React.memo(function QuizCard({ item, index }: { item: QuizItem; index: number }) {
  const styles = useStyles();
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <View style={styles.quizCard}>
      <Text style={styles.quizQuestion}>{index + 1}. {item.question}</Text>
      <View style={styles.quizOptions}>
        {item.options.map((opt, i) => {
          const isCorrect  = i === item.correctIndex;
          const isSelected = selected === i;
          
          let bg = isDark ? 'rgba(255,255,255,0.04)' : colors.background;
          let border = colors.border;
          let color = colors.text;

          if (selected !== null) {
            if (isCorrect)       { bg = colors.success + '20'; border = colors.success; color = colors.success; }
            else if (isSelected) { bg = colors.danger + '20';  border = colors.danger;  color = colors.danger;  }
          }
          return (
            <TouchableOpacity key={`opt-${i}`} style={[styles.quizOption, { backgroundColor: bg, borderColor: border }]} onPress={() => { if (selected === null) setSelected(i); }} activeOpacity={0.8} disabled={selected !== null}>
              <Text style={[styles.quizOptionLetter, { color }]}>{String.fromCharCode(65 + i)}</Text>
              <Text style={[styles.quizOptionText, { color }]}>{opt}</Text>
              {selected !== null && isCorrect    && <Feather name="check-circle" size={14} color={colors.success} />}
              {selected !== null && isSelected && !isCorrect && <Feather name="x-circle" size={14} color={colors.danger} />}
            </TouchableOpacity>
          );
        })}
      </View>
      {selected !== null && (
        <View style={styles.quizExplanation}>
          <Feather name="info" size={12} color={colors.textDim} />
          <Text style={styles.quizExplanationText}>{item.explanation}</Text>
        </View>
      )}
    </View>
  );
});

export default function HistoryScreen() {
  const styles = useStyles();
  const { theme, colors } = useTheme();
  const isDark = theme === 'dark';

  const [results, setResults]   = useState<OfflineLesson[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  
  const [studySession, setStudySession] = useState<OfflineLesson | null>(null);
  const [activeView, setActiveView]     = useState<ActiveView>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<{ id: string, fileName: string } | null>(null);

  useFocusEffect(
    useCallback(() => { loadOfflineHistory(); }, [])
  );

  const loadOfflineHistory = async () => {
    setLoading(true);
    try {
      const migrated = await migrateHistoryOnce();
      const normalized = migrated.map(normalizeLesson).filter(Boolean) as OfflineLesson[];
      setResults(normalized);
    } catch (error) { console.error("Failed to load offline history", error); }
    setLoading(false);
  };

  const handleDeleteClick = (id: string, fileName: string) => { setDeleteCandidate({ id, fileName }); };

  const confirmDelete = async () => {
    if (!deleteCandidate) return;
    try {
      const updatedResults = results.filter(r => r.id !== deleteCandidate.id);
      setResults(updatedResults);
      await replaceHistoryEntries(updatedResults);
    } catch (error) { console.error("Failed to delete lesson", error); } 
    finally { setDeleteCandidate(null); }
  };

  const getOutputCards = () => {
    if (!studySession) return [];
    const cards = [
      { key: 'summary'   as ActiveView, icon: 'align-left',   label: 'Summary',    desc: 'Document overview',   count: null },
      { key: 'concepts'  as ActiveView, icon: 'tag',          label: 'Concepts',   desc: 'Key terms & ideas',   count: studySession.content.keyConceptsList?.length || 0 },
      { key: 'flashcards'as ActiveView, icon: 'layers',       label: 'Flashcards', desc: 'Q&A study cards',     count: studySession.content.flashcards?.length || 0 },
      { key: 'quiz'      as ActiveView, icon: 'check-square', label: 'Quiz',       desc: 'Test your knowledge', count: studySession.content.quiz?.length || 0 },
      { key: 'hardQuiz'  as ActiveView, icon: 'award',        label: 'Hard Quiz',  desc: '5 Challenge questions', count: studySession.content.hardQuiz?.length || 0 },
    ];
    if (studySession.content.exam) {
      cards.push({ key: 'exam' as ActiveView, icon: 'file-text', label: 'Final Exam', desc: 'Mixed-format challenge', count: examItemCount(studySession.content.exam) });
    }
    return cards;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
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
          <View style={styles.center}><ActivityIndicator size="large" color={ACCENT} /></View>
        ) : results.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}><Feather name="clock" size={32} color={ACCENT} /></View>
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
                    <View style={styles.fileIconWrap}><Feather name={fileIcon(item.fileName) as any} size={17} color={ACCENT} /></View>
                    <View style={styles.cardMeta}>
                      <Text style={styles.cardName} numberOfLines={1} ellipsizeMode="middle">{item.fileName}</Text>
                      <View style={styles.cardTagRow}>
                        <View style={styles.tag}><Feather name="layers" size={10} color={ACCENT} /><Text style={styles.tagText}>{item.content.flashcards?.length ?? 0}</Text></View>
                        <View style={styles.tag}><Feather name="check-square" size={10} color={ACCENT} /><Text style={styles.tagText}>{item.content.quiz?.length ?? 0}</Text></View>
                        <Text style={styles.timeAgo}>{timeAgo(item.id)}</Text>
                      </View>
                    </View>
                    <View style={styles.cardActions}><Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textDim} /></View>
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.cardBody}>
                      <View style={styles.divider} />
                      <Text style={styles.summaryLabel}>Summary Preview</Text>
                      <Text style={styles.summaryText} numberOfLines={3}>{item.content.summary || 'No summary available for this file.'}</Text>
                      
                      <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.studyBtn} onPress={() => { setStudySession(item); setActiveView(null); }} activeOpacity={0.8}>
                          <Feather name="play" size={14} color="#FFF" />
                          <Text style={styles.studyBtnText}>Study Now</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteClick(item.id, item.fileName)} activeOpacity={0.7}>
                          <Feather name="trash-2" size={14} color={colors.danger} />
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

      <Modal visible={!!deleteCandidate} transparent animationType="fade" onRequestClose={() => setDeleteCandidate(null)}>
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <View style={styles.alertIconWrap}><Feather name="trash-2" size={26} color={colors.danger} /></View>
            <Text style={styles.alertTitle}>Delete File?</Text>
            <Text style={styles.alertDesc}>
              Are you sure you want to remove <Text style={{ fontWeight: 'bold', color: colors.text }}>"{deleteCandidate?.fileName}"</Text> from your history? This action cannot be undone.
            </Text>
            
            <View style={styles.alertRow}>
              <TouchableOpacity style={styles.alertCancelBtn} onPress={() => setDeleteCandidate(null)} activeOpacity={0.7}>
                <Text style={styles.alertCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.alertConfirmBtn} onPress={confirmDelete} activeOpacity={0.7}>
                <Text style={styles.alertConfirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!studySession} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setStudySession(null)}>
        <View style={styles.modalContainer}>
          <RNSafeAreaView style={{ flex: 1 }}>
            
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => activeView ? setActiveView(null) : setStudySession(null)} style={styles.modalBackBtn}>
                <Feather name={activeView ? "arrow-left" : "x"} size={20} color={colors.text} />
              </TouchableOpacity>
              <View style={styles.modalTitleContainer}>
                <Text style={styles.modalTitle} numberOfLines={1}>{activeView ? activeView.toUpperCase() : 'STUDY MENU'}</Text>
                <Text style={styles.modalSubTitle} numberOfLines={1}>{studySession?.fileName}</Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              
              {!activeView && studySession && (
                <View style={styles.outputGrid}>
                  {getOutputCards().map((card) => (
                    <TouchableOpacity key={card.key} style={styles.outputCard} onPress={() => setActiveView(card.key)} activeOpacity={0.8}>
                      <View style={styles.outputCardTop}>
                        <View style={styles.outputIconWrap}><Feather name={card.icon as any} size={20} color={ACCENT} /></View>
                        <Feather name="arrow-right" size={14} color={colors.textDim} />
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

              {activeView === 'summary' && studySession && ( <View style={styles.summaryBox}><Text style={styles.summaryTextBody}>{studySession.content.summary}</Text></View> )}
              {activeView === 'concepts' && studySession && ( <View style={styles.conceptsList}>{studySession.content.keyConceptsList?.map((c, i) => ( <View key={`concept-${i}`} style={styles.conceptItem}><View style={styles.conceptDot} /><View style={styles.conceptContent}><Text style={styles.conceptTerm}>{c.term}</Text><Text style={styles.conceptDef}>{c.definition}</Text></View></View> ))}</View> )}
              {activeView === 'flashcards' && studySession && (
                <View style={styles.flashList}>
                  <FlatList
                    data={studySession.content.flashcards ?? []}
                    keyExtractor={(_, i) => `flashcard-${i}`}
                    renderItem={({ item }) => <FlashCard card={item} />}
                    ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                    scrollEnabled={false}
                    removeClippedSubviews
                    initialNumToRender={8}
                    windowSize={7}
                  />
                </View>
              )}
              {activeView === 'quiz' && studySession && (
                <View style={styles.quizList}>
                  <FlatList
                    data={studySession.content.quiz ?? []}
                    keyExtractor={(_, i) => `quiz-${i}`}
                    renderItem={({ item, index }) => <QuizCard item={item} index={index} />}
                    ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
                    scrollEnabled={false}
                    removeClippedSubviews
                    initialNumToRender={6}
                    windowSize={7}
                  />
                </View>
              )}
              {activeView === 'hardQuiz' && studySession && (
                <View style={styles.quizList}>
                  <FlatList
                    data={studySession.content.hardQuiz ?? []}
                    keyExtractor={(_, i) => `hard-quiz-${i}`}
                    renderItem={({ item, index }) => <QuizCard item={item} index={index} />}
                    ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
                    scrollEnabled={false}
                    removeClippedSubviews
                    initialNumToRender={6}
                    windowSize={7}
                  />
                </View>
              )}
              {activeView === 'exam' && studySession && (
                Array.isArray(studySession.content.exam) ? (
                  <View style={styles.quizList}>
                    <FlatList
                      data={studySession.content.exam}
                      keyExtractor={(_, i) => `exam-q-${i}`}
                      renderItem={({ item, index }) => <QuizCard item={item} index={index} />}
                      ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
                      scrollEnabled={false}
                      removeClippedSubviews
                      initialNumToRender={8}
                      windowSize={7}
                    />
                  </View>
                ) : isExamBundle(studySession.content.exam) ? (
                  <View style={{ gap: 14 }}>
                    {studySession.content.exam.multipleChoice.length > 0 && (
                      <View style={styles.sectionBlock}>
                        <Text style={styles.sectionLabel}>Multiple Choice ({studySession.content.exam.multipleChoice.length})</Text>
                        <FlatList
                          data={studySession.content.exam.multipleChoice}
                          keyExtractor={(_, i) => `exam-mc-${i}`}
                          renderItem={({ item, index }) => <QuizCard item={item} index={index} />}
                          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
                          scrollEnabled={false}
                          removeClippedSubviews
                          initialNumToRender={8}
                          windowSize={7}
                        />
                      </View>
                    )}

                    {studySession.content.exam.identification.length > 0 && (
                      <View style={styles.sectionBlock}>
                        <Text style={styles.sectionLabel}>Identification ({studySession.content.exam.identification.length})</Text>
                        {studySession.content.exam.identification.map((q, i) => (
                          <View key={`exam-id-${i}`} style={styles.textItemCard}>
                            <Text style={styles.textItemQuestion}>{i + 1}. {q.question}</Text>
                            <Text style={styles.textItemAnswerLabel}>Expected answer</Text>
                            <Text style={styles.textItemAnswer}>{q.expectedAnswer}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {studySession.content.exam.enumeration.length > 0 && (
                      <View style={styles.sectionBlock}>
                        <Text style={styles.sectionLabel}>Enumeration ({studySession.content.exam.enumeration.length})</Text>
                        {studySession.content.exam.enumeration.map((q, i) => (
                          <View key={`exam-enum-${i}`} style={styles.textItemCard}>
                            <Text style={styles.textItemQuestion}>{i + 1}. {q.question}</Text>
                            <View style={styles.enumList}>
                              {q.items.map((entry, idx) => <Text key={`exam-enum-${i}-${idx}`} style={styles.enumItem}>• {entry}</Text>)}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}

                    {studySession.content.exam.shortAnswer.length > 0 && (
                      <View style={styles.sectionBlock}>
                        <Text style={styles.sectionLabel}>Short Answer ({studySession.content.exam.shortAnswer.length})</Text>
                        {studySession.content.exam.shortAnswer.map((q, i) => (
                          <View key={`exam-short-${i}`} style={styles.textItemCard}>
                            <Text style={styles.textItemQuestion}>{i + 1}. {q.question}</Text>
                            <Text style={styles.textItemAnswerLabel}>Guidance</Text>
                            <Text style={styles.textItemAnswer}>{q.guidance}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {studySession.content.exam.quantitative.length > 0 && (
                      <View style={styles.sectionBlock}>
                        <Text style={styles.sectionLabel}>Quantitative ({studySession.content.exam.quantitative.length})</Text>
                        {studySession.content.exam.quantitative.map((q, i) => (
                          <View key={`exam-quant-${i}`} style={styles.textItemCard}>
                            <Text style={styles.textItemQuestion}>{i + 1}. {q.problem}</Text>
                            <Text style={styles.textItemAnswerLabel}>Solution Steps</Text>
                            <Text style={styles.textItemAnswer}>{q.stepSolution}</Text>
                            <Text style={styles.textItemAnswerLabel}>Final Answer</Text>
                            <Text style={styles.textItemAnswer}>{q.finalAnswer}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ) : null
              )}

            </ScrollView>
          </RNSafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

// --- NEW: DYNAMIC STYLES ---
const useStyles = () => {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';

  return StyleSheet.create({
    container:   { flex: 1, backgroundColor: colors.background },
    glow: { position: 'absolute', width: 480, height: 480, borderRadius: 240, backgroundColor: colors.accentDim, top: -140, alignSelf: 'center' },
    safe:        { flex: 1 },

    header: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { fontSize: 19, fontWeight: '700', color: colors.text, letterSpacing: -0.4, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
    countBadge: { backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    countText: { fontSize: 11, fontWeight: '700', color: colors.accent, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },

    center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.text, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    emptySub: { fontSize: 13, color: colors.textDim, textAlign: 'center', paddingHorizontal: 40, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },

    list:        { flex: 1 },
    listContent: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40, gap: 12 },

    card: { backgroundColor: colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    cardHeader:  { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
    fileIconWrap: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: isDark ? 'rgba(59,111,212,0.22)' : colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    cardMeta:    { flex: 1, gap: 5 },
    cardName: { fontSize: 14, fontWeight: '600', color: colors.text, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    cardTagRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accentDim, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: isDark ? 'rgba(59,111,212,0.22)' : colors.border },
    tagText: { fontSize: 10, fontWeight: '500', color: colors.accent, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    timeAgo: { fontSize: 11, color: colors.textDim, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    cardActions: { paddingLeft: 4 },

    cardBody:    { paddingHorizontal: 14, paddingBottom: 16, gap: 10 },
    divider:     { height: 1, backgroundColor: colors.border, marginBottom: 4 },
    summaryLabel: { fontSize: 10, fontWeight: '600', color: colors.accent, letterSpacing: 1, textTransform: 'uppercase', marginBottom: -4, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    summaryText: { fontSize: 13, color: colors.textDim, lineHeight: 20, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
    studyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.accent, paddingVertical: 10, borderRadius: 12 },
    studyBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    deleteBtn: { padding: 10, borderRadius: 12, backgroundColor: colors.dangerDim, borderWidth: 1, borderColor: isDark ? 'rgba(255,82,82,0.2)' : colors.danger },

    alertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    alertBox: { width: '100%', backgroundColor: colors.cardBg, borderRadius: 24, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    alertIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.dangerDim, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    alertTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
    alertDesc: { fontSize: 13, color: colors.textDim, textAlign: 'center', lineHeight: 20, marginBottom: 24, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    alertRow: { flexDirection: 'row', gap: 12, width: '100%' },
    alertCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.background, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    alertCancelText: { color: colors.text, fontSize: 14, fontWeight: '600', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    alertConfirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.danger, alignItems: 'center' },
    alertConfirmText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },

    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 15 : 20, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background },
    modalBackBtn: { padding: 5, marginRight: 15 },
    modalTitleContainer: { flex: 1 },
    modalTitle: { color: colors.text, fontSize: 16, fontWeight: '700', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
    modalSubTitle: { color: colors.textDim, fontSize: 12, marginTop: 2 },
    modalScroll: { padding: 20, paddingBottom: 60 },

    outputGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    outputCard: { width: '48%', backgroundColor: colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 6, marginBottom: 10 },
    outputCardTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    outputIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: isDark ? 'rgba(59,111,212,0.22)' : colors.border, alignItems: 'center', justifyContent: 'center' },
    outputCardLabel:{ fontSize: 15, fontWeight: '700', color: colors.text, letterSpacing: -0.2, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
    outputCardDesc: { fontSize: 11, color: colors.textDim, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    outputCardCount:{ alignSelf: 'flex-start', marginTop: 4, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: isDark ? 'rgba(59,111,212,0.22)' : colors.border, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    outputCardCountText: { fontSize: 10, fontWeight: '600', color: colors.accent, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },

    summaryBox: { backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18 },
    summaryTextBody: { fontSize: 14, color: colors.text, lineHeight: 22, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    conceptsList: { gap: 10 },
    conceptItem:  { flexDirection: 'row', gap: 12, backgroundColor: colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 },
    conceptDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 5, flexShrink: 0 },
    conceptContent: { flex: 1, gap: 4 },
    conceptTerm:  { fontSize: 14, fontWeight: '600', color: colors.text, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    conceptDef:   { fontSize: 13, color: colors.textDim, lineHeight: 19, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    
    flashList: { gap: 12 },
    flashCard: { backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 10, alignItems: 'center', minHeight: 140, justifyContent: 'center' },
    flashCardFlipped: { backgroundColor: colors.accentDim },
    flashCardHint: { fontSize: 10, fontWeight: '600', color: colors.accent, letterSpacing: 1, textTransform: 'uppercase', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    flashCardText: { fontSize: 15, color: colors.text, textAlign: 'center', lineHeight: 22, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    flashCardTap:  { fontSize: 11, color: colors.textDim, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    
    quizList: { gap: 14 },
    quizCard: { backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
    quizQuestion: { fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 20, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    quizOptions:  { gap: 8 },
    quizOption:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
    quizOptionLetter: { fontSize: 12, fontWeight: '700', width: 18, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    quizOptionText:   { fontSize: 13, flex: 1, lineHeight: 18, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    quizExplanation:  { flexDirection: 'row', gap: 7, alignItems: 'flex-start', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.background, borderRadius: 10, padding: 10 },
    quizExplanationText: { fontSize: 12, color: colors.textDim, flex: 1, lineHeight: 17, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },

    sectionLabel: { fontSize: 16, fontWeight: '700', color: colors.text, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    sectionBlock: { gap: 10 },
    textItemCard: { backgroundColor: colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
    textItemQuestion: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    textItemAnswerLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    textItemAnswer: { color: colors.text, fontSize: 13, lineHeight: 18, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    enumList: { gap: 4, marginTop: 4 },
    enumItem: { color: colors.text, fontSize: 13, lineHeight: 18, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  });
};