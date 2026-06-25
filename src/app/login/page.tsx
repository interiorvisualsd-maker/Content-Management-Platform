"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-xl border border-slate-200 p-6 space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </button>

      {/* Demo credentials — visible on the page so they don't have to be in the proposal */}
      <div className="mt-4 pt-4 border-t border-slate-100">
        <p className="text-xs font-medium text-slate-700 mb-1">Demo credentials</p>
        <p className="text-xs text-slate-500">Email: <code className="bg-slate-100 px-1 rounded">admin@example.com</code></p>
        <p className="text-xs text-slate-500">Password: <code className="bg-slate-100 px-1 rounded">PASSWORD</code></p>
        <button
          type="button"
          className="text-xs text-slate-500 underline mt-2 hover:text-slate-900"
          onClick={() => {
            setEmail("admin@example.com");
            setPassword("PASSWORD");
          }}
        >
          Auto-fill demo credentials
        </button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-lg mb-3">
            CP
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Admin Login</h1>
          <p className="text-sm text-slate-500 mt-1">Content Management Platform</p>
        </div>

        <Suspense fallback={<div className="text-center text-sm text-slate-400">Loading...</div>}>
          <LoginForm />
        </Suspense>

        <p className="text-xs text-center text-slate-400 mt-6">
          Credentials are set via ADMIN_EMAIL / ADMIN_PASSWORD env vars.
        </p>
      </div>
    </div>
  );
}
