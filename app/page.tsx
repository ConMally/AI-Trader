// Phase 0 placeholder. No trading logic, no data fetching, no auth flow
// yet — this page exists only so the scaffold boots and renders something
// sane. See docs/ROADMAP.md for what replaces this in later phases.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-wide opacity-60">Phase 0 — Foundations</p>
      <h1 className="text-3xl font-semibold">AI-Trader</h1>
      <p className="opacity-80">
        A human-in-the-loop, AI-assisted trading platform. The AI proposes and explains trades;
        deterministic server code calculates position size and enforces every risk limit. Paper
        trading is always the default — nothing here places a real order.
      </p>
      <p className="text-sm opacity-60">
        This scaffold intentionally does not yet connect to a broker or generate any trade logic.
        See <code>docs/ARCHITECTURE.md</code> and <code>docs/ROADMAP.md</code> for what comes next.
      </p>
    </main>
  );
}
