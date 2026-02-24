// src/screens/HomeScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Platform, Animated, Easing, ActivityIndicator, ScrollView, Dimensions, Alert, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCENT        = '#3B6FD4';
const ACCENT_DIM    = 'rgba(59,111,212,0.10)';
const ACCENT_BORDER = 'rgba(59,111,212,0.22)';
const SUCCESS       = '#34C78A';
const DANGER        = '#FF5252';
const CARD_BG       = 'rgba(255,255,255,0.035)';
const SW            = Dimensions.get('window').width;

type PickedFile     = { name: string; uri: string; size: number; mimeType: string };
type UploadState    = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';
type ActiveView     = null | 'summary' | 'concepts' | 'flashcards' | 'quiz' | 'hardQuiz' | 'exam';
type Concept        = { term: string; definition: string };
type Flashcard      = { question: string; answer: string };
type QuizItem       = { question: string; options: string[]; correctIndex: number; explanation: string };
type AnalysisResult = { summary: string; keyConceptsList: Concept[]; flashcards: Flashcard[]; quiz: QuizItem[]; hardQuiz: QuizItem[]; exam?: QuizItem[] };

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function FlashCard({ card }: { card: Flashcard }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <TouchableOpacity style={[styles.flashCard, flipped && styles.flashCardFlipped]} onPress={() => setFlipped(!flipped)} activeOpacity={0.85}>
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
            <TouchableOpacity key={`opt-${i}`} style={[styles.quizOption, { backgroundColor: bg, borderColor: border }]} onPress={() => { if (selected === null) setSelected(i); }} activeOpacity={0.8} disabled={selected !== null}>
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

export default function HomeScreen() {
  const { profile, user } = useAuth();
  const first    = (profile?.first_name ?? '').charAt(0) || '?';
  const last     = (profile?.last_name  ?? '').charAt(0) || '';
  const initials = (first + last).toUpperCase();

  const [pickedFile,  setPickedFile]  = useState<PickedFile | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMsg,    setErrorMsg]    = useState('');
  const [result,      setResult]      = useState<AnalysisResult | null>(null);
  const [activeView,  setActiveView]  = useState<ActiveView>(null);

  // Exam Generation Mechanics
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [examQuotaUsed, setExamQuotaUsed]       = useState(0);
  const [isGeneratingExam, setIsGeneratingExam] = useState(false);

  const cardScale    = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const doneAnim     = useRef(new Animated.Value(0)).current;

  // The isWorking check helps us disable buttons when AI is thinking
  const isWorking = uploadState === 'uploading' || uploadState === 'analyzing';

  useEffect(() => {
    const loadQuota = async () => {
      if (!user) return;
      const quota = await AsyncStorage.getItem(`@studia_exam_quota_${user.id}`);
      if (quota) setExamQuotaUsed(parseInt(quota));
    };
    loadQuota();
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
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], copyToCacheDirectory: true });
    if (!res.canceled) {
      const asset = res.assets[0];

      // --- NEW SIZE LIMIT CHECK ---
      if (asset.size && asset.size > 5 * 1024 * 1024) {
        Alert.alert(
          "File Too Large", 
          "Please upload a document smaller than 5MB."
        );
        return; // Stops the upload completely
      }
      // ----------------------------

      setPickedFile({ name: asset.name, uri: asset.uri, size: asset.size ?? 0, mimeType: asset.mimeType ?? 'application/octet-stream' });
      setUploadState('idle'); setResult(null); setActiveView(null); setErrorMsg(''); setUploadedFilePath(null); setCurrentHistoryId(null);
      progressAnim.setValue(0); doneAnim.setValue(0);
    }
  };

  const handleRemove = () => { setPickedFile(null); setUploadState('idle'); setResult(null); setActiveView(null); setErrorMsg(''); setUploadedFilePath(null); setCurrentHistoryId(null); progressAnim.setValue(0); doneAnim.setValue(0); };

  const handleAnalyze = async () => {
    if (!pickedFile || !user) return;
    try {
      setUploadState('uploading'); animateProgress(0.15);
      const nameParts = pickedFile.name.split('.');
      const ext = nameParts.length > 1 ? nameParts[nameParts.length - 1] : null;
      const storagePath = ext ? `${user.id}/${Date.now()}.${ext}` : `${user.id}/${Date.now()}`;
      
      setUploadedFilePath(storagePath); 

      animateProgress(0.35);
      const base64 = await FileSystem.readAsStringAsync(pickedFile.uri, { encoding: FileSystem.EncodingType.Base64 });
      const binaryStr = base64.replace(/[^A-Za-z0-9+/=]/g, '');
      const byteCount = Math.floor(binaryStr.length * 3 / 4);
      const byteArray = new Uint8Array(byteCount);
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const lut: number[] = new Array(256).fill(-1);
      for (let i = 0; i < chars.length; i++) lut[chars.charCodeAt(i)] = i;
      let out = 0;
      for (let i = 0; i < binaryStr.length - 3; i += 4) {
        const c0 = lut[binaryStr.charCodeAt(i)] ?? 0; const c1 = lut[binaryStr.charCodeAt(i+1)] ?? 0; const c2 = lut[binaryStr.charCodeAt(i+2)] ?? 0; const c3 = lut[binaryStr.charCodeAt(i+3)] ?? 0;
        byteArray[out++] = (c0 << 2) | (c1 >> 4);
        if (binaryStr[i+2] !== '=') byteArray[out++] = ((c1 & 0xf) << 4) | (c2 >> 2);
        if (binaryStr[i+3] !== '=') byteArray[out++] = ((c2 & 0x3) << 6) | c3;
      }
      const uploadBytes = byteArray.slice(0, out);
      const { data: uploadData, error: uploadError } = await supabase.storage.from('study-materials').upload(storagePath, uploadBytes, { contentType: pickedFile.mimeType, upsert: false });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
      
      animateProgress(0.55); setUploadState('analyzing'); animateProgress(0.75);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session.');
      const { data: fnData, error: fnError } = await supabase.functions.invoke('analyze-material', {
        body: { storagePath: uploadData.path, fileName: pickedFile.name, userId: user.id }, headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (fnError) throw new Error(`Analysis failed: ${fnError.message}`);
      if (!fnData?.success) throw new Error(fnData?.error ?? 'Analysis returned no data');
      animateProgress(1);

      const generatedData = { summary: fnData.summary, keyConceptsList: fnData.keyConceptsList ?? [], flashcards: fnData.flashcards ?? [], quiz: fnData.quiz ?? [], hardQuiz: fnData.hardQuiz ?? [] };
      setResult(generatedData);

      try {
        const historyId = Date.now().toString();
        setCurrentHistoryId(historyId); 
        const newLesson = { id: historyId, fileName: pickedFile.name, date: new Date().toLocaleDateString(), content: generatedData };
        const existingHistory = await AsyncStorage.getItem('@studia_history');
        let historyArray = existingHistory ? JSON.parse(existingHistory) : [];
        historyArray.unshift(newLesson);
        await AsyncStorage.setItem('@studia_history', JSON.stringify(historyArray));
      } catch (e) { console.error(e); }

      setUploadState('done'); setActiveView(null); showDoneBanner();
      
      // Friendly Success Alert
      Alert.alert("Success!", "Your study materials are ready.");

    } catch (err: any) {
      setUploadState('error');
      console.error("Upload error:", err);
      const errorMessage = err?.message?.toLowerCase() || '';
      
      // --- NEW FRIENDLY ERROR HANDLING ---
      if (errorMessage.includes('json') || errorMessage.includes('546') || errorMessage.includes('timeout') || errorMessage.includes('429') || errorMessage.includes('limit')) {
        Alert.alert(
          "Server is Catching its Breath!", 
          "A lot of students are studying right now, and our free AI server is quite busy. Please wait 10 seconds and try again!"
        );
        setErrorMsg("Server busy. Please wait 10 seconds and retry.");
      } else if (errorMessage.includes('network') || errorMessage.includes('failed to fetch')) {
        Alert.alert(
          "No Internet Connection", 
          "Please check your Wi-Fi or mobile data and try again."
        );
        setErrorMsg("No internet connection.");
      } else {
        Alert.alert(
          "Analysis Failed", 
          "We couldn't read this specific file. Please make sure it is a standard text-based PDF or DOCX."
        );
        setErrorMsg("Failed to read document.");
      }
      animateProgress(0);
    }
  };

  const handleGenerateExam = async () => {
    if (!uploadedFilePath || !currentHistoryId) {
      Alert.alert("Error", "Missing file data. Please re-upload the document.");
      return;
    }

    try {
      setIsGeneratingExam(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session. Please log in again.');

      const { data: fnData, error: fnError } = await supabase.functions.invoke('generate-exam', {
        body: { storagePath: uploadedFilePath, fileName: pickedFile?.name, userId: user?.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) {
        throw new Error(`Connection Failed. Have you deployed the 'generate-exam' edge function yet? Error: ${fnError.message}`);
      }
      if (!fnData?.success || !fnData?.exam) {
        throw new Error(fnData?.error ?? 'Failed to generate 50 items. The AI might be busy.');
      }

      const newExam = fnData.exam;

      setResult(prev => prev ? { ...prev, exam: newExam } : null);

      const existingHistoryStr = await AsyncStorage.getItem('@studia_history');
      if (existingHistoryStr) {
        let historyArray = JSON.parse(existingHistoryStr);
        const index = historyArray.findIndex((item: any) => item.id === currentHistoryId);
        if (index !== -1) {
          historyArray[index].content.exam = newExam;
          await AsyncStorage.setItem('@studia_history', JSON.stringify(historyArray));
        }
      }

      if (user) {
        const newQuota = examQuotaUsed + 1;
        setExamQuotaUsed(newQuota);
        await AsyncStorage.setItem(`@studia_exam_quota_${user.id}`, newQuota.toString());
      }

      setActiveView('exam');
    } catch (err: any) {
      console.error(err);
      Alert.alert("Generation Failed", err?.message || "Something went wrong.");
    } finally {
      setIsGeneratingExam(false);
    }
  };

  const remainingExams = Math.max(0, 2 - examQuotaUsed);

  const OUTPUT_CARDS = [
    { key: 'summary'   as ActiveView, icon: 'align-left',   label: 'Summary',    desc: 'Document overview',   count: null },
    { key: 'concepts'  as ActiveView, icon: 'tag',          label: 'Concepts',   desc: 'Key terms & ideas',   count: result?.keyConceptsList.length },
    { key: 'flashcards'as ActiveView, icon: 'layers',       label: 'Flashcards', desc: 'Q&A study cards',     count: result?.flashcards.length },
    { key: 'quiz'      as ActiveView, icon: 'check-square', label: 'Quiz',       desc: 'Test your knowledge', count: result?.quiz.length },
    { key: 'hardQuiz'  as ActiveView, icon: 'award',        label: 'Hard Quiz',  desc: '5 Challenge questions', count: result?.hardQuiz?.length },
    { 
      key: 'exam'      as ActiveView, 
      icon: 'file-text',    
      label: 'Final Exam', 
      desc: result?.exam ? 'University Level' : `${remainingExams} remaining`, 
      count: result?.exam?.length, 
      isLocked: !result?.exam && examQuotaUsed >= 2 
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Image 
                source={require('../../assets/logo.png')} 
                style={styles.logoImage} 
                resizeMode="contain"
              />
              <Text style={styles.appName}>Studia</Text>
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>

          {/* Centered Upload State */}
          {!pickedFile && (
            <View style={styles.idleContainer}>
              <Animated.View style={[styles.uploadCard, { transform: [{ scale: cardScale }] }]}>
                <TouchableOpacity 
                  style={[styles.uploadTouchable, isWorking && { opacity: 0.5 }]} 
                  onPress={handlePick} 
                  activeOpacity={1}
                  disabled={isWorking}
                >
                  <View style={styles.gridLines} pointerEvents="none">
                    {[0,1,2,3].map(i => <View key={`h${i}`} style={[styles.gridLine,  { top:  `${25*(i+1)}%` as any }]} />)}
                    {[0,1,2,3].map(i => <View key={`v${i}`} style={[styles.gridLineV, { left: `${25*(i+1)}%` as any }]} />)}
                  </View>
                  
                  {isWorking ? (
                    <View style={styles.uploadCenter}>
                      <ActivityIndicator size="large" color={ACCENT} />
                      <Text style={styles.uploadTitle}>AI is reading your document...</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', marginTop: 8, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) }}>
                        Please do not close the app.{"\n"}This usually takes 5-10 seconds.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.uploadCenter}>
                      <View style={styles.uploadIconOuter}>
                        <View style={styles.uploadIconInner}>
                          <Feather name="upload-cloud" size={36} color={ACCENT} />
                        </View>
                      </View>
                      <Text style={styles.uploadTitle}>Drop your file here</Text>
                      <View style={styles.formatRow}>
                        <View style={styles.formatPill}><Text style={styles.formatText}>PDF</Text></View>
                        <View style={styles.formatDivider} />
                        <View style={styles.formatPill}><Text style={styles.formatText}>DOCX</Text></View>
                      </View>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>Max file size: 5MB</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>

              <Text style={styles.idleSubtitle}>
                Upload a document to instantly generate flashcards, quizzes, and exam.
              </Text>
            </View>
          )}

          {pickedFile && (
            <View style={styles.section}>
              <View style={styles.attachCard}>
                <View style={styles.fileRow}>
                  <View style={styles.fileIconWrap}><Feather name={pickedFile.mimeType === 'application/pdf' ? 'file-text' : 'file'} size={20} color={ACCENT} /></View>
                  <View style={styles.fileMeta}>
                    <Text style={styles.fileName} numberOfLines={1}>{pickedFile.name}</Text>
                    <Text style={styles.fileSize}>{formatBytes(pickedFile.size)}</Text>
                  </View>
                  {!isWorking && uploadState !== 'done' && (
                    <TouchableOpacity style={styles.removeBtn} onPress={handleRemove} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                      <Feather name="x" size={14} color="rgba(255,255,255,0.35)" />
                    </TouchableOpacity>
                  )}
                  {uploadState === 'done' && <View style={styles.successBadge}><Feather name="check" size={13} color={SUCCESS} /></View>}
                </View>

                {(isWorking || uploadState === 'done') && (
                  <View style={styles.progressTrack}>
                    <Animated.View style={[styles.progressFill, { backgroundColor: uploadState === 'done' ? SUCCESS : ACCENT, width: progressAnim.interpolate({ inputRange: [0,1], outputRange: ['0%','100%'] }) }]} />
                  </View>
                )}

                {isWorking && (
                  <View style={styles.statusRow}>
                    <ActivityIndicator size="small" color={ACCENT} />
                    <Text style={styles.statusText}>{uploadState === 'uploading' ? 'Uploading...' : 'AI is reading your document...'}</Text>
                  </View>
                )}

                {uploadState === 'error' && (
                  <View style={styles.errorRow}>
                    <Feather name="alert-circle" size={13} color={DANGER} />
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                )}

                {!isWorking && (
                  <View style={styles.actionRow}>
                    {uploadState !== 'done' && (
                      <TouchableOpacity style={styles.secondaryBtn} onPress={handlePick}>
                        <Feather name="refresh-ccw" size={13} color="rgba(255,255,255,0.5)" />
                        <Text style={styles.secondaryBtnText}>Change</Text>
                      </TouchableOpacity>
                    )}
                    {uploadState === 'done' ? (
                      <TouchableOpacity style={[styles.primaryBtn, { flex:1 }]} onPress={handleRemove}>
                        <Feather name="plus" size={15} color="#fff" />
                        <Text style={styles.primaryBtnText}>New upload</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.primaryBtn, uploadState === 'error' && { backgroundColor: '#C0392B' }]} onPress={handleAnalyze}>
                        <Feather name={uploadState === 'error' ? 'rotate-cw' : 'zap'} size={15} color="#fff" />
                        <Text style={styles.primaryBtnText}>{uploadState === 'error' ? 'Retry' : 'Analyze'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {result && uploadState === 'done' && activeView === null && !isGeneratingExam && (
                <View style={styles.outputGrid}>
                  {OUTPUT_CARDS.map((card) => {
                    const isLocked = card.isLocked;
                    return (
                      <TouchableOpacity
                        key={card.key}
                        style={[styles.outputCard, isLocked && styles.outputCardLocked]}
                        onPress={() => {
                          if (card.key === 'exam' && !result?.exam) {
                            if (isLocked) Alert.alert("Limit Reached", "You have already used your 2 exam generations to prevent AI exhaustion.");
                            else handleGenerateExam();
                          } else {
                            setActiveView(card.key);
                          }
                        }}
                        activeOpacity={isLocked ? 1 : 0.8}
                      >
                        <View style={styles.outputCardTop}>
                          <View style={[styles.outputIconWrap, isLocked && styles.outputIconWrapLocked]}>
                            <Feather name={isLocked ? "lock" : card.icon as any} size={20} color={isLocked ? "rgba(255,255,255,0.4)" : ACCENT} />
                          </View>
                          {!isLocked && <Feather name="arrow-right" size={14} color="rgba(255,255,255,0.2)" />}
                        </View>
                        <Text style={[styles.outputCardLabel, isLocked && styles.outputCardLabelLocked]}>{card.label}</Text>
                        <Text style={styles.outputCardDesc}>{card.desc}</Text>
                        {card.count != null && (
                          <View style={styles.outputCardCount}>
                            <Text style={styles.outputCardCountText}>{card.count} items</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* ── Generating Exam Overlay ── */}
              {isGeneratingExam && (
                <View style={styles.generatingOverlay}>
                  <ActivityIndicator size="large" color="#9B51E0" />
                  <Text style={styles.generatingText}>Drafting 50-Item Exam...</Text>
                  <Text style={styles.generatingSubText}>This may take up to 60 seconds.</Text>
                </View>
              )}

              {/* ── Active Content View ── */}
              {result && activeView !== null && (
                <View style={styles.contentSection}>
                  <View style={styles.contentHeader}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => setActiveView(null)}>
                      <Feather name="arrow-left" size={15} color="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                    <Text style={styles.contentTitle}>
                      {activeView === 'summary'    ? 'Summary'
                      : activeView === 'concepts'  ? `Key Concepts · ${result.keyConceptsList.length}`
                      : activeView === 'flashcards'? `Flashcards · ${result.flashcards.length}`
                      : activeView === 'quiz'      ? `Quiz · ${result.quiz.length}`
                      : activeView === 'exam'      ? `Final Exam · ${result.exam?.length}`
                      :                              `Hard Quiz · ${result.hardQuiz.length}`}
                    </Text>
                  </View>

                  {activeView === 'summary' && (
                    <View style={styles.summaryBox}><Text style={styles.summaryText}>{result.summary}</Text></View>
                  )}
                  {activeView === 'concepts' && (
                    <View style={styles.conceptsList}>
                      {result.keyConceptsList.map((c, i) => (
                        <View key={`concept-${i}`} style={styles.conceptItem}>
                          <View style={styles.conceptDot} /><View style={styles.conceptContent}><Text style={styles.conceptTerm}>{c.term}</Text><Text style={styles.conceptDef}>{c.definition}</Text></View>
                        </View>
                      ))}
                    </View>
                  )}
                  {activeView === 'flashcards' && (
                    <View style={styles.flashList}>
                      <View style={styles.hintRow}><Feather name="rotate-cw" size={11} color="rgba(255,255,255,0.25)" /><Text style={styles.hintText}>Tap a card to flip</Text></View>
                      {result.flashcards.map((fc, i) => <FlashCard key={`flashcard-${i}`} card={fc} />)}
                    </View>
                  )}
                  {activeView === 'quiz' && (
                    <View style={styles.quizList}>
                      <View style={styles.hintRow}><Feather name="target" size={11} color="rgba(255,255,255,0.25)" /><Text style={styles.hintText}>Tap an option to answer</Text></View>
                      {result.quiz.map((q, i) => <QuizCard key={`quiz-${i}`} item={q} index={i} />)}
                    </View>
                  )}
                  {activeView === 'hardQuiz' && (
                    <View style={styles.quizList}>
                      {result.hardQuiz.map((q, i) => <QuizCard key={`hard-quiz-${i}`} item={q} index={i} />)}
                    </View>
                  )}
                  {activeView === 'exam' && (
                    <View style={styles.quizList}>
                      <View style={styles.hintRow}><Feather name="award" size={11} color="rgba(255,255,255,0.25)" /><Text style={styles.hintText}>University Level Examination</Text></View>
                      {result.exam?.map((q, i) => <QuizCard key={`exam-q-${i}`} item={q} index={i} />)}
                    </View>
                  )}
                </View>
              )}

            </View>
          )}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0D12' },
  safe:   { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 56 },

  header: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 }, 
  logoImage: { width: 32, height: 32, borderRadius: 8 }, 
  appName: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.8, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
  appSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: ACCENT, letterSpacing: 0.5, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },

  idleContainer: { flex: 1, justifyContent: 'center', paddingBottom: 40 },
  idleSubtitle: { textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 24, paddingHorizontal: 40, lineHeight: 20, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },

  uploadCard: { marginHorizontal: 24, height: SW * 0.72, borderRadius: 24, backgroundColor: 'rgba(59,111,212,0.05)', borderWidth: 1.5, borderColor: ACCENT_BORDER, borderStyle: 'dashed', overflow: 'hidden' },
  uploadTouchable: { flex: 1 },
  gridLines:  { ...StyleSheet.absoluteFillObject },
  gridLine:   { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(59,111,212,0.07)' },
  gridLineV:  { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(59,111,212,0.07)' },
  uploadCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  uploadIconOuter: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(59,111,212,0.08)', borderWidth: 1, borderColor: 'rgba(59,111,212,0.15)', alignItems: 'center', justifyContent: 'center' },
  uploadIconInner: { width: 72, height: 72, borderRadius: 36, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, alignItems: 'center', justifyContent: 'center' },
  uploadTitle: { fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.75)', letterSpacing: -0.3, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  formatRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  formatPill: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER },
  formatText: { fontSize: 11, fontWeight: '700', color: ACCENT, letterSpacing: 1, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  formatDivider: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)' },

  section:     { paddingHorizontal: 24, marginTop: 10, gap: 14 },
  attachCard:  { backgroundColor: CARD_BG, borderRadius: 20, borderWidth: 1, borderColor: ACCENT_BORDER, padding: 16, gap: 14 },
  fileRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fileIconWrap:{ width: 46, height: 46, borderRadius: 13, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, alignItems: 'center', justifyContent: 'center' },
  fileMeta:    { flex: 1, gap: 3 },
  fileName:    { fontSize: 14, fontWeight: '600', color: '#FFFFFF', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  fileSize:    { fontSize: 11, color: 'rgba(255,255,255,0.32)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  removeBtn:   { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  successBadge:{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(52,199,138,0.12)', alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  progressFill:  { height: 3, borderRadius: 2 },
  statusRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText:  { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  errorRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  errorText:   { fontSize: 12, color: DANGER, flex: 1, lineHeight: 17, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  actionRow:   { flexDirection: 'row', gap: 10 },
  secondaryBtn:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  secondaryBtnText: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.5)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  primaryBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 12, backgroundColor: ACCENT },
  primaryBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },

  doneBanner: { backgroundColor: 'rgba(52,199,138,0.08)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(52,199,138,0.2)', padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  doneBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  doneIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(52,199,138,0.12)', alignItems: 'center', justifyContent: 'center' },
  doneBannerTitle: { fontSize: 14, fontWeight: '600', color: SUCCESS, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  doneBannerSub:   { fontSize: 11, color: 'rgba(52,199,138,0.6)', marginTop: 1, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  doneStatRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  doneStat:    { fontSize: 11, color: 'rgba(52,199,138,0.7)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },
  doneStatDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(52,199,138,0.4)' },

  outputGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  outputCard: { width: (SW - 48 - 10) / 2, backgroundColor: CARD_BG, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 16, gap: 6 },
  outputCardLocked: { backgroundColor: 'rgba(255,255,255,0.01)', borderColor: 'rgba(255,255,255,0.03)' },
  outputCardTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  outputIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, alignItems: 'center', justifyContent: 'center' },
  outputIconWrapLocked: { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'transparent' },
  outputCardLabel:{ fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.2, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },
  outputCardLabelLocked: { color: 'rgba(255,255,255,0.3)' },
  outputCardDesc: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
  outputCardCount:{ alignSelf: 'flex-start', marginTop: 4, backgroundColor: ACCENT_DIM, borderWidth: 1, borderColor: ACCENT_BORDER, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  outputCardCountText: { fontSize: 10, fontWeight: '600', color: ACCENT, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }) },

  generatingOverlay: { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(155,81,224,0.3)', padding: 30, alignItems: 'center', gap: 10, marginTop: 10 },
  generatingText: { color: '#FFF', fontSize: 16, fontWeight: '700', marginTop: 10 },
  generatingSubText: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },

  contentSection: { gap: 12 },
  contentHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  contentTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-black' }) },

  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  hintText: { fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },

  summaryBox: { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 18 },
  summaryText: { fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 22, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },

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