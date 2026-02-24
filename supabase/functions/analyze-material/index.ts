// supabase/functions/analyze-material/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROMPT = `You are Studia, an AI study assistant. Analyze the provided study material and return a JSON object with exactly this structure:

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
- CRITICAL: Keep all definitions, answers, and explanations to a MAXIMUM of 15 words. Be extremely brief and concise.
- Return ONLY valid JSON, no markdown, no extra text`;

// ── LlamaParse PDF extraction ────────────────────────────────────────────────
async function extractWithLlamaParse(bytes: Uint8Array, fileName: string, apiKey: string): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([bytes], { type: 'application/pdf' });
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
  while (status !== 'SUCCESS' && status !== 'ERROR' && attempts < 30) {
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
async function tryGemini(base64: string, mimeType: string, apiKey: string): Promise<string | null> {
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
            { text: PROMPT },
          ]}],
          generationConfig: { 
            temperature: 0.3, 
            maxOutputTokens: 8192,
            response_mime_type: "application/json" // Strict JSON mode
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
  const trimmed = text.length > 14000 ? text.substring(0, 14000) + '\n...[truncated]' : text;
  console.log(`Sending ${trimmed.length} chars to Groq...`);
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: `${PROMPT}\n\nStudy material:\n\n${trimmed}` }],
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
    const { storagePath, fileName, userId } = await req.json();
    console.log('Request:', { storagePath, fileName, userId });

    if (!storagePath || !userId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing storagePath or userId' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const GROQ_API_KEY   = Deno.env.get('GROQ_API_KEY');

    // 1. Download
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    console.log('Downloading...');
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('study-materials').download(storagePath);
    if (downloadError || !fileData) throw new Error(`Download failed: ${downloadError?.message}`);

    const arrayBuffer = await fileData.arrayBuffer();
    const fileBytes   = new Uint8Array(arrayBuffer);
    console.log('Size:', fileBytes.length);

    const isPdf    = fileName.toLowerCase().endsWith('.pdf');
    const mimeType = isPdf ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    // 2. Base64 for Gemini (Safer encoding method)
    const base64 = encodeBase64(fileBytes);

    // 3. Try Gemini
    let rawText: string | null = null;
    if (GEMINI_API_KEY) rawText = await tryGemini(base64, mimeType, GEMINI_API_KEY);

    // 4. Fallback to Groq with text extraction
    if (!rawText && GROQ_API_KEY) {
      console.log('Gemini failed — falling back to LlamaParse + Groq...');
      const LLAMAPARSE_API_KEY = Deno.env.get('LLAMAPARSE_API_KEY');
      
      let extracted = '';
      if (isPdf && LLAMAPARSE_API_KEY) {
        try {
          extracted = await extractWithLlamaParse(fileBytes, fileName, LLAMAPARSE_API_KEY);
        } catch (e: any) {
          console.error('LlamaParse error:', e.message);
        }
      }

      // DOCX fallback — read XML w:t tags
      if (!extracted || extracted.length < 50) {
        if (!isPdf) {
          const raw = new TextDecoder('utf-8', { fatal: false }).decode(fileBytes);
          const matches = [...raw.matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g)];
          extracted = matches.map(m => m[1].trim()).filter(s => s.length > 0).join(' ').replace(/\s+/g, ' ').trim();
        }
      }

      if (!extracted || extracted.length < 50) {
        throw new Error('Could not extract readable text from this file. Please try a different PDF or DOCX file.');
      }

      rawText = await tryGroq(extracted, GROQ_API_KEY);
    }

    if (!rawText) throw new Error('All AI providers failed. Check your API keys in Supabase Secrets.');

    // 5. Parse
    let analysisResult: any;
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      analysisResult = JSON.parse(cleaned);
    } catch (e: any) {
      throw new Error(`Failed to parse AI response: ${e.message}`);
    }

    // 6. Save to Supabase DB
    const { error: dbError } = await supabase.from('study_results').insert({
      user_id: userId, file_name: fileName, storage_path: storagePath,
      summary: analysisResult.summary, key_concepts: analysisResult.keyConceptsList,
      flashcards: analysisResult.flashcards, quiz: analysisResult.quiz,
      hard_quiz: analysisResult.hardQuiz,
    });
    
    if (dbError) console.error('DB error:', dbError.message);

    return new Response(
      JSON.stringify({
        success: true,
        summary: analysisResult.summary,
        keyConceptsList: analysisResult.keyConceptsList,
        flashcards: analysisResult.flashcards,
        quiz: analysisResult.quiz,
        hardQuiz: analysisResult.hardQuiz,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('FATAL:', err.message);
    // FIX: Status 200 allows the React Native app to actually read this error message!
    return new Response(
      JSON.stringify({ success: false, error: err.message ?? 'Internal server error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});