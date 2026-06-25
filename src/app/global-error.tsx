"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="w-full max-w-lg bg-white border border-red-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-red-700 mb-2">Application error</h2>
            <p className="text-sm text-slate-700 mb-4">
              Something went wrong rendering this page.
            </p>
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
      </body>
    </html>
  );
}
