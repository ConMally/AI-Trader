import Link from "next/link";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  let isAuthenticated = false;

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isAuthenticated = Boolean(user);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide opacity-60">AI-Trader</p>
        <h1 className="mt-1 text-3xl font-semibold">AI-Trader</h1>
      </div>

      <p className="opacity-80">
        A practice trading dashboard. Every order you place here is a{" "}
        <strong>LOCAL SIMULATION</strong> — it&apos;s computed entirely on this server and is
        never sent to Alpaca or any brokerage.
      </p>

      <p className="opacity-80">
        Account, position, and market data shown alongside your simulations come from a real
        Alpaca paper-trading account, but that connection is <strong>read only</strong>: nothing
        you do here can place, cancel, or modify any order at Alpaca.
      </p>

      <p className="text-sm opacity-60">
        Not financial advice. Nothing on this site is a recommendation to buy or sell any security
        — see <code>docs/DISCLAIMER.md</code>.
      </p>

      <div className="flex flex-wrap gap-3">
        {isAuthenticated ? (
          <Link
            href="/dashboard"
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Open dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              Log in
            </Link>
            <Link href="/signup" className="rounded border border-black/20 px-4 py-2 text-sm font-medium dark:border-white/20">
              Sign up
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
