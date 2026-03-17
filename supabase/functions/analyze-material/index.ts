// @ts-nocheck
// supabase/functions/analyze-material/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CANONICAL_CACHE_TABLE = 'study_canonical_cache';

const CANONICAL_PROMPT = `Extract a canonical study representation from the provided study material and return JSON only:

{
  "summary": "A clear 3-5 sentence overview",
  "topics": ["main topic"],
  "facts": ["key factual statement"],
  "terminology": ["term: concise definition"],
  "formulas": ["formula/equation if present"]
}

Rules:
- Be faithful to the source content.
- Keep items concise and non-duplicative.
- If no formulas are present, return [] for formulas.
- Return ONLY valid JSON.`;

const buildStudyOutputPrompt = (canonical: any) => `You are Studia, an AI study assistant. Using the canonical material below, return a JSON object with exactly this structure:

Canonical material:
${JSON.stringify(canonical)}

Target output:

{
  "summary": "A clear 3-5 sentence overview of the entire document",
  "keyConceptsList": [
    { "term": "Concept name", "definition": "Clear explanation of the concept" }
  ],
  "flashcards": [
    { "question": "Question about an important topic", "answer": "Concise answer" }
  ],
  "quiz": [
    {
      "question": "Standard multiple choice question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Why this answer is correct"
    }
  ],
  "hardQuiz": [
    {
      "question": "A challenging, analytical, or scenario-based multiple choice question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Detailed explanation of why this is correct"
    }
  ]
}

Rules:
- Generate exactly 5 key concepts
- Generate exactly 5 flashcards
- Generate exactly 5 regular quiz questions
- Generate exactly 5 hardQuiz questions
- Each options array must have exactly 4 distinct options. correctIndex must be 0-3.
- CRITICAL: Keep all definitions, answers, and explanations to a MAXIMUM of 15 words. Be extremely brief and concise.
- Return ONLY valid JSON, no markdown, no extra text`;

const buildRepairPrompt = (invalidOutput: string, reason: string) => `Repair this JSON output to match Studia schema. Return only valid JSON.
Reason: ${reason}
Invalid JSON:
${invalidOutput}

Constraints:
- Keep fields exactly: summary, keyConceptsList, flashcards, quiz, hardQuiz
- keyConceptsList/flashcards/quiz/hardQuiz target 5 items each (minimum 3)
- MCQ options exactly 4 strings and correctIndex between 0-3
- Remove malformed or duplicate items`;

const trimSafe = (v: any) => typeof v === 'string' ? v.trim() : v;

function extractJsonPayload(text: string) {
  const raw = (text ?? '').trim();
  if (!raw) return raw;
  if (raw.startsWith('```')) {
    return raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }
  return raw;
}

function validateCanonical(raw: any) {
  const toList = (v: any, max = 30) =>
    (Array.isArray(v) ? v : [])
      .map((x) => trimSafe(x ?? ''))
      .filter((x: string) => !!x)
      .slice(0, max);

  const canonical = {
    summary: trimSafe(raw?.summary ?? ''),
    topics: toList(raw?.topics, 20),
    facts: toList(raw?.facts, 40),
    terminology: toList(raw?.terminology, 30),
    formulas: toList(raw?.formulas, 20),
  };

  if (!canonical.summary && canonical.topics.length === 0 && canonical.facts.length === 0) {
    throw new Error('Canonical extraction returned insufficient content');
  }
  return canonical;
}

async function loadCanonicalCache(client: any, userId: string, storagePath: string) {
  try {
    const { data, error } = await client
      .from(CANONICAL_CACHE_TABLE)
      .select('canonical_json')
      .eq('user_id', userId)
      .eq('storage_path', storagePath)
      .maybeSingle();
    if (error || !data?.canonical_json) return null;
    return validateCanonical(data.canonical_json);
  } catch {
    return null;
  }
}

async function storeCanonicalCache(client: any, userId: string, storagePath: string, canonical: any) {
  try {
    await client.from(CANONICAL_CACHE_TABLE).upsert({
      user_id: userId,
      storage_path: storagePath,
      canonical_json: canonical,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // If table is missing in some environments, continue without cache.
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function uniqueCount(arr: string[]) {
  return new Set(arr.map((x) => String(x).trim().toLowerCase())).size;
}

function scoreFlashcard(item: any) {
  let score = 40;
  const q = String(item?.question ?? '').trim();
  const a = String(item?.answer ?? '').trim();
  if (q.length >= 12 && q.length <= 180) score += 25;
  if (a.length >= 8 && a.length <= 140) score += 25;
  if (q.endsWith('?')) score += 10;
  return clamp(score, 0, 100);
}

function scoreQuizItem(item: any, hard = false) {
  let score = 30;
  const q = String(item?.question ?? '').trim();
  const exp = String(item?.explanation ?? '').trim();
  const options = Array.isArray(item?.options) ? item.options.map((o: any) => String(o)) : [];
  if (q.length >= (hard ? 20 : 12)) score += 20;
  if (exp.length >= (hard ? 14 : 8)) score += 20;
  if (options.length === 4) score += 15;
  if (uniqueCount(options) === 4) score += 15;
  if (typeof item?.correctIndex === 'number' && item.correctIndex >= 0 && item.correctIndex <= 3) score += 10;
  return clamp(score, 0, 100);
}

function aggregateScores(scores: number[]) {
  if (scores.length === 0) return { average: 0, min: 0, lowCount: 0 };
  const average = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const min = Math.min(...scores);
  const lowCount = scores.filter((s) => s < 60).length;
  return { average, min, lowCount };
}

function buildQualityReport(analysis: any) {
  const flashScores = (analysis?.flashcards ?? []).map(scoreFlashcard);
  const quizScores = (analysis?.quiz ?? []).map((q: any) => scoreQuizItem(q, false));
  const hardScores = (analysis?.hardQuiz ?? []).map((q: any) => scoreQuizItem(q, true));

  const flashcards = aggregateScores(flashScores);
  const quiz = aggregateScores(quizScores);
  const hardQuiz = aggregateScores(hardScores);
  const overall = Math.round((flashcards.average + quiz.average + hardQuiz.average) / 3);

  return {
    flashcards,
    quiz,
    hardQuiz,
    overall,
  };
}

function isValidOptionList(opts: any): opts is string[] {
  return Array.isArray(opts) && opts.length === 4 && opts.every(o => typeof o === 'string' && o.trim().length > 0);
}

function cleanMcqArray(arr: any[] | undefined) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((q) => ({
      question: trimSafe(q?.question ?? ''),
      options: isValidOptionList(q?.options) ? q.options.map(trimSafe) : [],
      correctIndex: typeof q?.correctIndex === 'number' ? q.correctIndex : -1,
      explanation: trimSafe(q?.explanation ?? ''),
    }))
    .filter((q) => q.question && q.explanation && q.options.length === 4 && q.correctIndex >= 0 && q.correctIndex < 4);
}

function cleanFlashcards(arr: any[] | undefined) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((f) => ({ question: trimSafe(f?.question ?? ''), answer: trimSafe(f?.answer ?? '') }))
    .filter((f) => f.question && f.answer);
}

function cleanConcepts(arr: any[] | undefined) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((c) => ({ term: trimSafe(c?.term ?? ''), definition: trimSafe(c?.definition ?? '') }))
    .filter((c) => c.term && c.definition);
}

function validateAnalysis(raw: any) {
  const summary = trimSafe(raw?.summary ?? '');
  let keyConceptsList = cleanConcepts(raw?.keyConceptsList);
  let flashcards = cleanFlashcards(raw?.flashcards);
  let quiz = cleanMcqArray(raw?.quiz);
  let hardQuiz = cleanMcqArray(raw?.hardQuiz);

  const ensureRange = (arr: any[], label: string) => {
    if (arr.length < 3) throw new Error(`AI returned too few ${label} (need >=3)`);
    return arr.slice(0, 5); // keep max 5
  };

  if (!summary) throw new Error('AI returned empty summary');
  keyConceptsList = ensureRange(keyConceptsList, 'key concepts');
  flashcards     = ensureRange(flashcards, 'flashcards');
  quiz           = ensureRange(quiz, 'quiz items');
  hardQuiz       = ensureRange(hardQuiz, 'hard quiz items');

  return { summary, keyConceptsList, flashcards, quiz, hardQuiz };
}

// ── LlamaParse Document extraction (Handles PDF, DOCX, and PPTX) ───────────────
async function extractWithLlamaParse(bytes: Uint8Array, fileName: string, mimeType: string, apiKey: string): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([bytes], { type: mimeType });
  formData.append('file', blob, fileName);
  formData.append('language', 'en');

  console.log('Uploading to LlamaParse...');
  const uploadRes = await fetch('https://api.cloud.llamaindex.ai/api/parsing/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`LlamaParse upload failed ${uploadRes.status}: ${err.substring(0, 200)}`);
  }

  const uploadData = await uploadRes.json();
  const jobId = uploadData.id;
  if (!jobId) throw new Error('LlamaParse returned no job ID');
  console.log('LlamaParse job ID:', jobId);

  let status = 'PENDING';
  let attempts = 0;
  while (status !== 'SUCCESS' && status !== 'ERROR' && attempts < 60) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const statusData = await statusRes.json();
    status = statusData.status;
    console.log(`LlamaParse status: ${status} (attempt ${++attempts})`);
  }

  if (status !== 'SUCCESS') throw new Error(`LlamaParse job failed with status: ${status}`);

  const resultRes = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/text`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!resultRes.ok) throw new Error(`LlamaParse result fetch failed: ${resultRes.status}`);

  const resultData = await resultRes.json();
  const text = resultData.text ?? resultData.pages?.map((p: any) => p.text).join('\n') ?? '';
  console.log(`LlamaParse extracted: ${text.length} chars, sample: "${text.substring(0, 150)}"`);
  return text;
}

// ── Gemini (inline base64) ────────────────────────────────────────────────────
async function tryGemini(base64: string, mimeType: string, apiKey: string, prompt: string): Promise<string | null> {
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];
  for (const model of models) {
    console.log(`Trying Gemini: ${model}`);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: prompt },
          ]}],
          generationConfig: { 
            temperature: 0.3, 
            maxOutputTokens: 8192,
            response_mime_type: "application/json" 
          },
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (text) { console.log(`Gemini success: ${model}`); return text; }
    } else {
      console.log(`Gemini ${model} failed ${res.status}: ${(await res.text()).substring(0, 120)}`);
    }
  }
  return null;
}

// ── Groq ──────────────────────────────────────────────────────────────────────
async function tryGroq(text: string, apiKey: string): Promise<string | null> {
  const trimmed = text.length > 18000 ? text.substring(0, 18000) + '\n...[truncated]' : text;
  console.log(`Sending ${trimmed.length} chars to Groq...`);
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: trimmed }],
      temperature: 0.3,
      max_tokens: 8192,
      response_format: { type: "json_object" }
    }),
  });
  if (!res.ok) {
    console.log(`Groq failed ${res.status}: ${(await res.text()).substring(0, 200)}`);
    return null;
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  if (content) { console.log('Groq success!'); return content; }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const t0 = performance.now();
    let downloadMs = 0;
    let extractMs = 0;
    let canonicalMs = 0;
    let generateMs = 0;
    let repairMs = 0;
    let validateMs = 0;

    const { storagePath, fileName, userId } = await req.json(); 
    if (!storagePath) {
      return new Response(JSON.stringify({ success: false, error: 'Missing storagePath' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing userId' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- 1. IDENTITY (best effort) ---
    const authHeader = req.headers.get('Authorization');
    let verifiedUserId = userId;
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const supabaseSecure = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!
        );
        const { data: { user }, error: authError } = await supabaseSecure.auth.getUser(token);
        if (!authError && user) {
          verifiedUserId = user.id;
        }
      } catch (e) {
        console.log('Auth optional failure:', (e as any)?.message);
      }
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // --- 2. SERVER-SIDE QUOTA CHECK ---
    const today = new Date().toISOString().split('T')[0]; // Gets current date YYYY-MM-DD
    
    // Fetch user's quota record
    const { data: quotaData, error: quotaError } = await supabaseAdmin
      .from('user_quotas')
      .select('*')
      .eq('user_id', verifiedUserId)
      .single();

    let uploadsToday = 0;

    // If a record exists, check if we need to reset it for a new day
    if (quotaData) {
      if (quotaData.last_reset_date !== today) {
        uploadsToday = 0; // It's a new day!
      } else {
        uploadsToday = quotaData.uploads_today;
      }
    }

    // BLOCK THE REQUEST IF OVER LIMIT (3 uploads)
    if (uploadsToday >= 3) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          errorType: 'quota_exceeded', 
          error: 'Daily limit reached. Please come back tomorrow!' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const GROQ_API_KEY   = Deno.env.get('GROQ_API_KEY');

    // --- 3. DOWNLOAD & PROCESS (Same as before) ---
    console.log('Downloading...');
    const downloadStart = performance.now();
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('study-materials').download(storagePath);
    if (downloadError || !fileData) throw new Error(`Download failed: ${downloadError?.message}`);
    downloadMs = Math.round(performance.now() - downloadStart);

    const arrayBuffer = await fileData.arrayBuffer();
    const fileBytes   = new Uint8Array(arrayBuffer);

    const ext = fileName.toLowerCase().split('.').pop();
    let isPdf = false;
    let mimeType = 'application/octet-stream';

    if (ext === 'pdf') {
      isPdf = true;
      mimeType = 'application/pdf';
    } else if (ext === 'docx') {
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (ext === 'pptx') {
      mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    } else if (ext === 'ppt') {
      mimeType = 'application/vnd.ms-powerpoint';
    } else {
      throw new Error(`Unsupported file type: .${ext}. Please upload a PDF, DOCX, or PPTX.`);
    }

    const base64 = encodeBase64(fileBytes);
    let rawText: string | null = null;
    let canonical: any = await loadCanonicalCache(supabaseAdmin, verifiedUserId, storagePath);
    let generationProvider: 'gemini' | 'groq' | null = null;

    if (canonical) {
      canonicalMs = 1;
      console.log('Canonical cache hit for analyze-material');
    }
    
    if (canonical && GEMINI_API_KEY && isPdf) {
      const generateStart = performance.now();
      rawText = await tryGemini(base64, mimeType, GEMINI_API_KEY, buildStudyOutputPrompt(canonical));
      generateMs = Math.round(performance.now() - generateStart);
      if (rawText) generationProvider = 'gemini';
    }

    if (canonical && !rawText && GROQ_API_KEY) {
      const generateStart = performance.now();
      rawText = await tryGroq(buildStudyOutputPrompt(canonical), GROQ_API_KEY);
      generateMs = Math.round(performance.now() - generateStart);
      if (rawText) generationProvider = 'groq';
    }

    if (!canonical && GEMINI_API_KEY && isPdf) {
      const canonicalStart = performance.now();
      const canonicalText = await tryGemini(base64, mimeType, GEMINI_API_KEY, CANONICAL_PROMPT);
      if (canonicalText) {
        canonical = validateCanonical(JSON.parse(extractJsonPayload(canonicalText)));
        canonicalMs = Math.round(performance.now() - canonicalStart);
        await storeCanonicalCache(supabaseAdmin, verifiedUserId, storagePath, canonical);
        const generateStart = performance.now();
        rawText = await tryGemini(base64, mimeType, GEMINI_API_KEY, buildStudyOutputPrompt(canonical));
        generateMs = Math.round(performance.now() - generateStart);
        if (rawText) generationProvider = 'gemini';
      }
    }

    if (!canonical && !rawText && GROQ_API_KEY) {
      const LLAMAPARSE_API_KEY = Deno.env.get('LLAMAPARSE_API_KEY');
      let extracted = '';
      if (LLAMAPARSE_API_KEY) {
        try {
          const extractStart = performance.now();
          extracted = await extractWithLlamaParse(fileBytes, fileName, mimeType, LLAMAPARSE_API_KEY);
          extractMs = Math.round(performance.now() - extractStart);
        } catch (e: any) {
          console.error('LlamaParse error:', e.message);
        }
      }
      if (!extracted || extracted.length < 50) {
        throw new Error('Could not extract readable text from this file. Please try a different PDF, DOCX, or PPTX file.');
      }
      const canonicalPrompt = `${CANONICAL_PROMPT}\n\nStudy material:\n\n${extracted}`;
      const canonicalStart = performance.now();
      const canonicalText = await tryGroq(canonicalPrompt, GROQ_API_KEY);
      if (!canonicalText) throw new Error('Canonical extraction failed on fallback provider.');
      canonical = validateCanonical(JSON.parse(extractJsonPayload(canonicalText)));
      canonicalMs = Math.round(performance.now() - canonicalStart);
      await storeCanonicalCache(supabaseAdmin, verifiedUserId, storagePath, canonical);
      const generateStart = performance.now();
      rawText = await tryGroq(buildStudyOutputPrompt(canonical), GROQ_API_KEY);
      generateMs = Math.round(performance.now() - generateStart);
      if (rawText) generationProvider = 'groq';
    }

    if (!rawText) throw new Error('All AI providers failed. Check your API keys in Supabase Secrets.');

    let analysisResult: any;
    const validateStart = performance.now();
    try {
      analysisResult = validateAnalysis(JSON.parse(extractJsonPayload(rawText)));
    } catch (e: any) {
      console.log('Primary analysis parse failed; attempting repair:', e.message);
      let repaired: string | null = null;
      const repairPrompt = buildRepairPrompt(rawText, e.message ?? 'parse/validation failure');
      const repairStart = performance.now();
      if (generationProvider === 'gemini' && GEMINI_API_KEY) {
        repaired = await tryGemini(base64, mimeType, GEMINI_API_KEY, repairPrompt);
      } else if (generationProvider === 'groq' && GROQ_API_KEY) {
        repaired = await tryGroq(repairPrompt, GROQ_API_KEY);
      }
      repairMs = Math.round(performance.now() - repairStart);
      if (!repaired) throw new Error(`Failed to parse AI response: ${e.message}`);
      analysisResult = validateAnalysis(JSON.parse(extractJsonPayload(repaired)));
    }
    validateMs = Math.round(performance.now() - validateStart);

    const totalMs = Math.round(performance.now() - t0);
    const quality = buildQualityReport(analysisResult);
    const stageTimings = {
      download_ms: downloadMs,
      extract_ms: extractMs,
      canonical_ms: canonicalMs,
      generate_ms: generateMs,
      repair_ms: repairMs,
      validate_ms: validateMs,
      total_ms: totalMs,
    };
    console.log('analyze-material timings:', JSON.stringify(stageTimings));
    console.log('analyze-material quality:', JSON.stringify(quality));

    // --- 4. RECORD SUCCESS & INCREMENT QUOTA ---
    // Save to study_results table
    const { error: dbError } = await supabaseAdmin.from('study_results').insert({
      user_id: verifiedUserId, 
      file_name: fileName, 
      storage_path: storagePath,
      summary: analysisResult.summary, 
      key_concepts: analysisResult.keyConceptsList,
      flashcards: analysisResult.flashcards, 
      quiz: analysisResult.quiz,
      hard_quiz: analysisResult.hardQuiz,
    });
    if (dbError) console.error('DB error:', dbError.message);

    // Update the Quota Table (+1 upload)
    await supabaseAdmin.from('user_quotas').upsert({
      user_id: verifiedUserId,
      uploads_today: uploadsToday + 1,
      last_reset_date: today
    });

    return new Response(
      JSON.stringify({
        success: true,
        summary: analysisResult.summary,
        keyConceptsList: analysisResult.keyConceptsList,
        flashcards: analysisResult.flashcards,
        quiz: analysisResult.quiz,
        hardQuiz: analysisResult.hardQuiz,
        stageTimings,
        quality,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('FATAL:', err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message ?? 'Internal server error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});