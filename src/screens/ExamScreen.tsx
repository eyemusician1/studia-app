// src/screens/ExamScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, Animated, Easing, ActivityIndicator, ScrollView, Dimensions,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import { useTheme } from '../context/ThemeContext';
import LottieView from 'lottie-react-native'; // <-- Lottie Imported Here
import AppToast, { ToastType } from '../components/AppToast';
import { migrateHistoryOnce, prependHistoryEntry } from '../lib/historyStorage';

const ACCENT        = '#9B51E0'; // Purple accent 
const ACCENT_DIM    = 'rgba(155,81,224,0.10)';
const ACCENT_BORDER = 'rgba(155,81,224,0.22)';
const SW            = Dimensions.get('window').width;

type PickedFile  = { name: string; uri: string; size: number; mimeType: string };
type UploadState = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';
type ExamItem    = { question: string; options: string[]; correctIndex: number; explanation: string };
type IdItem      = { question: string; expectedAnswer: string };
type EnumItem    = { question: string; items: string[] };
type ShortItem   = { question: string; guidance: string };
type QuantItem   = { problem: string; stepSolution: string; finalAnswer: string };
type ExamBundle  = { multipleChoice: ExamItem[]; identification: IdItem[]; enumeration: EnumItem[]; shortAnswer: ShortItem[]; quantitative: QuantItem[] };

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

const cleanExamItems = (raw: any): ExamBundle | null => {
  const cleanMcq = (arr: any): ExamItem[] => {
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
      .map((q) => ({
        problem: (q?.problem ?? '').trim(),
        stepSolution: (q?.stepSolution ?? '').trim(),
        finalAnswer: (q?.finalAnswer ?? '').trim(),
      }))
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

const ExamCard = React.memo(function ExamCard({ item, index }: { item: ExamItem; index: number }) {
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
            <TouchableOpacity key={`opt-${i}`}
              style={[styles.quizOption, { backgroundColor: bg, borderColor: border }]}
              onPress={() => { if (selected === null) setSelected(i); }}
              activeOpacity={0.8} disabled={selected !== null}
            >
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

export default function ExamScreen() {
  const styles = useStyles(); 
  const { theme, colors } = useTheme();
  const { user } = useAuth();
  
  const [pickedFile,  setPickedFile]  = useState<PickedFile | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMsg,    setErrorMsg]    = useState('');
  const [examResult,  setExamResult]  = useState<ExamBundle | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; type: ToastType; title: string; message: string }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const cardScale    = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const doneAnim     = useRef(new Animated.Value(0)).current;
  const glowAnim     = useRef(new Animated.Value(0)).current; // Glowing pulse animation

  const MAX_DAILY_EXAMS = 2;
  const [examQuotaUsed, setExamQuotaUsed] = useState(0);

  const isWorking = uploadState === 'uploading' || uploadState === 'analyzing';
  const examsLeft = Math.max(0, MAX_DAILY_EXAMS - examQuotaUsed);

  const showToast = (type: ToastType, title: string, message: string) => {
    setToast({ visible: true, type, title, message });
  };

  // Trigger pulse animation when file is loaded
  useEffect(() => {
    if (pickedFile && !isWorking && uploadState !== 'done' && examsLeft > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
        ])
      ).start();
    } else {
      glowAnim.stopAnimation();
    }
  }, [pickedFile, isWorking, uploadState, examsLeft]);

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
          setExamQuotaUsed(0);
        } else {
          const eQuota = await AsyncStorage.getItem(`@studia_exam_quota_${user.id}`);
          setExamQuotaUsed(parseQuotaValue(eQuota));
        }
      } catch (err) { console.error("Error loading quotas", err); }
    };
    loadDailyQuotas();
  }, [user]);

  const animateProgress = (to: number) => Animated.timing(progressAnim, { toValue: to, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  const showDoneBanner = () => { doneAnim.setValue(0); Animated.spring(doneAnim, { toValue: 1, tension: 120, friction: 10, useNativeDriver: true }).start(); };

  const handlePick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      copyToCacheDirectory: true,
    });
    if (!res.canceled) {
      const asset = res.assets[0];
      if (asset.size && asset.size > 5 * 1024 * 1024) {
        showToast('info', 'File Too Large', 'Please upload a document smaller than 5MB so the AI can process it quickly.');
        return; 
      }
      setPickedFile({ name: asset.name, uri: asset.uri, size: asset.size ?? 0, mimeType: asset.mimeType ?? 'application/octet-stream' });
      setUploadState('idle'); setExamResult(null); setErrorMsg(''); progressAnim.setValue(0); doneAnim.setValue(0);
    }
  };

  const handleRemove = () => {
    setPickedFile(null); setUploadState('idle'); setExamResult(null); setErrorMsg(''); progressAnim.setValue(0); doneAnim.setValue(0);
  };

  const handleGenerateExam = async () => {
    if (!pickedFile || !user) return;
    if (examQuotaUsed >= MAX_DAILY_EXAMS) {
      showToast('info', 'Daily Limit Reached', 'You have used your 2 free exam generations for today. Please come back tomorrow.');
      return; 
    }

    try {
      setUploadState('uploading'); animateProgress(0.15);
      const nameParts = pickedFile.name.split('.');
      const ext = nameParts.length > 1 ? nameParts[nameParts.length - 1] : null;
      const storagePath = ext ? `${user.id}/exams/${Date.now()}.${ext}` : `${user.id}/exams/${Date.now()}`;
      
      animateProgress(0.35);
      const base64Str = await FileSystem.readAsStringAsync(pickedFile.uri, { encoding: FileSystem.EncodingType.Base64 });
      const fileData = decode(base64Str);
      
      const { data: uploadData, error: uploadError } = await supabase.storage.from('study-materials').upload(storagePath, fileData, { contentType: pickedFile.mimeType, upsert: false });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
      
      animateProgress(0.55); setUploadState('analyzing'); animateProgress(0.75);
      
      const invokeGenerateExam = async (token: string) => {
        return supabase.functions.invoke('generate-exam', {
          body: { storagePath: uploadData.path, fileName: pickedFile.name, userId: user.id },
          headers: { Authorization: `Bearer ${token}` },
        });
      };

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No active session. Please log in again.');

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

      if (fnError) throw new Error(`Generation failed: ${fnError.message}`);
      if (!fnData?.success || !fnData?.exam) throw new Error(fnData?.error ?? 'Failed to generate 50 items.');

      const cleanedExam = cleanExamItems(fnData.exam);
      if (!cleanedExam) throw new Error('Exam returned empty or invalid data');

      const examTotalMs = Number(fnData?.stageTimings?.total_ms ?? 0);
      const examGenerateMs = Number(fnData?.stageTimings?.generate_ms ?? 0);

      animateProgress(1); setExamResult(cleanedExam);

      try {
        const newLesson = {
          id: Date.now().toString(),
          fileName: `[EXAM] ${pickedFile.name}`,
          date: new Date().toLocaleDateString(),
          content: { summary: "Mixed-format exam", keyConceptsList: [], flashcards: [], quiz: [], hardQuiz: [], exam: cleanedExam }
        };
        await prependHistoryEntry(newLesson, 100);
      } catch (storageError) { console.error("Offline save failed:", storageError); }

      const newQuota = examQuotaUsed + 1;
      setExamQuotaUsed(newQuota);
      await AsyncStorage.setItem(`@studia_exam_quota_${user.id}`, newQuota.toString());
      setUploadState('done'); showDoneBanner();
      if (examTotalMs > 0) {
        showToast('success', 'Exam Generated', `Ready in ${(examTotalMs / 1000).toFixed(1)}s (${examGenerateMs}ms generation).`);
      } else {
        showToast('success', 'Exam Generated', 'Your exam is ready. Open the sections below and start practicing.');
      }

    } catch (err: any) {
      setUploadState('error'); console.error("Exam generation error:", err);
      const structuredErrorType = err?.errorType ?? err?.code ?? null;
      const errorMessage = err?.message?.toLowerCase() || '';

      const isRateLimit = structuredErrorType === 'rate_limited' || structuredErrorType === '429' || (!structuredErrorType && (errorMessage.includes('429') || errorMessage.includes('limit') || errorMessage.includes('too many requests')));
      const isTimeout = structuredErrorType === 'timeout' || (!structuredErrorType && (errorMessage.includes('timeout') || errorMessage.includes('timed out')));
      const isJsonError = structuredErrorType === 'json_parse_error' || (!structuredErrorType && (errorMessage.includes('json') || errorMessage.includes('546')));

      if (isRateLimit || isTimeout || isJsonError) {
        showToast('error', 'Server Busy', 'A lot of students are generating exams right now. Please wait 10 seconds and try again.');
        setErrorMsg("Server busy. Please wait 10 seconds and retry.");
      } else if (errorMessage.includes('network') || errorMessage.includes('failed to fetch')) {
        showToast('error', 'No Internet Connection', 'Please check your Wi-Fi or mobile data and try again.');
        setErrorMsg("No internet connection.");
      } else if (errorMessage.includes('session expired') || errorMessage.includes('log in again') || errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
        showToast('info', 'Session Expired', 'Please sign in again, then retry generating your exam.');
        setErrorMsg("Session expired. Please log in again.");
      } else {
        showToast('error', 'Generation Failed', 'We could not generate the exam for this file. Use a standard text-based PDF or DOCX.');
        setErrorMsg(err?.message || "Failed to generate exam.");
      }
      animateProgress(0);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={theme === 'dark' ? "light-content" : "dark-content"} />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <Text style={styles.title}>Exam Generator</Text>
            <Text style={styles.subtitle}>50-Item University Level</Text>
          </View>

          {!pickedFile && (
            <View>
              <Animated.View style={[styles.uploadCard, { transform: [{ scale: cardScale }] }]}>
                <TouchableOpacity style={[styles.uploadTouchable, isWorking && { opacity: 0.5 }]} onPress={handlePick} activeOpacity={1} disabled={isWorking}>
                  <View style={styles.uploadCenter}>
                    <View style={styles.uploadIconOuter}>
                      <View style={styles.uploadIconInner}>
                        <Feather name="file-text" size={36} color={ACCENT} />
                      </View>
                    </View>
                    <Text style={styles.uploadTitle}>Upload Syllabus or Notes</Text>
                    <Text style={styles.uploadSubtitle}>PDF or DOCX (Max: 5MB)</Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}

          {pickedFile && (
            <View style={styles.section}>
              
              {/* STATE 2A: The massive Lottie Working screen using loading.json */}
              {isWorking && (
                <View style={styles.workingContainer}>
                  <LottieView source={require('../../assets/loading.json')} autoPlay loop style={{ width: 280, height: 280 }} />
                  <Text style={styles.workingTitle}>
                    {uploadState === 'uploading' ? 'Uploading Document...' : 'Generating Exam...'}
                  </Text>
                  <Text style={styles.workingSubtitle}>
                    {uploadState === 'uploading' 
                      ? `Securely sending ${pickedFile.name} to the cloud.` 
                      : 'Drafting 50 challenging questions. This usually takes a minute.'}
                  </Text>
                  <View style={styles.largeProgressTrack}>
                    <Animated.View style={[styles.largeProgressFill, { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
                  </View>
                </View>
              )}

              {/* STATE 2B: The "Ready to Analyze" Redesigned Dock */}
              {!isWorking && uploadState !== 'done' && (
                 <View style={styles.readyContainer}>
                    <View style={styles.readyFilePreview}>
                      <View style={styles.readyFileIconWrap}>
                        <Feather name={pickedFile.mimeType === 'application/pdf' ? 'file-text' : 'file'} size={32} color={ACCENT} />
                      </View>
                      <Text style={styles.readyFileName} numberOfLines={1}>{pickedFile.name}</Text>
                      <Text style={styles.readyFileSize}>{formatBytes(pickedFile.size)} • Ready for processing</Text>
                    </View>

                    {uploadState === 'error' && (
                      <View style={styles.readyErrorBox}>
                        <Feather name="alert-triangle" size={14} color={colors.danger} />
                        <Text style={styles.readyErrorText}>{errorMsg}</Text>
                      </View>
                    )}

                    <View style={styles.analyzeBtnWrapper}>
                      <Animated.View style={[
                        styles.analyzeBtnGlow,
                        {
                          transform: [{ scale: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
                          opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] })
                        }
                      ]} />
                      <TouchableOpacity 
                        style={[styles.analyzeBtn, uploadState === 'error' && { backgroundColor: colors.danger }, examsLeft === 0 && { backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : colors.border }]} 
                        onPress={handleGenerateExam} 
                        activeOpacity={0.85}
                        disabled={examsLeft === 0}
                      >
                         <Feather name={examsLeft === 0 ? 'lock' : uploadState === 'error' ? 'rotate-cw' : 'zap'} size={22} color={examsLeft === 0 ? colors.textDim : "#fff"} />
                         <Text style={[styles.analyzeBtnText, examsLeft === 0 && { color: colors.textDim }]}>
                           {examsLeft === 0 ? 'Daily Limit Reached' : uploadState === 'error' ? 'Retry Generation' : `Generate Exam (${examsLeft} left)`}
                         </Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={styles.changeFileBtn} onPress={handlePick}>
                      <Feather name="refresh-ccw" size={14} color={colors.textDim} />
                      <Text style={styles.changeFileText}>Select a different file</Text>
                    </TouchableOpacity>
                 </View>
              )}

              {/* STATE 2C: Done Compact Header */}
              {uploadState === 'done' && (
                <View style={styles.doneCompactCard}>
                  <View style={styles.doneCompactIcon}>
                    <Feather name={pickedFile.mimeType === 'application/pdf' ? 'file-text' : 'file'} size={20} color={ACCENT} />
                  </View>
                  <View style={styles.doneCompactMeta}>
                    <Text style={styles.doneCompactName} numberOfLines={1}>{pickedFile.name}</Text>
                    <Text style={styles.doneCompactSize}>{formatBytes(pickedFile.size)}</Text>
                  </View>
                  <TouchableOpacity style={styles.newUploadBtn} onPress={handleRemove} activeOpacity={0.7}>
                    <Feather name="trash-2" size={16} color={colors.textDim} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {examResult && uploadState === 'done' && (
            <View style={{ gap: 14, paddingHorizontal: 24, marginTop: 20 }}>
              <Animated.View style={{ opacity: doneAnim, transform: [{ translateY: doneAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }] }}>
                <View style={styles.doneBanner}>
                  <View style={styles.doneBannerLeft}>
                    <View style={styles.doneIconWrap}><Feather name="check" size={18} color={colors.success} /></View>
                    <View>
                      <Text style={styles.doneBannerTitle}>Exam Generated!</Text>
                      <Text style={styles.doneBannerSub}>Good luck on your mixed-format exam.</Text>
                    </View>
                  </View>
                </View>
              </Animated.View>

              <View style={[styles.contentSection, { paddingHorizontal: 0, marginTop: 0 }]}>
                <View style={styles.contentHeader}>
                  <Text style={styles.contentTitle}>Final Examination (mixed format)</Text>
                </View>
                <View style={{ gap: 16 }}>
                  {examResult.multipleChoice.length > 0 && (
                    <View style={{ gap: 10 }}>
                      <Text style={styles.sectionLabel}>Multiple Choice ({examResult.multipleChoice.length})</Text>
                      <View style={styles.quizList}>
                        {examResult.multipleChoice.map((q, i) => <ExamCard key={`mc-${i}`} item={q} index={i} />)}
                      </View>
                    </View>
                  )}

                  {examResult.identification.length > 0 && (
                    <View style={styles.sectionBlock}>
                      <Text style={styles.sectionLabel}>Identification ({examResult.identification.length})</Text>
                      {examResult.identification.map((q, i) => (
                        <View key={`id-${i}`} style={styles.textItemCard}>
                          <Text style={styles.textItemQuestion}>{i + 1}. {q.question}</Text>
                          <Text style={styles.textItemAnswerLabel}>Expected answer</Text>
                          <Text style={styles.textItemAnswer}>{q.expectedAnswer}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {examResult.enumeration.length > 0 && (
                    <View style={styles.sectionBlock}>
                      <Text style={styles.sectionLabel}>Enumeration ({examResult.enumeration.length})</Text>
                      {examResult.enumeration.map((q, i) => (
                        <View key={`enum-${i}`} style={styles.textItemCard}>
                          <Text style={styles.textItemQuestion}>{i + 1}. {q.question}</Text>
                          <View style={styles.enumList}>
                            {q.items.map((item, idx) => (
                              <Text key={`enum-${i}-${idx}`} style={styles.enumItem}>• {item}</Text>
                            ))}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {examResult.shortAnswer.length > 0 && (
                    <View style={styles.sectionBlock}>
                      <Text style={styles.sectionLabel}>Short Answer ({examResult.shortAnswer.length})</Text>
                      {examResult.shortAnswer.map((q, i) => (
                        <View key={`short-${i}`} style={styles.textItemCard}>
                          <Text style={styles.textItemQuestion}>{i + 1}. {q.question}</Text>
                          <Text style={styles.textItemAnswerLabel}>Guidance</Text>
                          <Text style={styles.textItemAnswer}>{q.guidance}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {examResult.quantitative.length > 0 && (
                    <View style={styles.sectionBlock}>
                      <Text style={styles.sectionLabel}>Quantitative ({examResult.quantitative.length})</Text>
                      {examResult.quantitative.map((q, i) => (
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
              </View>
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

    header: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 16 },
    title: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.5, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
    subtitle: { fontSize: 13, color: ACCENT, fontWeight: '600', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },

    uploadCard: { marginHorizontal: 24, marginTop: 10, height: SW * 0.60, borderRadius: 24, backgroundColor: isDark ? 'rgba(155,81,224,0.05)' : colors.cardBg, borderWidth: 1.5, borderColor: isDark ? ACCENT_BORDER : colors.border, borderStyle: 'dashed', overflow: 'hidden' },
    uploadTouchable: { flex: 1 },
    uploadCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
    uploadIconOuter: { width: 100, height: 100, borderRadius: 50, backgroundColor: isDark ? 'rgba(155,81,224,0.08)' : colors.background, borderWidth: 1, borderColor: isDark ? 'rgba(155,81,224,0.15)' : colors.border, alignItems: 'center', justifyContent: 'center' },
    uploadIconInner: { width: 72, height: 72, borderRadius: 36, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: isDark ? ACCENT_BORDER : colors.border, alignItems: 'center', justifyContent: 'center' },
    uploadTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
    uploadSubtitle: { fontSize: 12, color: colors.textDim },

    section: { paddingHorizontal: 24, marginTop: 10, gap: 14 },

    readyContainer: { backgroundColor: colors.cardBg, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 30, alignItems: 'center', gap: 20 },
    readyFilePreview: { alignItems: 'center', gap: 8, marginBottom: 6 },
    readyFileIconWrap: { width: 72, height: 72, borderRadius: 20, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: isDark ? ACCENT_BORDER : colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    readyFileName: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center', paddingHorizontal: 10, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-bold' }) },
    readyFileSize: { fontSize: 13, color: colors.textDim, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    readyErrorBox: { flexDirection: 'row', backgroundColor: colors.dangerDim, borderWidth: 1, borderColor: isDark ? 'rgba(255,82,82,0.2)' : colors.danger, padding: 12, borderRadius: 12, gap: 8, width: '100%' },
    readyErrorText: { color: colors.danger, fontSize: 12, flex: 1, lineHeight: 18 },
    
    analyzeBtnWrapper: { width: '100%', position: 'relative', marginTop: 10 },
    analyzeBtnGlow: { ...StyleSheet.absoluteFillObject, backgroundColor: ACCENT, borderRadius: 20 },
    analyzeBtn: { backgroundColor: ACCENT, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 12 },
    analyzeBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-bold' }) },
    
    changeFileBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
    changeFileText: { color: colors.textDim, fontSize: 13, fontWeight: '500', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },

    doneCompactCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 14 },
    doneCompactIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: ACCENT_DIM, alignItems: 'center', justifyContent: 'center' },
    doneCompactMeta: { flex: 1 },
    doneCompactName: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 2 },
    doneCompactSize: { color: colors.textDim, fontSize: 11 },
    newUploadBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.background, alignItems: 'center', justifyContent: 'center' },

    workingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, backgroundColor: colors.cardBg, borderRadius: 24, borderWidth: 1, borderColor: colors.border },
    workingTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 10, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-bold' }) },
    workingSubtitle: { fontSize: 13, color: colors.textDim, textAlign: 'center', paddingHorizontal: 30, marginTop: 8, lineHeight: 20 },
    largeProgressTrack: { width: '80%', height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: 24, overflow: 'hidden' },
    largeProgressFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 3 },
    
    contentSection: { paddingHorizontal: 24, marginTop: 20, gap: 12 },
    contentHeader:  { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    contentTitle: { fontSize: 18, fontWeight: '700', color: colors.text },

    quizList: { gap: 14 },
    quizCard: { backgroundColor: colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
    quizQuestion: { fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 20 },
    quizOptions:  { gap: 8 },
    quizOption:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
    quizOptionLetter: { fontSize: 12, fontWeight: '700', width: 18 },
    quizOptionText:   { fontSize: 13, flex: 1, lineHeight: 18 },
    quizExplanation:  { flexDirection: 'row', gap: 7, alignItems: 'flex-start', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.background, borderRadius: 10, padding: 10 },
    quizExplanationText: { fontSize: 12, color: colors.textDim, flex: 1, lineHeight: 17 },
    sectionLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
    sectionBlock: { gap: 10 },
    textItemCard: { backgroundColor: colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
    textItemQuestion: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
    textItemAnswerLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
    textItemAnswer: { color: colors.text, fontSize: 13, lineHeight: 18 },
    enumList: { gap: 4, marginTop: 4 },
    enumItem: { color: colors.text, fontSize: 13, lineHeight: 18 },
    doneBanner: { backgroundColor: isDark ? 'rgba(52,199,138,0.08)' : '#ECFDF5', borderRadius: 16, borderWidth: 1, borderColor: isDark ? 'rgba(52,199,138,0.2)' : '#D1FAE5', padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    doneBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    doneIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? 'rgba(52,199,138,0.12)' : '#D1FAE5', alignItems: 'center', justifyContent: 'center' },
    doneBannerTitle: { fontSize: 14, fontWeight: '600', color: colors.success, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
    doneBannerSub:   { fontSize: 11, color: isDark ? 'rgba(52,199,138,0.6)' : '#059669', marginTop: 1, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  });
};