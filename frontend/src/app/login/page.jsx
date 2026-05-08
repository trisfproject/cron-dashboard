'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LockKeyhole, Mail } from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getCurrentUser, login } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getCurrentUser({ redirectOnAuthFailure: false })
      .then((data) => {
        if (cancelled) {
          return;
        }

        if (data?.user) {
          const next = searchParams.get('next') || '/';
          router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/');
          return;
        }

        setCheckingSession(false);
      })
      .catch(() => {
        if (!cancelled) {
          setCheckingSession(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      const next = searchParams.get('next') || '/';
      router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/');
      router.refresh();
    } catch (loginError) {
      setError(
        String(loginError?.message || '').includes('401')
          ? 'Invalid email or password.'
          : (loginError?.message || 'Unable to sign in. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center py-8">
        <section className="flex w-full max-w-sm flex-col items-center gap-5 rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <BrandMark />
          <div className="space-y-2">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600 dark:border-slate-800 dark:border-t-blue-400" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Checking secure session...</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center py-8">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <BrandMark />
            <h1 className="mt-5 text-xl font-semibold tracking-normal text-ink">Sign in to NYX</h1>
            <p className="mt-1 text-sm text-slate-500">Access operational observability, alerts, and cron reliability data.</p>
          </div>
          <ThemeToggle />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Email</span>
            <span className="flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
              <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full bg-transparent text-ink outline-none"
                required
              />
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Password</span>
            <span className="flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
              <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-transparent text-ink outline-none"
                required
              />
            </span>
          </label>

          {error ? (
            <p className="rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="flex min-h-10 w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Authentication is required for all NYX operational routes. User and role management will build on this foundation.
        </p>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[calc(100vh-12rem)] items-center justify-center text-sm text-slate-500">Loading sign in...</div>}>
      <LoginForm />
    </Suspense>
  );
}
