import Link from 'next/link';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://devcolab-backend.onrender.com';

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-bg text-fg">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(hsla(0,0%,100%,0.04)_1px,transparent_1px),linear-gradient(90deg,hsla(0,0%,100%,0.04)_1px,transparent_1px)] bg-[size:42px_42px]" />
      <div className="pointer-events-none fixed left-1/2 top-[-20%] h-[560px] w-[860px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,hsla(var(--brand),0.16)_0%,transparent_72%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
        <div className="w-full max-w-[440px] rounded-lg border border-border bg-card/90 p-10 shadow-[0_40px_120px_rgba(0,0,0,0.7)] backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[linear-gradient(135deg,hsla(var(--brand),1),hsla(142,71%,35%,1))] text-sm font-black text-black">
              DC
            </div>
            <div className="text-lg font-extrabold tracking-tight">
              DevCollab <span className="text-[hsl(var(--brand))]">Hub</span>
            </div>
          </div>

          <h1 className="mt-8 text-2xl font-extrabold tracking-tight">
            Engineering operations,
            <br />
            done together.
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted">
            Real-time collaboration for dev teams.
            Tasks, code, channels, and AI — all in one place.
          </p>

          <a
            href={`${apiUrl}/auth/github`}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-bg px-4 py-3 text-sm font-semibold transition hover:bg-card"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Continue with GitHub
          </a>

          <div className="mt-8 grid grid-cols-2 gap-2 border-t border-border pt-6 text-xs text-muted">
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[hsl(var(--brand))]" />
              End-to-end encrypted
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[hsl(var(--brand))]" />
              GitHub OAuth only
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[hsl(var(--brand))]" />
              Role-based access
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[hsl(var(--brand))]" />
              Real-time collaboration
            </div>
          </div>

          <div className="mt-8 text-center text-xs text-muted">
            <Link href="/status" className="underline underline-offset-4 hover:text-fg">
              System status
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
