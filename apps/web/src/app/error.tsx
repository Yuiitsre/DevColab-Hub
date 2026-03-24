'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-bg text-fg">
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="mt-3 text-sm text-muted">{error.message}</p>
        <button className="mt-6 rounded-md border border-border bg-bg px-4 py-2 text-sm font-semibold hover:bg-card" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}

