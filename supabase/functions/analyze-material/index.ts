// @ts-nocheck
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
    const { storagePath, fileName } = await req.json(); 
    if (!storagePath) {
      return new Response(JSON.stringify({ success: false, error: 'Missing storagePath' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- 1. SECURE IDENTITY VERIFICATION ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header. You must be logged in.');
    const token = authHeader.replace('Bearer ', '');

    const supabaseSecure = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    const { data: { user }, error: authError } = await supabaseSecure.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized: Invalid or expired session token.');
    const verifiedUserId = user.id;

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
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const GROQ_API_KEY   = Deno.env.get('GROQ_API_KEY');

    // --- 3. DOWNLOAD & PROCESS (Same as before) ---
    console.log('Downloading...');
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('study-materials').download(storagePath);
    if (downloadError || !fileData) throw new Error(`Download failed: ${downloadError?.message}`);

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
    
    if (GEMINI_API_KEY && isPdf) {
      rawText = await tryGemini(base64, mimeType, GEMINI_API_KEY);
    }

    if (!rawText && GROQ_API_KEY) {
      const LLAMAPARSE_API_KEY = Deno.env.get('LLAMAPARSE_API_KEY');
      let extracted = '';
      if (LLAMAPARSE_API_KEY) {
        try {
          extracted = await extractWithLlamaParse(fileBytes, fileName, mimeType, LLAMAPARSE_API_KEY);
        } catch (e: any) {
          console.error('LlamaParse error:', e.message);
        }
      }
      if (!extracted || extracted.length < 50) {
        throw new Error('Could not extract readable text from this file. Please try a different PDF, DOCX, or PPTX file.');
      }
      rawText = await tryGroq(extracted, GROQ_API_KEY);
    }

    if (!rawText) throw new Error('All AI providers failed. Check your API keys in Supabase Secrets.');

    let analysisResult: any;
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      analysisResult = JSON.parse(cleaned);
    } catch (e: any) {
      throw new Error(`Failed to parse AI response: ${e.message}`);
    }

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
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('FATAL:', err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message ?? 'Internal server error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});