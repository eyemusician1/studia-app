// src/screens/ExamScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, Animated, Easing, ActivityIndicator, ScrollView, Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';

const ACCENT        = '#9B51E0'; // Purple accent to differentiate from the Blue Home screen
const ACCENT_DIM    = 'rgba(155,81,224,0.10)';
const ACCENT_BORDER = 'rgba(155,81,224,0.22)';
const SUCCESS       = '#34C78A';
const DANGER        = '#FF5252';
const CARD_BG       = 'rgba(255,255,255,0.035)';
const SW            = Dimensions.get('window').width;

type PickedFile  = { name: string; uri: string; size: number; mimeType: string };
type UploadState = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';
type ExamItem    = { question: string; options: string[]; correctIndex: number; explanation: string };

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper to safely parse storage numbers
const parseQuotaValue = (value: string | null): number => {
  if (value == null) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

function ExamCard({ item, index }: { item: ExamItem; index: number }) {
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

export default function ExamScreen() {
  const { user } = useAuth();
  const [pickedFile,  setPickedFile]  = useState<PickedFile | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMsg,    setErrorMsg]    = useState('');
  const [examResult,  setExamResult]  = useState<ExamItem[] | null>(null);

  const cardScale    = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const doneAnim     = useRef(new Animated.Value(0)).current;

  // --- NEW DAILY QUOTA SYSTEM ---
  const MAX_DAILY_EXAMS = 1;
  const [examQuotaUsed, setExamQuotaUsed] = useState(0);

  useEffect(() => {
    const loadDailyQuotas = async () => {
      if (!user) return;
      
      const today = new Date().toLocaleDateString();
      try {
        const storedDate = await AsyncStorage.getItem(`@studia_date_${user.id}`);

        if (storedDate !== today) {
          // It's a new day! Reset quotas to 0
          await AsyncStorage.setItem(`@studia_date_${user.id}`, today);
          await AsyncStorage.setItem(`@studia_upload_quota_${user.id}`, '0');
          await AsyncStorage.setItem(`@studia_exam_quota_${user.id}`, '0');
          setExamQuotaUsed(0);
        } else {
          // Same day, load existing exam quota
          const eQuota = await AsyncStorage.getItem(`@studia_exam_quota_${user.id}`);
          setExamQuotaUsed(parseQuotaValue(eQuota));
        }
      } catch (err) {
        console.error("Error loading quotas", err);
      }
    };
    loadDailyQuotas();
  }, [user]);

  // Determines if buttons should be disabled to prevent double-taps
  const isWorking = uploadState === 'uploading' || uploadState === 'analyzing';

  const animateProgress = (to: number) =>
    Animated.timing(progressAnim, { toValue: to, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();

  const showDoneBanner = () => { doneAnim.setValue(0); Animated.spring(doneAnim, { toValue: 1, tension: 120, friction: 10, useNativeDriver: true }).start(); };

  const handlePick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      copyToCacheDirectory: true,
    });
    if (!res.canceled) {
      const asset = res.assets[0];

      if (asset.size && asset.size > 5 * 1024 * 1024) {
        Alert.alert(
          "File Too Large", 
          "Please upload a document smaller than 5MB to ensure the AI can process it quickly."
        );
        return; 
      }

      setPickedFile({ name: asset.name, uri: asset.uri, size: asset.size ?? 0, mimeType: asset.mimeType ?? 'application/octet-stream' });
      setUploadState('idle');
      setExamResult(null);
      setErrorMsg('');
      progressAnim.setValue(0);
    }
  };

  const handleRemove = () => {
    setPickedFile(null);
    setUploadState('idle');
    setExamResult(null);
    setErrorMsg('');
    progressAnim.setValue(0);
  };

  const handleGenerateExam = async () => {
    if (!pickedFile || !user) return;

    // --- STOP THEM IF OUT OF EXAMS ---
    if (examQuotaUsed >= MAX_DAILY_EXAMS) {
      Alert.alert(
        "Daily Limit Reached", 
        "You have used your 1 free exam generation for today. Please come back tomorrow!"
      );
      return; 
    }

    try {
      setUploadState('uploading');
      animateProgress(0.15);
      
      const nameParts = pickedFile.name.split('.');
      const ext = nameParts.length > 1 ? nameParts[nameParts.length - 1] : null;
      const storagePath = ext ? `${user.id}/exams/${Date.now()}.${ext}` : `${user.id}/exams/${Date.now()}`;
      
      animateProgress(0.35);

      // Safer Base64 decoding using base64-arraybuffer
      const base64Str = await FileSystem.readAsStringAsync(pickedFile.uri, { encoding: FileSystem.EncodingType.Base64 });
      const fileData = decode(base64Str);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('study-materials').upload(storagePath, fileData, { contentType: pickedFile.mimeType, upsert: false });
        
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
      
      animateProgress(0.55);
      setUploadState('analyzing');
      animateProgress(0.75);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session. Please log in again.');
      
      const { data: fnData, error: fnError } = await supabase.functions.invoke('generate-exam', {
        body: { storagePath: uploadData.path, fileName: pickedFile.name, userId: user.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      
      if (fnError) throw new Error(`Generation failed: ${fnError.message}`);
      if (!fnData?.success || !fnData?.exam) throw new Error(fnData?.error ?? 'Failed to generate 50 items.');
      
      animateProgress(1);
      setExamResult(fnData.exam);

      try {
        const newLesson = {
          id: Date.now().toString(),
          fileName: `[EXAM] ${pickedFile.name}`,
          date: new Date().toLocaleDateString(),
          content: {
            summary: "50-Item Objective University Level Exam",
            keyConceptsList: [],
            flashcards: [],
            quiz: [],
            hardQuiz: fnData.exam 
          }
        };
        const existingHistory = await AsyncStorage.getItem('@studia_history');
        
        let historyArray = [];
        if (existingHistory) {
          try {
             historyArray = JSON.parse(existingHistory);
          } catch (e) {
             console.error("Corrupted history JSON found, resetting.");
          }
        }
        historyArray.unshift(newLesson);
        await AsyncStorage.setItem('@studia_history', JSON.stringify(historyArray));
      } catch (storageError) {
        console.error("Offline save failed:", storageError);
      }

      // --- DEDUCT EXAM QUOTA ---
      if (user) {
        const newQuota = examQuotaUsed + 1;
        setExamQuotaUsed(newQuota);
        await AsyncStorage.setItem(`@studia_exam_quota_${user.id}`, newQuota.toString());
      }

      setUploadState('done');
      showDoneBanner();

    } catch (err: any) {
      setUploadState('error');
      console.error("Exam generation error:", err);
      
      const structuredErrorType = err?.errorType ?? err?.code ?? null;
      const errorMessage = err?.message?.toLowerCase() || '';

      const isRateLimit = structuredErrorType === 'rate_limited' || structuredErrorType === '429' || (!structuredErrorType && (errorMessage.includes('429') || errorMessage.includes('limit') || errorMessage.includes('too many requests')));
      const isTimeout = structuredErrorType === 'timeout' || (!structuredErrorType && (errorMessage.includes('timeout') || errorMessage.includes('timed out')));
      const isJsonError = structuredErrorType === 'json_parse_error' || (!structuredErrorType && (errorMessage.includes('json') || errorMessage.includes('546')));

      if (isRateLimit || isTimeout || isJsonError) {
        Alert.alert("Server is Catching its Breath!", "A lot of students are generating exams right now. Please wait 10 seconds and try again!");
        setErrorMsg("Server busy. Please wait 10 seconds and retry.");
      } else if (errorMessage.includes('network') || errorMessage.includes('failed to fetch')) {
        Alert.alert("No Internet Connection", "Please check your Wi-Fi or mobile data and try again.");
        setErrorMsg("No internet connection.");
      } else {
        Alert.alert("Generation Failed", "We couldn't generate the exam for this specific file. Please make sure it is a standard text-based PDF or DOCX.");
        setErrorMsg("Failed to generate exam.");
      }
      animateProgress(0);
    }
  };

  const examsLeft = Math.max(0, MAX_DAILY_EXAMS - examQuotaUsed);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <Text style={styles.title}>Exam Generator</Text>
            <Text style={styles.subtitle}>50-Item University Level</Text>
          </View>

          {!pickedFile && (
            <View>
              <Animated.View style={[styles.uploadCard, { transform: [{ scale: cardScale }] }]}>
                <TouchableOpacity 
                  style={[styles.uploadTouchable, isWorking && { opacity: 0.5 }]} 
                  onPress={handlePick} 
                  activeOpacity={1}
                  disabled={isWorking}
                >
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
              <View style={styles.attachCard}>
                <View style={styles.fileRow}>
                  <View style={styles.fileIconWrap}>
                    <Feather name={pickedFile.mimeType === 'application/pdf' ? 'file-text' : 'file'} size={20} color={ACCENT} />
                  </View>
                  <View style={styles.fileMeta}>
                    <Text style={styles.fileName} numberOfLines={1}>{pickedFile.name}</Text>
                    <Text style={styles.fileSize}>{formatBytes(pickedFile.size)}</Text>
                  </View>
                  {!isWorking && uploadState !== 'done' && (
                    <TouchableOpacity style={styles.removeBtn} onPress={handleRemove} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                      <Feather name="x" size={14} color="rgba(255,255,255,0.35)" />
                    </TouchableOpacity>
                  )}
                </View>

                {(isWorking || uploadState === 'done') && (
                  <View style={styles.progressTrack}>
                    <Animated.View style={[styles.progressFill, { width: progressAnim.interpolate({ inputRange: [0,1], outputRange: ['0%','100%'] }) }]} />
                  </View>
                )}

                {isWorking && (
                  <View style={styles.statusRow}>
                    <ActivityIndicator size="small" color={ACCENT} />
                    <Text style={styles.statusText}>{uploadState === 'uploading' ? 'Uploading...' : 'Drafting 50-item exam. This may take a minute...'}</Text>
                  </View>
                )}

                {uploadState === 'error' && (
                  <View style={styles.errorRow}>
                    <Feather name="alert-circle" size={13} color={DANGER} />
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                )}

                {!isWorking && uploadState !== 'done' && (
                  <TouchableOpacity 
                    style={[
                      styles.primaryBtn, 
                      uploadState === 'error' && { backgroundColor: '#C0392B' },
                      examsLeft === 0 && { backgroundColor: 'rgba(255,255,255,0.1)' }
                    ]} 
                    onPress={handleGenerateExam}
                    disabled={isWorking || examsLeft === 0}
                  >
                    <Feather name={examsLeft === 0 ? 'lock' : uploadState === 'error' ? 'rotate-cw' : 'zap'} size={15} color={examsLeft === 0 ? "rgba(255,255,255,0.4)" : "#fff"} />
                    <Text style={[styles.primaryBtnText, examsLeft === 0 && { color: 'rgba(255,255,255,0.4)' }]}>
                      {examsLeft === 0 ? 'Daily Limit Reached' : uploadState === 'error' ? 'Retry Exam Generation' : `Generate 50 Items (${examsLeft} left)`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {examResult && uploadState === 'done' && (
            <View style={{ gap: 14, paddingHorizontal: 24, marginTop: 20 }}>
              {/* --- NEW ANIMATED BANNER --- */}
              <Animated.View style={{
                opacity: doneAnim,
                transform: [{ translateY: doneAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }]
              }}>
                <View style={styles.doneBanner}>
                  <View style={styles.doneBannerLeft}>
                    <View style={styles.doneIconWrap}>
                      <Feather name="check" size={18} color={SUCCESS} />
                    </View>
                    <View>
                      <Text style={styles.doneBannerTitle}>Exam Generated!</Text>
                      <Text style={styles.doneBannerSub}>Good luck on your 50-item test.</Text>
                    </View>
                  </View>
                </View>
              </Animated.View>

              <View style={[styles.contentSection, { paddingHorizontal: 0, marginTop: 0 }]}>
                <View style={styles.contentHeader}>
                  <Text style={styles.contentTitle}>Final Examination ({examResult.length} items)</Text>
                </View>
                <View style={styles.quizList}>
                  {examResult.map((q, i) => <ExamCard key={`exam-q-${i}`} item={q} index={i} />)}
                </View>
              </View>
            </View>
          )}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0D12' },
  safe:   { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 56 },

  header: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
  subtitle: { fontSize: 13, color: ACCENT, fontWeight: '600', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },

  /* --- NEW PRO TIP STYLES FOR EXAM SCREEN --- */
  tipBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(155,81,224,0.08)', borderWidth: 1, borderColor: 'rgba(155,81,224,0.15)', borderRadius: 12, padding: 12, marginHorizontal: 24, marginTop: 16, gap: 10 },
  tipIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(155,81,224,0.15)', alignItems: 'center', justifyContent: 'center' },
  tipText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 18, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },

  uploadCard: { marginHorizontal: 24, marginTop: 10, height: SW * 0.60, borderRadius: 24, backgroundColor: 'rgba(155,81,224,0.05)', borderWidth: 1.5, borderColor: ACCENT_BORDER, borderStyle: 'dashed', overflow: 'hidden' },
  uploadTouchable: { flex: 1 },
  uploadCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  uploadIconOuter: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(155,81,224,0.08)', borderWidth: 1, borderColor: 'rgba(155,81,224,0.15)', alignItems: 'center', justifyContent: 'center' },
  uploadIconInner: { width: 72, height: 72, borderRadius: 36, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, alignItems: 'center', justifyContent: 'center' },
  uploadTitle: { fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  uploadSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.3)' },

  section:     { paddingHorizontal: 24, marginTop: 10, gap: 14 },
  attachCard:  { backgroundColor: CARD_BG, borderRadius: 20, borderWidth: 1, borderColor: ACCENT_BORDER, padding: 16, gap: 14 },
  fileRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fileIconWrap:{ width: 46, height: 46, borderRadius: 13, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, alignItems: 'center', justifyContent: 'center' },
  fileMeta:    { flex: 1, gap: 3 },
  fileName:    { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  fileSize:    { fontSize: 11, color: 'rgba(255,255,255,0.32)' },
  removeBtn:   { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  progressFill:  { height: 3, borderRadius: 2, backgroundColor: ACCENT },
  statusRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText:  { fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  errorRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  errorText:   { fontSize: 12, color: DANGER, flex: 1, lineHeight: 17 },
  
  primaryBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 12, backgroundColor: ACCENT },
  primaryBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },

  contentSection: { paddingHorizontal: 24, marginTop: 20, gap: 12 },
  contentHeader:  { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  contentTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },

  quizList: { gap: 14 },
  quizCard: { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 16, gap: 12 },
  quizQuestion: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', lineHeight: 20 },
  quizOptions:  { gap: 8 },
  quizOption:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  quizOptionLetter: { fontSize: 12, fontWeight: '700', width: 18 },
  quizOptionText:   { fontSize: 13, flex: 1, lineHeight: 18 },
  quizExplanation:  { flexDirection: 'row', gap: 7, alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10 },
  quizExplanationText: { fontSize: 12, color: 'rgba(255,255,255,0.45)', flex: 1, lineHeight: 17 },
  doneBanner: { backgroundColor: 'rgba(52,199,138,0.08)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(52,199,138,0.2)', padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  doneBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  doneIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(52,199,138,0.12)', alignItems: 'center', justifyContent: 'center' },
  doneBannerTitle: { fontSize: 14, fontWeight: '600', color: SUCCESS, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  doneBannerSub:   { fontSize: 11, color: 'rgba(52,199,138,0.6)', marginTop: 1, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
});