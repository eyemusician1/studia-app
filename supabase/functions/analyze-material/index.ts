// supabase/functions/analyze-material/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { storagePath, fileName, userId } = await req.json();
    console.log('Request received:', { storagePath, fileName, userId });

    if (!storagePath || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing storagePath or userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');

    // ── 1. Download file ──────────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('Downloading file...');
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('study-materials')
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error(`Download failed: ${downloadError?.message}`);
    }
    console.log('Downloaded, size:', fileData.size);

    // ── 2. Convert to base64 ──────────────────────────────────────────────────
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    // Use TextDecoder trick — much faster than charCodeAt loop
    const base64 = btoa(
      uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    console.log('Base64 length:', base64.length);

    const isPdf = fileName.toLowerCase().endsWith('.pdf');
    const mimeType = isPdf
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    // ── 3. Call Gemini with inline base64 ────────────────────────────────────
    // Try models in order until one works
    const models = [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
    ];

    const prompt = `You are Studia, an AI study assistant. Analyze the provided study material and return a JSON object with exactly this structure:

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
      "question": "Multiple choice question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Why this answer is correct"
    }
  ]
}

Rules:
- Generate at least 5 key concepts
- Generate at least 8 flashcards  
- Generate at least 5 quiz questions
- Be concise and student-friendly
- Return ONLY valid JSON, no markdown, no extra text`;

    let genData: any = null;
    let usedModel = '';

    for (const model of models) {
      console.log(`Trying model: ${model}`);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: mimeType, data: base64 } },
                { text: prompt },
              ],
            }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
          }),
        }
      );

      if (res.ok) {
        genData = await res.json();
        usedModel = model;
        console.log(`Success with model: ${model}`);
        break;
      } else {
        const errText = await res.text();
        console.log(`Model ${model} failed ${res.status}: ${errText.substring(0, 200)}`);
      }
    }

    if (!genData) throw new Error('All Gemini models failed — check quota or API key');

    const rawText = genData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!rawText) {
      console.log('Full Gemini response:', JSON.stringify(genData));
      throw new Error('Gemini returned empty text');
    }

    const cleaned = rawText.replace(/```json[\s\S]*?```/g, (m: string) =>
      m.replace(/```json|```/g, '')
    ).replace(/```/g, '').trim();

    let analysisResult: any;
    try {
      analysisResult = JSON.parse(cleaned);
    } catch {
      throw new Error(`JSON parse failed. Raw: ${cleaned.substring(0, 400)}`);
    }

    console.log('Analysis done with', usedModel);

    // ── 4. Save to DB ─────────────────────────────────────────────────────────
    const { error: dbError } = await supabase.from('study_results').insert({
      user_id: userId,
      file_name: fileName,
      storage_path: storagePath,
      summary: analysisResult.summary,
      key_concepts: analysisResult.keyConceptsList,
      flashcards: analysisResult.flashcards,
      quiz: analysisResult.quiz,
    });
    if (dbError) console.error('DB error (non-fatal):', dbError.message);

    return new Response(
      JSON.stringify({
        success: true,
        summary: analysisResult.summary,
        keyConceptsList: analysisResult.keyConceptsList,
        flashcards: analysisResult.flashcards,
        quiz: analysisResult.quiz,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('FATAL:', err.message);
    return new Response(
      JSON.stringify({ error: err.message ?? 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});