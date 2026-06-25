"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewArticlePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    level: "",
    category: "",
    language: "en",
  });

  function slugify(s: string): string {
    return s
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "title" && !prev.slug) {
        next.slug = slugify(value);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save article");
        return;
      }
      router.push(`/articles/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-900">← Back to dashboard</Link>
          <h1 className="font-semibold text-slate-900">New Article</h1>
          <div className="w-24" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-5 bg-white border border-slate-200 rounded-xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label" htmlFor="title">Title *</label>
              <input id="title" className="input" required value={form.title} onChange={(e) => update("title", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="slug">Slug *</label>
              <input id="slug" className="input" required value={form.slug} onChange={(e) => update("slug", e.target.value)} />
              <p className="text-xs text-slate-400 mt-1">URL-friendly identifier. Auto-generated from title.</p>
            </div>
            <div>
              <label className="label" htmlFor="language">Language</label>
              <select id="language" className="input" value={form.language} onChange={(e) => update("language", e.target.value)}>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="pt">Portuguese</option>
                <option value="it">Italian</option>
                <option value="nl">Dutch</option>
                <option value="ja">Japanese</option>
                <option value="ko">Korean</option>
                <option value="zh">Chinese</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="level">Level (optional)</label>
              <input id="level" className="input" placeholder="beginner / intermediate / advanced" value={form.level} onChange={(e) => update("level", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="category">Category (optional)</label>
              <input id="category" className="input" placeholder="e.g. machine-learning" value={form.category} onChange={(e) => update("category", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="excerpt">Short description / excerpt</label>
              <textarea id="excerpt" className="input min-h-[80px]" value={form.excerpt} onChange={(e) => update("excerpt", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="content">Article content *</label>
              <textarea id="content" className="input min-h-[320px] font-mono text-sm" required value={form.content} onChange={(e) => update("content", e.target.value)} placeholder="Paste or type the full article text here..." />
              <p className="text-xs text-slate-400 mt-1">{form.content.trim().split(/\s+/).filter(Boolean).length} words</p>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Link href="/dashboard" className="btn-secondary">Cancel</Link>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save as Draft"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
