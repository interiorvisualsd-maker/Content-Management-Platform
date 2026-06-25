import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { ARTICLE_STATUS } from "@/lib/status";
import type { Article, TranscriptionPayload, TranscriptionSegment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/correct
 * Body: { article_id: string }
 *
 * Sends the original article content + the Whisper transcription
 * (with segments) to Groq Llama 3.3 70B. The LLM is instructed to
 * fix transcription errors while PRESERVING the segment structure
 * and timestamps. Returns corrected segments.
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

  if (!article.transcription) {
    return NextResponse.json({ error: "No transcription found. Generate transcription first." }, { status: 400 });
  }

  const transcription = article.transcription as TranscriptionPayload;

  await adminClient.from("articles").update({
    error_message: null,
    failed_step: null,
  }).eq("id", articleId);

  try {
    // Build the prompt. We pass the segments as JSON and ask the LLM to
    // return the SAME JSON shape with corrected text only.
    const hasSegments = transcription.segments && transcription.segments.length > 0;

    let userPrompt: string;
    let expectedShape: "segments" | "text";

    if (hasSegments) {
      expectedShape = "segments";
      const segmentsJson = JSON.stringify(
        transcription.segments.map((s) => ({ id: s.id, start: s.start, end: s.end, text: s.text }))
      );
      userPrompt = `You are correcting an automatic speech-to-text transcription using the original source text as ground truth.

ORIGINAL ARTICLE TEXT (this is what was spoken — use it to fix transcription errors):
"""
${article.content}
"""

RAW TRANSCRIPTION SEGMENTS (JSON array — each has id, start, end, text):
${segmentsJson}

TASK:
- For each segment, fix any transcription errors using the original article text as reference.
- PRESERVE the segment id, start, and end values EXACTLY. Do not merge, split, or reorder segments.
- Only modify the "text" field.
- If a segment's text is already correct, return it unchanged.
- Do not add commentary. Do not add markdown. Output ONLY a JSON array of the same shape.

Respond with ONLY the JSON array. No prose, no code fences.`;
    } else {
      expectedShape = "text";
      userPrompt = `You are correcting an automatic speech-to-text transcription using the original source text as ground truth.

ORIGINAL ARTICLE TEXT (this is what was spoken — use it to fix transcription errors):
"""
${article.content}
"""

RAW TRANSCRIPTION TEXT:
"""
${transcription.text}
"""

TASK:
- Fix any transcription errors using the original article text as reference.
- Preserve paragraph breaks if any.
- Do not add commentary. Output ONLY the corrected transcription text.

Respond with ONLY the corrected text. No prose, no code fences.`;
    }

    // Use the OpenAI-compatible Groq endpoint
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 8000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a transcription correction assistant. You output valid JSON only, no prose, no code fences, no markdown.",
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      throw new Error(`Groq LLM API error (${groqRes.status}): ${errText}`);
    }

    const completion = await groqRes.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const rawContent = completion.choices?.[0]?.message?.content ?? "";

    // Parse the LLM output. We requested json_object mode so the output is a
    // JSON object. We accept either { "segments": [...] } or { "text": "..." }
    // or just a raw array / string for robustness.
    let correctedSegments: TranscriptionSegment[] | null = null;
    let correctedText: string | null = null;

    try {
      const parsed = JSON.parse(rawContent);
      if (Array.isArray(parsed)) {
        // LLM returned a bare array
        correctedSegments = parsed as TranscriptionSegment[];
      } else if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.segments)) {
          correctedSegments = parsed.segments as TranscriptionSegment[];
        } else if (Array.isArray(parsed.data)) {
          correctedSegments = parsed.data as TranscriptionSegment[];
        } else if (typeof parsed.text === "string") {
          correctedText = parsed.text;
        } else if (typeof parsed.corrected === "string") {
          correctedText = parsed.corrected;
        } else {
          // Fall back: take the first string value
          const firstStr = Object.values(parsed).find((v) => typeof v === "string");
          correctedText = firstStr as string ?? "";
        }
      } else if (typeof parsed === "string") {
        correctedText = parsed;
      }
    } catch {
      // Not valid JSON — treat the raw output as plain text
      correctedText = rawContent;
    }

    // Normalize: if we expected segments but only got text, rebuild segments
    // by reusing the original timestamps and splitting the corrected text.
    if (expectedShape === "segments" && !correctedSegments && correctedText !== null) {
      // Best-effort: keep original segment boundaries, redistribute corrected words
      const origSegments = transcription.segments;
      const words = correctedText.split(/\s+/).filter(Boolean);
      const totalOrigWords = origSegments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
      if (totalOrigWords > 0 && words.length > 0) {
        correctedSegments = origSegments.map((s, i) => {
          const startWord = Math.round((i / origSegments.length) * words.length);
          const endWord = Math.round(((i + 1) / origSegments.length) * words.length);
          return {
            id: s.id,
            start: s.start,
            end: s.end,
            text: words.slice(startWord, endWord).join(" "),
          };
        });
      }
    }

    // Build the corrected payload, preserving timestamps
    const correctedPayload: TranscriptionPayload = correctedSegments
      ? {
          text: correctedSegments.map((s) => s.text).join(" "),
          segments: correctedSegments,
          language: transcription.language,
          duration: transcription.duration,
        }
      : {
          text: correctedText ?? transcription.text,
          segments: [],
          language: transcription.language,
          duration: transcription.duration,
        };

    // Store corrected transcription
    const { error: updateErr } = await adminClient.from("articles").update({
      corrected_transcription: correctedPayload as unknown as Record<string, unknown>,
      status: ARTICLE_STATUS.LLM_CORRECTED,
      error_message: null,
      failed_step: null,
    }).eq("id", articleId);

    if (updateErr) {
      throw new Error(`Failed to update article: ${updateErr.message}`);
    }

    return NextResponse.json({
      ok: true,
      status: ARTICLE_STATUS.LLM_CORRECTED,
      segments: correctedPayload.segments.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown LLM correction error";
    await adminClient.from("articles").update({
      status: ARTICLE_STATUS.FAILED,
      error_message: `LLM correction failed: ${message}`,
      failed_step: "correct",
    }).eq("id", articleId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
