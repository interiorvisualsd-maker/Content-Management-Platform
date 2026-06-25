import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, STORAGE_BUCKET } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { ARTICLE_STATUS } from "@/lib/status";
import type { Article } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Language code mapping for Google Translate TTS.
 * The `tl` parameter accepts ISO 639-1 codes.
 */
const TTS_LANG_MAP: Record<string, string> = {
  en: "en",
  es: "es",
  fr: "fr",
  de: "de",
  pt: "pt",
  it: "it",
  nl: "nl",
  ja: "ja",
  ko: "ko",
  zh: "zh-CN",
};

/**
 * Max chars per request — Google Translate TTS rejects chunks > ~200 chars.
 * We use 180 to be safe with URL encoding overhead.
 */
const MAX_CHUNK_CHARS = 180;

/**
 * Generate MP3 audio from article.content using Google Translate TTS
 * (free, HTTP-based, works reliably on Vercel serverless).
 *
 * Endpoint:
 *   GET https://translate.google.com/translate_tts?ie=UTF-8&q=TEXT&tl=LANG&client=tw-ob
 *
 * Returns MP3 audio directly. The endpoint rejects requests > ~200 chars,
 * so we chunk the text and concatenate the resulting MP3 buffers. This works
 * because each chunk is a standalone MP3 file with independent frames.
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
    const lang = TTS_LANG_MAP[article.language] || "en";
    const chunks = chunkText(article.content, MAX_CHUNK_CHARS);

    if (chunks.length === 0) {
      throw new Error("No text chunks to synthesize");
    }

    console.log(`[/api/tts] Generating ${chunks.length} chunks with lang=${lang}, total chars=${article.content.length}`);

    // Fetch each chunk — sequential to avoid rate-limiting on Google's endpoint
    const audioBuffers: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunks[i])}&tl=${encodeURIComponent(lang)}&client=tw-ob`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "audio/mpeg, audio/mp3, */*",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://translate.google.com/",
        },
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Chunk ${i + 1}/${chunks.length} failed (${res.status}): ${errText.substring(0, 200)}`);
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) {
        throw new Error(`Chunk ${i + 1}/${chunks.length} returned empty audio`);
      }
      audioBuffers.push(buf);
    }

    // Concatenate all MP3 chunks into one buffer
    const audioBuffer = Buffer.concat(audioBuffers);

    if (audioBuffer.length === 0) {
      throw new Error("All TTS chunks returned empty audio");
    }

    console.log(`[/api/tts] Total audio size: ${audioBuffer.length} bytes (${chunks.length} chunks)`);

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
    const message = normalizeErrorMessage(err);
    console.error("[/api/tts] FAILED:", {
      message,
      stack: err instanceof Error ? err.stack : undefined,
      articleId,
    });
    await adminClient.from("articles").update({
      status: ARTICLE_STATUS.FAILED,
      error_message: `Audio generation failed: ${message}`,
      failed_step: "tts",
    }).eq("id", articleId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Split text into chunks of at most `maxChars` characters.
 * Tries to break on sentence boundaries (., !, ?) then commas,
 * then word boundaries, then hard splits if necessary.
 */
function chunkText(text: string, maxChars: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks: string[] = [];
  let remaining = clean;

  while (remaining.length > maxChars) {
    let cutAt = -1;
    // Try sentence boundary (. ! ? followed by whitespace)
    const sentenceMatch = remaining.substring(0, maxChars).match(/.*[.!?]\s/);
    if (sentenceMatch && sentenceMatch[0].length > 50) {
      cutAt = sentenceMatch[0].length;
    } else {
      // Try comma
      const commaIdx = remaining.substring(0, maxChars).lastIndexOf(", ");
      if (commaIdx > 50) {
        cutAt = commaIdx + 2;
      } else {
        // Try space
        const spaceIdx = remaining.substring(0, maxChars).lastIndexOf(" ");
        if (spaceIdx > 50) {
          cutAt = spaceIdx + 1;
        } else {
          cutAt = maxChars;
        }
      }
    }
    chunks.push(remaining.substring(0, cutAt).trim());
    remaining = remaining.substring(cutAt).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

function normalizeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as { message?: string; toString?: () => string };
    if (e.message) return e.message;
    if (typeof e.toString === "function") {
      try { return e.toString(); } catch { /* ignore */ }
    }
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error (could not serialize)";
  }
}
