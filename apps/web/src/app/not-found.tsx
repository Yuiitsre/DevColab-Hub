import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-bg text-fg">
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-xl font-bold">Page not found</h1>
        <p className="mt-3 text-sm text-muted">The page you requested does not exist.</p>
        <Link className="mt-6 inline-flex rounded-md border border-border bg-bg px-4 py-2 text-sm font-semibold hover:bg-card" href="/signin">
          Go to sign in
        </Link>
      </div>
    </main>
  );
}

