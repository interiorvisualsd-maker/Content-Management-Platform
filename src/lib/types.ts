import type { ArticleStatus } from "./status";

// Transcription segment as returned by Groq Whisper
export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

// Full transcription payload stored in articles.transcription JSONB column
export interface TranscriptionPayload {
  text: string;
  segments: TranscriptionSegment[];
  language?: string;
  duration?: number;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  level: string | null;
  category: string | null;
  language: string;
  status: ArticleStatus;
  audio_url: string | null;
  audio_storage_path: string | null;
  transcription: TranscriptionPayload | null;
  corrected_transcription: TranscriptionPayload | null;
  error_message: string | null;
  failed_step: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface ArticleInput {
  title: string;
  slug: string;
  excerpt?: string;
  content: string;
  level?: string;
  category?: string;
  language?: string;
}
