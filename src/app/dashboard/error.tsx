"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-white border border-red-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-red-700 mb-2">Dashboard failed to load</h2>
        <p className="text-sm text-slate-700 mb-4">
          The dashboard hit a server-side error. The most common causes are:
        </p>
        <ul className="text-sm text-slate-700 list-disc list-inside space-y-1 mb-4">
          <li>The Supabase schema hasn&apos;t been run yet — open <code className="bg-slate-100 px-1 rounded">supabase/schema.sql</code> in your Supabase SQL Editor and run it.</li>
          <li>Environment variables were added to Vercel but a redeploy hasn&apos;t happened — go to Deployments → ⋯ → Redeploy.</li>
          <li>A Supabase env var value is wrong (URL must start with <code className="bg-slate-100 px-1 rounded">https://</code>, keys must start with <code className="bg-slate-100 px-1 rounded">eyJ</code>).</li>
        </ul>
        <details className="mb-4">
          <summary className="text-sm font-medium text-slate-700 cursor-pointer">Show error details</summary>
          <pre className="mt-2 text-xs bg-slate-50 border border-slate-200 rounded p-3 overflow-x-auto whitespace-pre-wrap break-words">
            {error.message}
            {error.digest && `\n\nDigest: ${error.digest}`}
            {error.stack && `\n\n${error.stack}`}
          </pre>
        </details>
        <div className="flex gap-2">
          <button onClick={reset} className="btn-primary">Try again</button>
          <a href="/login" className="btn-secondary">Back to login</a>
        </div>
      </div>
    </div>
  );
}
