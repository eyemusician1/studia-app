// src/screens/HomeScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, Animated, Easing, ActivityIndicator, ScrollView, Dimensions, Image, FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import { useStudyReminders } from '../hooks/useStudyReminders';
import LottieView from 'lottie-react-native';
import { useTheme } from '../context/ThemeContext'; // <-- NEW IMPORT
import AppToast, { ToastType } from '../components/AppToast';
import { migrateHistoryOnce, patchHistoryEntryById, prependHistoryEntry } from '../lib/historyStorage';

const ACCENT  = '#3B6FD4';
const SW      = Dimensions.get('window').width;

type PickedFile     = { name: string; uri: string; size: number; mimeType: string };
type UploadState    = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';
type ActiveView     = null | 'summary' | 'concepts' | 'flashcards' | 'quiz' | 'hardQuiz' | 'exam';
type Concept        = { term: string; definition: string };
type Flashcard      = { question: string; answer: string };
type QuizItem       = { question: string; options: string[]; correctIndex: number; explanation: string };
type IdItem         = { question: string; expectedAnswer: string };
type EnumItem       = { question: string; items: string[] };
type ShortItem      = { question: string; guidance: string };
type QuantItem      = { problem: string; stepSolution: string; finalAnswer: string };
type ExamBundle     = { multipleChoice: QuizItem[]; identification: IdItem[]; enumeration: EnumItem[]; shortAnswer: ShortItem[]; quantitative: QuantItem[] };
type AnalysisResult = { summary: string; keyConceptsList: Concept[]; flashcards: Flashcard[]; quiz: QuizItem[]; hardQuiz: QuizItem[]; exam?: ExamBundle };

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const parseQuotaValue = (value: string | null): number => {
  if (value == null) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const cleanExamBundle = (raw: any): ExamBundle | null => {
  const cleanMcq = (arr: any): QuizItem[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((q) => ({
        question: (q?.question ?? '').trim(),
        options: Array.isArray(q?.options) ? q.options.map((o: any) => (typeof o === 'string' ? o.trim() : '')).slice(0, 4) : [],
        correctIndex: typeof q?.correctIndex === 'number' ? q.correctIndex : -1,
        explanation: (q?.explanation ?? '').trim(),
      }))
      .filter((q) => q.question && q.explanation && q.options.length === 4 && q.correctIndex >= 0 && q.correctIndex < 4);
  };
  const cleanId = (arr: any): IdItem[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((q) => ({ question: (q?.question ?? '').trim(), expectedAnswer: (q?.expectedAnswer ?? '').trim() }))
      .filter((q) => q.question && q.expectedAnswer);
  };
  const cleanEnum = (arr: any): EnumItem[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((q) => ({ question: (q?.question ?? '').trim(), items: Array.isArray(q?.items) ? q.items.map((i: any) => (typeof i === 'string' ? i.trim() : '')).filter((i: string) => i) : [] }))
      .filter((q) => q.question && q.items.length >= 3);
  };
  const cleanShort = (arr: any): ShortItem[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((q) => ({ question: (q?.question ?? '').trim(), guidance: (q?.guidance ?? '').trim() }))
      .filter((q) => q.question && q.guidance);
  };
  const cleanQuant = (arr: any): QuantItem[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((q) => ({ problem: (q?.problem ?? '').trim(), stepSolution: (q?.stepSolution ?? '').trim(), finalAnswer: (q?.finalAnswer ?? '').trim() }))
      .filter((q) => q.problem && q.stepSolution && q.finalAnswer)
      .slice(0, 5);
  };

  const bundle: ExamBundle = {
    multipleChoice: cleanMcq(raw?.multipleChoice),
    identification: cleanId(raw?.identification),
    enumeration: cleanEnum(raw?.enumeration),
    shortAnswer: cleanShort(raw?.shortAnswer),
    quantitative: cleanQuant(raw?.quantitative ?? []),
  };

  if (
    bundle.multipleChoice.length === 0 &&
    bundle.identification.length === 0 &&
    bundle.enumeration.length === 0 &&
    bundle.shortAnswer.length === 0 &&
    bundle.quantitative.length === 0
  ) return null;

  return bundle;
};

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

export default function HomeScreen() {
  const styles = useStyles(); // <-- NEW: Dynamic Styles
  const { theme, colors } = useTheme();
  const { profile, user } = useAuth();
  const first    = (profile?.first_name ?? '').charAt(0) || '?';
  const last     = (profile?.last_name  ?? '').charAt(0) || '';
  const initials = (first + last).toUpperCase();
  useStudyReminders();

  const [pickedFile,  setPickedFile]  = useState<PickedFile | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMsg,    setErrorMsg]    = useState('');
  const [result,      setResult]      = useState<AnalysisResult | null>(null);
  const [activeView,  setActiveView]  = useState<ActiveView>(null);
  const [toast, setToast] = useState<{ visible: boolean; type: ToastType; title: string; message: string }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [isGeneratingExam, setIsGeneratingExam] = useState(false);

  const MAX_DAILY_UPLOADS = 3;
  const MAX_DAILY_EXAMS   = 2;
  const [uploadQuotaUsed, setUploadQuotaUsed] = useState(0);
  const [examQuotaUsed, setExamQuotaUsed]     = useState(0);

  const cardScale    = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const doneAnim     = useRef(new Animated.Value(0)).current;
  const glowAnim     = useRef(new Animated.Value(0)).current; 

  const isWorking = uploadState === 'uploading' || uploadState === 'analyzing';

  const showToast = (type: ToastType, title: string, message: string) => {
    setToast({ visible: true, type, title, message });
  };

  useEffect(() => {
    if (pickedFile && !isWorking && uploadState !== 'done') {
      Animated.loop(Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
      ])).start();
    } else { glowAnim.stopAnimation(); }
  }, [pickedFile, isWorking, uploadState]);

  useEffect(() => {
    const loadDailyQuotas = async () => {
      if (!user) return;
      const today = new Date().toLocaleDateString();
      try {
        await migrateHistoryOnce();
        const storedDate = await AsyncStorage.getItem(`@studia_date_${user.id}`);
        if (storedDate !== today) {
          await AsyncStorage.setItem(`@studia_date_${user.id}`, today);
          await AsyncStorage.setItem(`@studia_upload_quota_${user.id}`, '0');
          await AsyncStorage.setItem(`@studia_exam_quota_${user.id}`, '0');
          setUploadQuotaUsed(0); setExamQuotaUsed(0);
        } else {
          setUploadQuotaUsed(parseQuotaValue(await AsyncStorage.getItem(`@studia_upload_quota_${user.id}`)));
          setExamQuotaUsed(parseQuotaValue(await AsyncStorage.getItem(`@studia_exam_quota_${user.id}`)));
        }
      } catch (err) { console.error(err); }
    };
    loadDailyQuotas();
  }, [user]);

  const bumpScale = () => {
    Animated.sequence([
      Animated.timing(cardScale, { toValue: 0.97, duration: 90, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, tension: 220, friction: 9, useNativeDriver: true }),
    ]).start();
  };

  const animateProgress = (to: number) => Animated.timing(progressAnim, { toValue: to, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  const showDoneBanner = () => { doneAnim.setValue(0); Animated.spring(doneAnim, { toValue: 1, tension: 120, friction: 10, useNativeDriver: true }).start(); };

  const handlePick = async () => {
    bumpScale();
    if (uploadQuotaUsed >= MAX_DAILY_UPLOADS) { showToast('info', 'Daily Limit Reached', 'You have used your 3 free uploads for today.'); return; }
    const res = await DocumentPicker.getDocumentAsync({ 
      type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint'], 
      copyToCacheDirectory: true 
    });
    if (!res.canceled) {
      const asset = res.assets[0];
      if (asset.size && asset.size > 5 * 1024 * 1024) { showToast('info', 'File Too Large', 'Please upload a document smaller than 5MB.'); return; }
      setPickedFile({ name: asset.name, uri: asset.uri, size: asset.size ?? 0, mimeType: asset.mimeType ?? 'application/octet-stream' });
      setUploadState('idle'); setResult(null); setActiveView(null); setErrorMsg(''); setUploadedFilePath(null); setCurrentHistoryId(null); progressAnim.setValue(0); doneAnim.setValue(0);
    }
  };

  const handleRemove = () => { setPickedFile(null); setUploadState('idle'); setResult(null); setActiveView(null); setErrorMsg(''); setUploadedFilePath(null); setCurrentHistoryId(null); progressAnim.setValue(0); doneAnim.setValue(0); };

  const handleAnalyze = async () => {
    if (!pickedFile || !user) return;
    if (uploadQuotaUsed >= MAX_DAILY_UPLOADS) { showToast('info', 'Daily Limit Reached', 'You have used your 3 free document uploads for today.'); return; }
    try {
      setUploadState('uploading'); animateProgress(0.15);
      const nameParts = pickedFile.name.split('.');
      const ext = nameParts.length > 1 ? nameParts[nameParts.length - 1] : null;
      const storagePath = ext ? `${user.id}/${Date.now()}.${ext}` : `${user.id}/${Date.now()}`;
      setUploadedFilePath(storagePath); 
      animateProgress(0.35);
      
      const base64Str = await FileSystem.readAsStringAsync(pickedFile.uri, { encoding: FileSystem.EncodingType.Base64 });
      const fileData = decode(base64Str);
      
      const { data: uploadData, error: uploadError } = await supabase.storage.from('study-materials').upload(storagePath, fileData, { contentType: pickedFile.mimeType, upsert: false });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
      
      animateProgress(0.55); setUploadState('analyzing'); animateProgress(0.75);
      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No active session. Please sign in again.');

      const tokenStillFresh = (s: any) => {
        const expiresAtMs = Number(s?.expires_at ?? 0) * 1000;
        return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now() + 60_000;
      };

      // Force-refresh once so edge functions with verify_jwt receive a valid token.
      try {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshed.session?.access_token) {
          session = refreshed.session;
        } else if (!tokenStillFresh(session)) {
          throw new Error(refreshError?.message || 'Session refresh failed');
        }
      } catch (e: any) {
        throw new Error(`Session expired. Please log in again. ${e?.message ?? ''}`.trim());
      }
      
      const invokeOnce = async (token: string) => {
        return supabase.functions.invoke('analyze-material', {
          body: { storagePath: uploadData.path, fileName: pickedFile.name, userId: user.id },
          headers: { Authorization: `Bearer ${token}` },
        });
      };

      let { data: fnData, error: fnError } = await invokeOnce(session.access_token);

      const firstStatus = Number((fnError as any)?.context?.status ?? 0);

      const shouldRetryAuth =
        !!fnError &&
        (firstStatus === 401 ||
          fnError.message?.toLowerCase().includes('401') ||
          fnError.message?.toLowerCase().includes('unauthorized'));

      if (shouldRetryAuth) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed.session?.access_token) {
          throw new Error('Session expired. Please log in again.');
        }
        session = refreshed.session;
        ({ data: fnData, error: fnError } = await invokeOnce(session.access_token));
      }

      if (fnError) {
        console.error('analyze-material invoke error', {
          message: fnError.message,
          status: (fnError as any)?.context?.status,
          body: (fnError as any)?.context?.body,
        });
        if ((fnError as any)?.context?.status === 401) {
          showToast('info', 'Session Expired', 'Please log in again and retry the upload.');
        }
        throw new Error(`Analysis failed: ${fnError.message}`);
      }
      if (!fnData?.success) {
        console.error('analyze-material returned failure', fnData);
        throw new Error(fnData?.error ?? 'Analysis returned no data');
      }
      animateProgress(1);

      const generatedData = { summary: fnData.summary, keyConceptsList: fnData.keyConceptsList ?? [], flashcards: fnData.flashcards ?? [], quiz: fnData.quiz ?? [], hardQuiz: fnData.hardQuiz ?? [] };
      setResult(generatedData);

      const analysisTotalMs = Number(fnData?.stageTimings?.total_ms ?? 0);
      const analysisGenerateMs = Number(fnData?.stageTimings?.generate_ms ?? 0);

      try {
        const historyId = Date.now().toString();
        setCurrentHistoryId(historyId); 
        const newLesson = { id: historyId, fileName: pickedFile.name, date: new Date().toLocaleDateString(), content: generatedData };
        await prependHistoryEntry(newLesson, 100);
      } catch (e) { console.error("History save failed:", e); }

      const newUploadQuota = uploadQuotaUsed + 1;
      setUploadQuotaUsed(newUploadQuota);
      await AsyncStorage.setItem(`@studia_upload_quota_${user.id}`, newUploadQuota.toString());
      setUploadState('done'); setActiveView(null); showDoneBanner();
      if (analysisTotalMs > 0) {
        showToast('success', 'Analysis Complete', `Ready in ${(analysisTotalMs / 1000).toFixed(1)}s (${analysisGenerateMs}ms generation).`);
      } else {
        showToast('success', 'Analysis Complete', 'Study materials are ready. Choose a section to start learning.');
      }
    } catch (err: any) {
      setUploadState('error'); console.error("Upload error:", err);
      const structuredErrorType = err?.errorType ?? err?.code ?? null;
      if (structuredErrorType === 'quota_exceeded') { showToast('info', 'Daily Limit Reached', 'Limit reached. Come back tomorrow.'); animateProgress(0); return; }
      const rawMessage = String(err?.message ?? 'Could not process this file.');
      const userMessage = rawMessage.replace(/^Analysis failed:\s*/i, '').slice(0, 180);
      const lower = userMessage.toLowerCase();
      if (lower.includes('session expired') || lower.includes('log in again') || lower.includes('unauthorized') || lower.includes('401')) {
        showToast('info', 'Session Expired', 'Please sign in again, then retry upload.');
      } else {
        showToast('error', 'Analysis Failed', userMessage || 'Could not process this file.');
      }
      setErrorMsg(userMessage || 'Failed to read document.');
      animateProgress(0);
    }
  };

  const handleGenerateExam = async () => {
    if (!uploadedFilePath || !currentHistoryId) { showToast('error', 'Missing Data', 'File data is incomplete. Please analyze the file again.'); return; }
    if (examQuotaUsed >= MAX_DAILY_EXAMS) { showToast('info', 'Daily Limit Reached', 'You have used your 2 free exam generations for today.'); return; }
    try {
      setIsGeneratingExam(true);
      const invokeGenerateExam = async (token: string) => {
        return supabase.functions.invoke('generate-exam', {
          body: { storagePath: uploadedFilePath, fileName: pickedFile?.name, userId: user?.id },
          headers: { Authorization: `Bearer ${token}` },
        });
      };

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No active session.');

      let { data: fnData, error: fnError } = await invokeGenerateExam(session.access_token);

      const shouldRetryAuth =
        !!fnError &&
        (fnError.message?.toLowerCase().includes('401') ||
          fnError.message?.toLowerCase().includes('unauthorized'));

      if (shouldRetryAuth) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed.session?.access_token) {
          throw new Error('Session expired. Please log in again.');
        }
        ({ data: fnData, error: fnError } = await invokeGenerateExam(refreshed.session.access_token));
      }

      if (fnError || !fnData?.success) throw new Error("Failed to generate exam.");
      const cleanedExam = cleanExamBundle(fnData.exam);
      if (!cleanedExam) throw new Error('Exam returned empty or invalid data');
      setResult(prev => prev ? { ...prev, exam: cleanedExam } : null);

      const examTotalMs = Number(fnData?.stageTimings?.total_ms ?? 0);
      const examGenerateMs = Number(fnData?.stageTimings?.generate_ms ?? 0);
      
      try {
        await patchHistoryEntryById(currentHistoryId, (entry) => ({
          ...entry,
          content: {
            ...(entry?.content ?? {}),
            exam: cleanedExam,
          },
        }));
      } catch (historyErr) {
        // Exam generation succeeded; history sync failure should not surface as generation failure.
        console.error('History exam update failed:', historyErr);
      }
      setExamQuotaUsed(examQuotaUsed + 1);
      await AsyncStorage.setItem(`@studia_exam_quota_${user.id}`, (examQuotaUsed + 1).toString());
      setActiveView('exam');
      if (examTotalMs > 0) {
        showToast('success', 'Exam Ready', `Generated in ${(examTotalMs / 1000).toFixed(1)}s (${examGenerateMs}ms generation).`);
      } else {
        showToast('success', 'Exam Ready', 'Your exam has been generated successfully.');
      }
    } catch (err: any) {
      const msg = err?.message?.toLowerCase() || '';
      if (msg.includes('session expired') || msg.includes('log in again') || msg.includes('unauthorized') || msg.includes('401')) {
        showToast('info', 'Session Expired', 'Please sign in again, then retry generating your exam.');
      } else {
        showToast('error', 'Generation Failed', 'Something went wrong while generating your exam.');
      }
    } finally { setIsGeneratingExam(false); }
  };

  const uploadsLeft = Math.max(0, MAX_DAILY_UPLOADS - uploadQuotaUsed);
  const examsLeft   = Math.max(0, MAX_DAILY_EXAMS - examQuotaUsed);

  const OUTPUT_CARDS = [
    { key: 'summary'   as ActiveView, icon: 'align-left',   label: 'Summary',    desc: 'Document overview',   count: null },
    { key: 'concepts'  as ActiveView, icon: 'tag',          label: 'Concepts',   desc: 'Key terms & ideas',   count: result?.keyConceptsList.length },
    { key: 'flashcards'as ActiveView, icon: 'layers',       label: 'Flashcards', desc: 'Q&A study cards',     count: result?.flashcards.length },
    { key: 'quiz'      as ActiveView, icon: 'check-square', label: 'Quiz',       desc: 'Test your knowledge', count: result?.quiz.length },
    { key: 'hardQuiz'  as ActiveView, icon: 'award',        label: 'Hard Quiz',  desc: '5 Challenge questions', count: result?.hardQuiz?.length },
    { key: 'exam'      as ActiveView, icon: 'file-text',    label: 'Final Exam', desc: result?.exam ? 'Mixed format' : `${examsLeft} remaining today (resets daily)`, count: result?.exam ? undefined : undefined, isLocked: !result?.exam && examQuotaUsed >= MAX_DAILY_EXAMS },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle={theme === 'dark' ? "light-content" : "dark-content"} />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Image source={require('../../assets/icon.png')} style={styles.logoImage} resizeMode="contain" />
              <Text style={styles.appName}>Studia</Text>
            </View>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          </View>

          {!pickedFile && (
            <View style={styles.idleContainer}>
              <Animated.View style={[styles.uploadCard, { transform: [{ scale: cardScale }] }]}>
                <TouchableOpacity style={styles.uploadTouchable} onPress={handlePick} activeOpacity={1}>
                  <View style={styles.gridLines} pointerEvents="none">
                    {[0,1,2,3].map(i => <View key={`h${i}`} style={[styles.gridLine,  { top:  `${25*(i+1)}%` as any }]} />)}
                    {[0,1,2,3].map(i => <View key={`v${i}`} style={[styles.gridLineV, { left: `${25*(i+1)}%` as any }]} />)}
                  </View>
                  <View style={styles.uploadCenter}>
                    <View style={styles.uploadIconOuter}><View style={styles.uploadIconInner}><Feather name="upload-cloud" size={36} color={ACCENT} /></View></View>
                    <Text style={styles.uploadTitle}>Drop your file here</Text>
                    <View style={styles.formatRow}>
                      <View style={styles.formatPill}><Text style={styles.formatText}>PDF</Text></View><View style={styles.formatDivider} />
                      <View style={styles.formatPill}><Text style={styles.formatText}>DOCX</Text></View><View style={styles.formatDivider} />
                      <View style={styles.formatPill}><Text style={styles.formatText}>PPTX</Text></View>
                    </View>
                    <Text style={{ color: colors.textDim, fontSize: 12, marginTop: 4 }}>Max file size: 5MB • <Text style={{ color: uploadsLeft === 0 ? colors.danger : colors.success, fontWeight: 'bold' }}>{uploadsLeft} uploads left today</Text></Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
              <Text style={styles.idleSubtitle}>Upload a document to instantly generate flashcards, quizzes, and exam.</Text>
            </View>
          )}

          {pickedFile && (
            <View style={styles.section}>
              {isWorking && (
                <View style={styles.workingContainer}>
                  <LottieView source={require('../../assets/scan.json')} autoPlay loop style={{ width: 280, height: 280 }} />
                  <Text style={styles.workingTitle}>{uploadState === 'uploading' ? 'Uploading Document...' : 'Analyzing File...'}</Text>
                  <Text style={styles.workingSubtitle}>{uploadState === 'uploading' ? `Securely sending ${pickedFile.name} to the cloud.` : 'Extracting concepts and drafting your exam. This usually takes 10-30 seconds.'}</Text>
                  <View style={styles.largeProgressTrack}>
                    <Animated.View style={[styles.largeProgressFill, { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
                  </View>
                </View>
              )}

              {!isWorking && uploadState !== 'done' && (
                 <View style={styles.readyContainer}>
                    <View style={styles.readyFilePreview}>
                      <View style={styles.readyFileIconWrap}><Feather name={pickedFile.mimeType === 'application/pdf' ? 'file-text' : 'file'} size={32} color={ACCENT} /></View>
                      <Text style={styles.readyFileName} numberOfLines={1}>{pickedFile.name}</Text>
                      <Text style={styles.readyFileSize}>{formatBytes(pickedFile.size)} • Ready for AI processing</Text>
                    </View>
                    {uploadState === 'error' && (
                      <View style={styles.readyErrorBox}><Feather name="alert-triangle" size={14} color={colors.danger} /><Text style={styles.readyErrorText}>{errorMsg}</Text></View>
                    )}
                    <View style={styles.analyzeBtnWrapper}>
                      <Animated.View style={[styles.analyzeBtnGlow, { transform: [{ scale: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }], opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }) }]} />
                      <TouchableOpacity style={[styles.analyzeBtn, uploadState === 'error' && { backgroundColor: colors.danger }]} onPress={handleAnalyze} activeOpacity={0.85}>
                         <Feather name={uploadState === 'error' ? 'rotate-cw' : 'cpu'} size={22} color="#fff" />
                         <Text style={styles.analyzeBtnText}>{uploadState === 'error' ? 'Retry Analysis' : 'Start Analysis'}</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.changeFileBtn} onPress={handlePick}>
                      <Feather name="refresh-ccw" size={14} color={colors.textDim} />
                      <Text style={styles.changeFileText}>Select a different file</Text>
                    </TouchableOpacity>
                 </View>
              )}

              {uploadState === 'done' && (
                <>
                  <View style={styles.doneCompactCard}>
                    {/* BACK BUTTON (Moved to the left side) */}
                    <TouchableOpacity style={styles.newUploadBtn} onPress={handleRemove} activeOpacity={0.7}>
                      <Feather name="arrow-left" size={20} color={colors.text} />
                    </TouchableOpacity>

                    <View style={styles.doneCompactIcon}>
                      <Feather name={pickedFile.mimeType === 'application/pdf' ? 'file-text' : 'file'} size={20} color={ACCENT} />
                    </View>
                    
                    <View style={styles.doneCompactMeta}>
                      <Text style={styles.doneCompactName} numberOfLines={1}>{pickedFile.name}</Text>
                      <Text style={styles.doneCompactSize}>{formatBytes(pickedFile.size)}</Text>
                    </View>
                  </View>

                  {result && activeView === null && !isGeneratingExam && (
                    <View style={{ gap: 14 }}>
                      <Animated.View style={{ opacity: doneAnim, transform: [{ translateY: doneAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }] }}>
                        <View style={styles.doneBanner}>
                          <View style={styles.doneBannerLeft}>
                            <View style={styles.doneIconWrap}><Feather name="check" size={18} color={colors.success} /></View>
                            <View>
                              <Text style={styles.doneBannerTitle}>Analysis Complete!</Text>
                              <Text style={styles.doneBannerSub}>Select a category below to start studying.</Text>
                            </View>
                          </View>
                        </View>
                      </Animated.View>
                      <View style={styles.outputGrid}>
                        {OUTPUT_CARDS.map((card) => {
                          const isLocked = card.isLocked;
                          return (
                            <TouchableOpacity key={card.key} style={[styles.outputCard, isLocked && styles.outputCardLocked]} onPress={() => { if (card.key === 'exam' && !result?.exam) { if (isLocked) showToast('info', 'Limit Reached', 'You have already used your 2 exam generations for today.'); else handleGenerateExam(); } else { setActiveView(card.key); } }} activeOpacity={isLocked ? 1 : 0.8}>
                              <View style={styles.outputCardTop}>
                                <View style={[styles.outputIconWrap, isLocked && styles.outputIconWrapLocked]}><Feather name={isLocked ? "lock" : card.icon as any} size={20} color={isLocked ? colors.textDim : ACCENT} /></View>
                                {!isLocked && <Feather name="arrow-right" size={14} color={colors.border} />}
                              </View>
                              <Text style={[styles.outputCardLabel, isLocked && styles.outputCardLabelLocked]}>{card.label}</Text>
                              <Text style={styles.outputCardDesc}>{card.desc}</Text>
                              {card.count != null && ( <View style={styles.outputCardCount}><Text style={styles.outputCardCountText}>{card.count} items</Text></View> )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {isGeneratingExam && (
                    <View style={styles.generatingOverlay}>
                      {/* --- UPDATED TO USE loading.json --- */}
                      <LottieView 
                        source={require('../../assets/loading.json')} 
                        autoPlay 
                        loop 
                        style={{ width: 160, height: 160 }} 
                      />
                      <Text style={styles.generatingText}>The AI is generating your exam...</Text>
                      <Text style={styles.generatingSubText}>Please wait</Text>
                    </View>
                  )}

                  {result && activeView !== null && (
                    <View style={styles.contentSection}>
                      <View style={styles.contentHeader}>
                        <TouchableOpacity style={styles.backBtn} onPress={() => setActiveView(null)}><Feather name="arrow-left" size={15} color={colors.text} /></TouchableOpacity>
                        <Text style={styles.contentTitle}>
                          {activeView === 'summary' ? 'Summary' : activeView === 'concepts' ? `Key Concepts · ${result.keyConceptsList.length}` : activeView === 'flashcards'? `Flashcards · ${result.flashcards.length}` : activeView === 'quiz' ? `Quiz · ${result.quiz.length}` : activeView === 'exam' ? 'Final Exam · Mixed Format' : `Hard Quiz · ${result.hardQuiz.length}`}
                        </Text>
                      </View>
                      {activeView === 'summary' && ( <View style={styles.summaryBox}><Text style={styles.summaryText}>{result.summary}</Text></View> )}
                      {activeView === 'concepts' && ( <View style={styles.conceptsList}>{result.keyConceptsList.map((c, i) => ( <View key={`concept-${i}`} style={styles.conceptItem}><View style={styles.conceptDot} /><View style={styles.conceptContent}><Text style={styles.conceptTerm}>{c.term}</Text><Text style={styles.conceptDef}>{c.definition}</Text></View></View> ))}</View> )}
                      {activeView === 'flashcards' && (
                        <View style={styles.flashList}>
                          <View style={styles.hintRow}><Feather name="rotate-cw" size={11} color={colors.textDim} /><Text style={styles.hintText}>Tap a card to flip</Text></View>
                          <FlatList
                            data={result.flashcards}
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
                      {activeView === 'quiz' && (
                        <View style={styles.quizList}>
                          <View style={styles.hintRow}><Feather name="target" size={11} color={colors.textDim} /><Text style={styles.hintText}>Tap an option to answer</Text></View>
                          <FlatList
                            data={result.quiz}
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
                      {activeView === 'hardQuiz' && (
                        <View style={styles.quizList}>
                          <FlatList
                            data={result.hardQuiz}
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
                      {activeView === 'exam' && result.exam && (
                        <View style={{ gap: 14 }}>
                          <View style={styles.hintRow}><Feather name="award" size={11} color={colors.textDim} /><Text style={styles.hintText}>Mixed-format examination</Text></View>

                          {result.exam.multipleChoice.length > 0 && (
                            <View style={{ gap: 8 }}>
                              <Text style={styles.sectionLabel}>Multiple Choice ({result.exam.multipleChoice.length})</Text>
                              <FlatList
                                data={result.exam.multipleChoice}
                                keyExtractor={(_, i) => `mc-${i}`}
                                renderItem={({ item, index }) => <QuizCard item={item} index={index} />}
                                ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
                                scrollEnabled={false}
                                removeClippedSubviews
                                initialNumToRender={8}
                                windowSize={7}
                              />
                            </View>
                          )}

                          {result.exam.identification.length > 0 && (
                            <View style={styles.sectionBlock}>
                              <Text style={styles.sectionLabel}>Identification ({result.exam.identification.length})</Text>
                              {result.exam.identification.map((q, i) => (
                                <View key={`id-${i}`} style={styles.textItemCard}>
                                  <Text style={styles.textItemQuestion}>{i + 1}. {q.question}</Text>
                                  <Text style={styles.textItemAnswerLabel}>Expected answer</Text>
                                  <Text style={styles.textItemAnswer}>{q.expectedAnswer}</Text>
                                </View>
                              ))}
                            </View>
                          )}

                          {result.exam.enumeration.length > 0 && (
                            <View style={styles.sectionBlock}>
                              <Text style={styles.sectionLabel}>Enumeration ({result.exam.enumeration.length})</Text>
                              {result.exam.enumeration.map((q, i) => (
                                <View key={`enum-${i}`} style={styles.textItemCard}>
                                  <Text style={styles.textItemQuestion}>{i + 1}. {q.question}</Text>
                                  <View style={styles.enumList}>{q.items.map((item, idx) => (<Text key={`enum-${i}-${idx}`} style={styles.enumItem}>• {item}</Text>))}</View>
                                </View>
                              ))}
                            </View>
                          )}

                          {result.exam.shortAnswer.length > 0 && (
                            <View style={styles.sectionBlock}>
                              <Text style={styles.sectionLabel}>Short Answer ({result.exam.shortAnswer.length})</Text>
                              {result.exam.shortAnswer.map((q, i) => (
                                <View key={`short-${i}`} style={styles.textItemCard}>
                                  <Text style={styles.textItemQuestion}>{i + 1}. {q.question}</Text>
                                  <Text style={styles.textItemAnswerLabel}>Guidance</Text>
                                  <Text style={styles.textItemAnswer}>{q.guidance}</Text>
                                </View>
                              ))}
                            </View>
                          )}

                          {result.exam.quantitative.length > 0 && (
                            <View style={styles.sectionBlock}>
                              <Text style={styles.sectionLabel}>Quantitative ({result.exam.quantitative.length})</Text>
                              {result.exam.quantitative.map((q, i) => (
                                <View key={`quant-${i}`} style={styles.textItemCard}>
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
                      )}
                    </View>
                  )}
                </>
              )}
            </View>
          )}

        </ScrollView>
      </SafeAreaView>
      <AppToast
        visible={toast.visible}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

// --- NEW: DYNAMIC STYLES ---
const useStyles = () => {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    safe:   { flex: 1 },
    scroll: { flexGrow: 1, paddingBottom: 56 },

    header: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 }, 
    logoImage: { width: 32, height: 32, borderRadius: 8 }, 
    appName: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.8, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
    avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: isDark ? 'rgba(59,111,212,0.22)' : colors.border, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 13, fontWeight: '700', color: colors.accent, letterSpacing: 0.5, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },

    idleContainer: { flex: 1, justifyContent: 'center', paddingBottom: 40 },
    idleSubtitle: { textAlign: 'center', color: colors.textDim, fontSize: 13, marginTop: 24, paddingHorizontal: 40, lineHeight: 20, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },

    uploadCard: { marginHorizontal: 24, height: SW * 0.72, borderRadius: 24, backgroundColor: isDark ? 'rgba(59,111,212,0.05)' : colors.cardBg, borderWidth: 1.5, borderColor: isDark ? 'rgba(59,111,212,0.22)' : colors.border, borderStyle: 'dashed', overflow: 'hidden' },
    uploadTouchable: { flex: 1 },
    gridLines:  { ...StyleSheet.absoluteFillObject },
    gridLine:   { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: isDark ? 'rgba(59,111,212,0.07)' : colors.background },
    gridLineV:  { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: isDark ? 'rgba(59,111,212,0.07)' : colors.background },
    uploadCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
    uploadIconOuter: { width: 100, height: 100, borderRadius: 50, backgroundColor: isDark ? 'rgba(59,111,212,0.08)' : colors.background, borderWidth: 1, borderColor: isDark ? 'rgba(59,111,212,0.15)' : colors.border, alignItems: 'center', justifyContent: 'center' },
    uploadIconInner: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: isDark ? 'rgba(59,111,212,0.22)' : colors.border, alignItems: 'center', justifyContent: 'center' },
    uploadTitle: { fontSize: 18, fontWeight: '600', color: colors.text, letterSpacing: -0.3, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    formatRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    formatPill: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: isDark ? 'rgba(59,111,212,0.22)' : colors.border },
    formatText: { fontSize: 11, fontWeight: '700', color: colors.accent, letterSpacing: 1, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    formatDivider: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.border },

    section: { paddingHorizontal: 24, marginTop: 10, gap: 14 },

    readyContainer: { backgroundColor: colors.cardBg, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 30, alignItems: 'center', gap: 20 },
    readyFilePreview: { alignItems: 'center', gap: 8, marginBottom: 6 },
    readyFileIconWrap: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: isDark ? 'rgba(59,111,212,0.22)' : colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    readyFileName: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center', paddingHorizontal: 10, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-bold' }) },
    readyFileSize: { fontSize: 13, color: colors.textDim, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    readyErrorBox: { flexDirection: 'row', backgroundColor: colors.dangerDim, borderWidth: 1, borderColor: isDark ? 'rgba(255,82,82,0.2)' : colors.danger, padding: 12, borderRadius: 12, gap: 8, width: '100%' },
    readyErrorText: { color: colors.danger, fontSize: 12, flex: 1, lineHeight: 18 },
    
    analyzeBtnWrapper: { width: '100%', position: 'relative', marginTop: 10 },
    analyzeBtnGlow: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.accent, borderRadius: 20 },
    analyzeBtn: { backgroundColor: colors.accent, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 12 },
    analyzeBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-bold' }) },
    
    changeFileBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
    changeFileText: { color: colors.textDim, fontSize: 13, fontWeight: '500', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },

    doneCompactCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 14 },
    doneCompactIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' },
    doneCompactMeta: { flex: 1 },
    doneCompactName: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 2 },
    doneCompactSize: { color: colors.textDim, fontSize: 11 },
    newUploadBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.background, alignItems: 'center', justifyContent: 'center' },

    workingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, backgroundColor: colors.cardBg, borderRadius: 24, borderWidth: 1, borderColor: colors.border },
    workingTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 10, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-bold' }) },
    workingSubtitle: { fontSize: 13, color: colors.textDim, textAlign: 'center', paddingHorizontal: 30, marginTop: 8, lineHeight: 20 },
    largeProgressTrack: { width: '80%', height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: 24, overflow: 'hidden' },
    largeProgressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },

    doneBanner: { backgroundColor: isDark ? 'rgba(52,199,138,0.08)' : '#ECFDF5', borderRadius: 16, borderWidth: 1, borderColor: isDark ? 'rgba(52,199,138,0.2)' : '#D1FAE5', padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    doneBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    doneIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? 'rgba(52,199,138,0.12)' : '#D1FAE5', alignItems: 'center', justifyContent: 'center' },
    doneBannerTitle: { fontSize: 14, fontWeight: '600', color: colors.success, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    doneBannerSub:   { fontSize: 11, color: isDark ? 'rgba(52,199,138,0.6)' : '#059669', marginTop: 1, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },

    outputGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    outputCard: { width: (SW - 48 - 10) / 2, backgroundColor: colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 6 },
    outputCardLocked: { backgroundColor: isDark ? 'rgba(255,255,255,0.01)' : colors.background, borderColor: isDark ? 'rgba(255,255,255,0.03)' : colors.border },
    outputCardTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    outputIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: isDark ? 'rgba(59,111,212,0.22)' : colors.border, alignItems: 'center', justifyContent: 'center' },
    outputIconWrapLocked: { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.border, borderColor: 'transparent' },
    outputCardLabel:{ fontSize: 15, fontWeight: '700', color: colors.text, letterSpacing: -0.2, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
    outputCardLabelLocked: { color: colors.textDim },
    outputCardDesc: { fontSize: 11, color: colors.textDim, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    outputCardCount:{ alignSelf: 'flex-start', marginTop: 4, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: isDark ? 'rgba(59,111,212,0.22)' : colors.border, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    outputCardCountText: { fontSize: 10, fontWeight: '600', color: colors.accent, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },

    generatingOverlay: { backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(155,81,224,0.3)', padding: 30, alignItems: 'center', gap: 10, marginTop: 10 },
    generatingText: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 10 },
    generatingSubText: { color: colors.textDim, fontSize: 12 },

    contentSection: { gap: 12 },
    contentHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
    backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.cardBg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    contentTitle: { fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: -0.3, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },

    hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    hintText: { fontSize: 11, color: colors.textDim, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },

    summaryBox: { backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18 },
    summaryText: { fontSize: 14, color: colors.text, lineHeight: 22, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },

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