import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, STORAGE_BUCKET } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { ARTICLE_STATUS } from "@/lib/status";
import type { Article } from "@/lib/types";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export const runtime = "nodejs";
// Audio generation can take 10-30s for long articles on Vercel hobby tier
export const maxDuration = 60;

const VOICE_MAP: Record<string, string> = {
  en: "en-US-AriaNeural",
  es: "es-ES-ElviraNeural",
  fr: "fr-FR-DeniseNeural",
  de: "de-DE-KatjaNeural",
  pt: "pt-BR-FranciscaNeural",
  it: "it-IT-ElsaNeural",
  nl: "nl-NL-ColetteNeural",
  ja: "ja-JP-NanamiNeural",
  ko: "ko-KR-SunHiNeural",
  zh: "zh-CN-XiaoxiaoNeural",
};

/**
 * Generate MP3 audio from article.content using Microsoft Edge TTS,
 * upload to Supabase Storage, and update the article row.
 *
 * POST /api/tts
 * Body: { article_id: string }
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

  if (!article.content || article.content.trim().length === 0) {
    return NextResponse.json({ error: "Article has no content to synthesize" }, { status: 400 });
  }

  // Clear prior error
  await adminClient.from("articles").update({
    error_message: null,
    failed_step: null,
  }).eq("id", articleId);

  try {
    const voice = VOICE_MAP[article.language] || VOICE_MAP.en;

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    // toStream returns a Node.js Readable — collect chunks into a Buffer
    const audioBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = tts.toStream(article.content);
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", (err: Error) => reject(err));
    });

    if (audioBuffer.length === 0) {
      throw new Error("Edge TTS returned no audio data");
    }

    // Upload to Supabase Storage
    const filePath = `${articleId}.mp3`;
    const { error: uploadErr } = await adminClient
      .storage
      .from(STORAGE_BUCKET)
      .upload(filePath, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = adminClient
      .storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    const audioUrl = publicUrlData.publicUrl;

    // Update article
    const { error: updateErr } = await adminClient.from("articles").update({
      audio_url: audioUrl,
      audio_storage_path: filePath,
      status: ARTICLE_STATUS.AUDIO_GENERATED,
      error_message: null,
      failed_step: null,
    }).eq("id", articleId);

    if (updateErr) {
      throw new Error(`Failed to update article: ${updateErr.message}`);
    }

    return NextResponse.json({
      ok: true,
      audio_url: audioUrl,
      status: ARTICLE_STATUS.AUDIO_GENERATED,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown TTS error";
    await adminClient.from("articles").update({
      error_message: `Audio generation failed: ${message}`,
      failed_step: "tts",
    }).eq("id", articleId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
