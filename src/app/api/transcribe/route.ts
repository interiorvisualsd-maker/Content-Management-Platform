import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, STORAGE_BUCKET } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { ARTICLE_STATUS } from "@/lib/status";
import type { Article, TranscriptionPayload } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/transcribe
 * Body: { article_id: string }
 *
 * Downloads the article's generated audio, sends it to Groq Whisper
 * (whisper-large-v3) which returns segments with timestamps, and
 * stores the result in articles.transcription JSONB.
 */
export async function POST(req: NextRequest) {
  let body: { article_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const articleId = body.article_id;
  if (!articleId) {
    return NextResponse.json({ error: "article_id is required" }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY env var is required" }, { status: 500 });
  }

  const serverClient = createServerClient();
  const adminClient = createAdminClient();

  const { data: article, error: fetchErr } = await serverClient
    .from("articles")
    .select("*")
    .eq("id", articleId)
    .single<Article>();

  if (fetchErr || !article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  if (!article.audio_storage_path) {
    return NextResponse.json({ error: "No audio file found. Generate audio first." }, { status: 400 });
  }

  await adminClient.from("articles").update({
    error_message: null,
    failed_step: null,
  }).eq("id", articleId);

  try {
    // 1. Download audio from Supabase Storage
    const { data: audioData, error: downloadErr } = await adminClient
      .storage
      .from(STORAGE_BUCKET)
      .download(article.audio_storage_path);

    if (downloadErr || !audioData) {
      throw new Error(`Failed to download audio: ${downloadErr?.message ?? "no data"}`);
    }

    const audioBuffer = Buffer.from(await audioData.arrayBuffer());

    // 2. Send to Groq Whisper API
    // Using multipart/form-data per https://console.groq.com/docs/speech-text
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
    formData.append("file", audioBlob, `${articleId}.mp3`);
    formData.append("model", "whisper-large-v3");
    formData.append("response_format", "verbose_json");
    // Request timestamp_segments for the LLM correction step
    formData.append("timestamp_granularities[]", "segment");

    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      throw new Error(`Groq Whisper API error (${groqRes.status}): ${errText}`);
    }

    const result = await groqRes.json() as {
      text: string;
      segments?: Array<{ id: number; start: number; end: number; text: string }>;
      language?: string;
      duration?: number;
    };

    const payload: TranscriptionPayload = {
      text: result.text || "",
      segments: (result.segments || []).map((s) => ({
        id: s.id,
        start: s.start,
        end: s.end,
        text: s.text.trim(),
      })),
      language: result.language,
      duration: result.duration,
    };

    // 3. Store transcription in Supabase
    const { error: updateErr } = await adminClient.from("articles").update({
      transcription: payload as unknown as Record<string, unknown>,
      status: ARTICLE_STATUS.TRANSCRIPTION_GENERATED,
      error_message: null,
      failed_step: null,
    }).eq("id", articleId);

    if (updateErr) {
      throw new Error(`Failed to update article: ${updateErr.message}`);
    }

    return NextResponse.json({
      ok: true,
      status: ARTICLE_STATUS.TRANSCRIPTION_GENERATED,
      segments: payload.segments.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown transcription error";
    await adminClient.from("articles").update({
      status: ARTICLE_STATUS.FAILED,
      error_message: `Transcription failed: ${message}`,
      failed_step: "transcribe",
    }).eq("id", articleId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
