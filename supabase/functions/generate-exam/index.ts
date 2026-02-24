// supabase/functions/generate-exam/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { storagePath, fileName, userId } = await req.json()

    if (!storagePath) throw new Error("Missing storagePath")

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: fileData, error: downloadError } = await supabaseClient
      .storage
      .from('study-materials')
      .download(storagePath)

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`)
    }

    const arrayBuffer = await fileData.arrayBuffer()
    const base64Data = encodeBase64(new Uint8Array(arrayBuffer))
    
    const mimeType = fileName.toLowerCase().endsWith('.pdf') 
      ? 'application/pdf' 
      : 'application/octet-stream'

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY secret on server.")

    const prompt = `You are a strict university professor. Analyze the attached document and generate exactly 50 objective, multiple-choice questions. 
    The difficulty MUST be university-level (high critical thinking, scenario-based, and analytical).
    Return the data as a pure JSON array. Every object MUST follow this structure exactly:
    [
      {
        "question": "The question text here?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctIndex": 0,
        "explanation": "A detailed explanation of why this is correct."
      }
    ]`

    // UPGRADED TO 2.5 FLASH TO GUARANTEE THE TYPO IS GONE AND FOR FASTER GENERATION
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }],
        generationConfig: { 
          temperature: 0.2,
          response_mime_type: "application/json" 
        } 
      })
    })

    const geminiData = await response.json()

    if (!response.ok) {
       throw new Error(geminiData.error?.message || "Error from Gemini API")
    }

    const responseText = geminiData.candidates[0].content.parts[0].text
    const examArray = JSON.parse(responseText)

    return new Response(
      JSON.stringify({ success: true, exam: examArray }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )
  }
})