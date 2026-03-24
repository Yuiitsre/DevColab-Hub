'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function AuthCallbackPage() {
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get('token');
    const refresh = params.get('refresh');
    if (token) localStorage.setItem('dc_token', token);
    if (refresh) localStorage.setItem('dc_refresh', refresh);
    window.location.href = '/app';
  }, [params]);

  return (
    <main className="min-h-screen bg-bg text-fg">
      <div className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-xl font-bold">Signing you in…</h1>
        <p className="mt-3 text-sm text-muted">Finishing authentication and redirecting.</p>
      </div>
    </main>
  );
}
