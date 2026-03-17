// supabase/functions/generate-exam/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CANONICAL_CACHE_TABLE = 'study_canonical_cache';

const trimSafe = (v: any) => typeof v === 'string' ? v.trim() : v;

function isValidOptionList(opts: any): opts is string[] {
  return Array.isArray(opts) && opts.length === 4 && opts.every(o => typeof o === 'string' && o.trim().length > 0);
}

function extractJsonPayload(text: string): string {
  const raw = (text ?? '').trim();
  if (!raw) return raw;
  if (raw.startsWith('```')) {
    const noFence = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '');
    return noFence.trim();
  }
  return raw;
}

function shuffleOptionsKeepIndex(options: string[], correctIndex: number) {
  const entries = options.map((opt, idx) => ({ opt, idx }));
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  const newOptions = entries.map(e => e.opt);
  const newIndex = entries.findIndex(e => e.idx === correctIndex);
  return { options: newOptions, correctIndex: newIndex };
}

type Mcq = { question: string; options: string[]; correctIndex: number; explanation: string };
type IdItem = { question: string; expectedAnswer: string };
type EnumItem = { question: string; items: string[] };
type ShortItem = { question: string; guidance: string };
type QuantItem = { problem: string; stepSolution: string; finalAnswer: string };
type CanonicalDoc = {
  summary: string;
  topics: string[];
  facts: string[];
  terminology: string[];
  formulas: string[];
};

async function loadCanonicalCache(client: any, userId: string, storagePath: string): Promise<CanonicalDoc | null> {
  try {
    const { data, error } = await client
      .from(CANONICAL_CACHE_TABLE)
      .select('canonical_json')
      .eq('user_id', userId)
      .eq('storage_path', storagePath)
      .maybeSingle();
    if (error || !data?.canonical_json) return null;
    return coerceCanonical(data.canonical_json);
  } catch {
    return null;
  }
}

async function storeCanonicalCache(client: any, userId: string, storagePath: string, canonical: CanonicalDoc) {
  try {
    await client.from(CANONICAL_CACHE_TABLE).upsert({
      user_id: userId,
      storage_path: storagePath,
      canonical_json: canonical,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Cache table may not exist yet in every environment.
  }
}

function safeJsonParse(text: string): any {
  return JSON.parse(extractJsonPayload(text));
}

function dedupeByKey<T>(arr: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const key = keyFn(item).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function coerceCanonical(raw: any): CanonicalDoc {
  const toList = (v: any, max = 24) =>
    (Array.isArray(v) ? v : [])
      .map((x) => trimSafe(x ?? ''))
      .filter((x: string) => !!x)
      .slice(0, max);

  const canonical: CanonicalDoc = {
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

function parseAndValidateExam(text: string) {
  const parsed = safeJsonParse(text);
  const exam = {
    multipleChoice: validateMcqArray(dedupeByKey(parsed?.multipleChoice ?? [], (q: any) => String(q?.question ?? '')), 20, 10),
    identification: validateIdArray(dedupeByKey(parsed?.identification ?? [], (q: any) => String(q?.question ?? '')), 5, 3),
    enumeration: validateEnumArray(dedupeByKey(parsed?.enumeration ?? [], (q: any) => String(q?.question ?? '')), 5, 3),
    shortAnswer: validateShortArray(dedupeByKey(parsed?.shortAnswer ?? [], (q: any) => String(q?.question ?? '')), 5, 3),
    quantitative: validateQuantArray(dedupeByKey(parsed?.quantitative ?? [], (q: any) => String(q?.problem ?? ''))),
  };
  return exam;
}

function canonicalPrompt() {
  return `Extract a canonical study representation from the attached document and return JSON only:
  {
    "summary": "4-7 sentence summary",
    "topics": ["main topic", "main topic"],
    "facts": ["key factual statement"],
    "terminology": ["term: concise definition"],
    "formulas": ["formula or equation if present"]
  }
Rules:
- Be faithful to source; no invented content.
- Keep items concise and non-duplicative.
- If no formulas, return [] for formulas.
- Output pure JSON only.`;
}

function examPrompt(canonical: CanonicalDoc) {
  return `You are a strict university professor. Using this canonical material JSON, generate a mixed exam as JSON only.
Canonical material:
${JSON.stringify(canonical)}

Return exactly this shape:
{
  "multipleChoice": [20 items of {"question":"text","options":["A","B","C","D"],"correctIndex":0-3,"explanation":"<=20 words"}],
  "identification": [5 items of {"question":"text","expectedAnswer":"<=25 words"}],
  "enumeration": [5 items of {"question":"text","items":["<=15 words","<=15 words","<=15 words"]}],
  "shortAnswer": [5 items of {"question":"text","guidance":"<=30 words"}],
  "quantitative": [0-5 items of {"problem":"text","stepSolution":"succinct steps","finalAnswer":"numeric or expression"}]
}
Rules:
- No duplicate questions across any section.
- Options must be distinct and plausible.
- Quantitative only when formulas/math are present.
- Output pure JSON only, no markdown.`;
}

function repairPrompt(rawOutput: string, reason: string) {
  return `Repair this exam JSON to satisfy schema and quality constraints. Return only repaired JSON.
Failure reason: ${reason}
Invalid output:
${rawOutput}

Constraints:
- MCQ >= 10, target 20; ID >= 3, target 5; ENUM >= 3, target 5; SHORT >= 3, target 5.
- Keep fields exactly as required. No extra keys.
- Remove duplicates and malformed items.
- Options must be exactly 4 strings; correctIndex 0-3.`;
}

function validateMcqArray(raw: any, maxCount: number, minCount: number): Mcq[] {
  if (!Array.isArray(raw)) throw new Error('AI did not return MCQs');
  const cleaned = raw
    .map((q) => {
      const question = trimSafe(q?.question ?? '');
      const explanation = trimSafe(q?.explanation ?? '');
      const options = isValidOptionList(q?.options) ? q.options.map(trimSafe) : [];
      const correctIndex = typeof q?.correctIndex === 'number' ? q.correctIndex : -1;
      if (!question || !explanation || options.length !== 4 || correctIndex < 0 || correctIndex > 3) return null;
      const { options: shuffledOpts, correctIndex: idx } = shuffleOptionsKeepIndex(options, correctIndex);
      return { question, options: shuffledOpts, correctIndex: idx, explanation };
    })
    .filter(Boolean) as Mcq[];
  if (cleaned.length < minCount) throw new Error(`AI returned too few MCQs (${cleaned.length}/${minCount} minimum)`);
  return cleaned.slice(0, maxCount);
}

function validateIdArray(raw: any, maxCount: number, minCount: number): IdItem[] {
  if (!Array.isArray(raw)) throw new Error('AI did not return identification items');
  const cleaned = raw
    .map((q) => ({ question: trimSafe(q?.question ?? ''), expectedAnswer: trimSafe(q?.expectedAnswer ?? '') }))
    .filter((q) => q.question && q.expectedAnswer);
  if (cleaned.length < minCount) throw new Error(`AI returned too few identification items (${cleaned.length}/${minCount} minimum)`);
  return cleaned.slice(0, maxCount);
}

function validateEnumArray(raw: any, maxCount: number, minCount: number): EnumItem[] {
  if (!Array.isArray(raw)) throw new Error('AI did not return enumeration items');
  const cleaned = raw
    .map((q) => ({ question: trimSafe(q?.question ?? ''), items: Array.isArray(q?.items) ? q.items.map((i: any) => trimSafe(i ?? '')).filter((i: string) => i) : [] }))
    .filter((q) => q.question && q.items.length >= 3);
  if (cleaned.length < minCount) throw new Error(`AI returned too few enumeration items (${cleaned.length}/${minCount} minimum)`);
  return cleaned.slice(0, maxCount);
}

function validateShortArray(raw: any, maxCount: number, minCount: number): ShortItem[] {
  if (!Array.isArray(raw)) throw new Error('AI did not return short answers');
  const cleaned = raw
    .map((q) => ({ question: trimSafe(q?.question ?? ''), guidance: trimSafe(q?.guidance ?? '') }))
    .filter((q) => q.question && q.guidance);
  if (cleaned.length < minCount) throw new Error(`AI returned too few short answers (${cleaned.length}/${minCount} minimum)`);
  return cleaned.slice(0, maxCount);
}

function validateQuantArray(raw: any): QuantItem[] {
  if (!raw) return [];
  if (!Array.isArray(raw)) throw new Error('AI did not return quantitative items');
  const cleaned = raw
    .map((q) => ({
      problem: trimSafe(q?.problem ?? ''),
      stepSolution: trimSafe(q?.stepSolution ?? ''),
      finalAnswer: trimSafe(q?.finalAnswer ?? ''),
    }))
    .filter((q) => q.problem && q.stepSolution && q.finalAnswer);
  return cleaned.slice(0, 5);
}

async function requestGeminiContent(
  prompt: string,
  apiKey: string,
  opts?: { base64Data?: string; mimeType?: string; temperature?: number }
): Promise<string> {
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastError = 'Unknown Gemini error';

  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            ...(opts?.base64Data && opts?.mimeType
              ? [{ inline_data: { mime_type: opts.mimeType, data: opts.base64Data } }]
              : []),
          ],
        }],
        generationConfig: {
          temperature: opts?.temperature ?? 0.2,
          response_mime_type: 'application/json'
        }
      })
    });

    const geminiData = await response.json();

    if (!response.ok) {
      lastError = geminiData?.error?.message || `Gemini failed on ${model}`;
      console.log(`Gemini ${model} failed:`, lastError);
      continue;
    }

    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (text) {
      console.log(`Gemini ${model} succeeded.`);
      return text;
    }

    lastError = `Gemini returned empty text on ${model}`;
  }

  throw new Error(lastError);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const t0 = performance.now();
    let downloadMs = 0;
    let canonicalMs = 0;
    let generateMs = 0;
    let repairMs = 0;
    let validateMs = 0;

    const { storagePath, fileName, userId } = await req.json()

    if (!storagePath) throw new Error("Missing storagePath")
    if (!userId) throw new Error("Missing userId")

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Daily exam quota (resets every UTC day)
    const today = new Date().toISOString().split('T')[0]

    const { data: quotaData } = await supabaseClient
      .from('user_quotas')
      .select('*')
      .eq('user_id', userId)
      .single()

    const sameDay = quotaData?.last_reset_date === today
    const uploadsToday = sameDay ? quotaData?.uploads_today ?? 0 : 0
    const examsToday = sameDay ? quotaData?.exams_today ?? 0 : 0

    if (examsToday >= 2) {
      return new Response(
        JSON.stringify({ success: false, errorType: 'quota_exceeded', error: 'Daily exam limit reached. Please come back tomorrow!' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      )
    }

    const downloadStart = performance.now();
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY secret on server.")

    let canonical = await loadCanonicalCache(supabaseClient, userId, storagePath)
    if (canonical) {
      canonicalMs = 1
      console.log('Canonical cache hit for generate-exam')
    }

    if (!canonical) {
      const { data: fileData, error: downloadError } = await supabaseClient
        .storage
        .from('study-materials')
        .download(storagePath)
      downloadMs = Math.round(performance.now() - downloadStart)

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file: ${downloadError?.message}`)
      }

      const arrayBuffer = await fileData.arrayBuffer()
      const base64Data = encodeBase64(new Uint8Array(arrayBuffer))
      
      const mimeType = fileName.toLowerCase().endsWith('.pdf') 
        ? 'application/pdf' 
        : 'application/octet-stream'

      const canonicalStart = performance.now();
      const canonicalText = await requestGeminiContent(canonicalPrompt(), GEMINI_API_KEY, {
        base64Data,
        mimeType,
        temperature: 0.1,
      })
      canonical = coerceCanonical(safeJsonParse(canonicalText))
      canonicalMs = Math.round(performance.now() - canonicalStart)
      await storeCanonicalCache(supabaseClient, userId, storagePath, canonical)
    }

    const generateStart = performance.now();
    let examText = await requestGeminiContent(examPrompt(canonical), GEMINI_API_KEY, { temperature: 0.2 })
    generateMs = Math.round(performance.now() - generateStart)

    const validateStart = performance.now();
    let exam: any
    try {
      exam = parseAndValidateExam(examText)
    } catch (firstErr: any) {
      console.log('Primary exam parse/validation failed, attempting repair:', firstErr?.message)
      const repairStart = performance.now();
      examText = await requestGeminiContent(repairPrompt(examText, firstErr?.message ?? 'validation_failed'), GEMINI_API_KEY, { temperature: 0.1 })
      repairMs = Math.round(performance.now() - repairStart)
      exam = parseAndValidateExam(examText)
    }
    validateMs = Math.round(performance.now() - validateStart)

    const totalMs = Math.round(performance.now() - t0)
    const stageTimings = {
      download_ms: downloadMs,
      canonical_ms: canonicalMs,
      generate_ms: generateMs,
      repair_ms: repairMs,
      validate_ms: validateMs,
      total_ms: totalMs,
    }

    console.log(
      `Exam generated: MCQ=${exam.multipleChoice.length}, ID=${exam.identification.length}, ENUM=${exam.enumeration.length}, SHORT=${exam.shortAnswer.length}, QUANT=${exam.quantitative.length}, total=${totalMs}ms`
    )

    await supabaseClient.from('user_quotas').upsert({
      user_id: userId,
      uploads_today: uploadsToday,
      exams_today: examsToday + 1,
      last_reset_date: today,
    })

    return new Response(
      JSON.stringify({ success: true, exam, stageTimings }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error: any) {
    console.log('generate-exam error:', error?.message)
    return new Response(
      JSON.stringify({ success: false, error: error.message, errorType: 'generation_error' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )
  }
})