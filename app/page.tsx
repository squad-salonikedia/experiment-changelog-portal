import { auth, signIn } from "@/lib/auth";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (session?.user?.email) {
    return null;
  }

  async function login() {
    "use server";
    await signIn("google", { redirectTo: params.callbackUrl || "/dashboard" });
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          background: "var(--white)",
          border: "1px solid var(--border)",
          borderRadius: "18px",
          padding: "32px 28px",
          boxShadow: "0 12px 40px rgba(25, 17, 50, 0.08)",
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--lucid)",
          }}
        >
          SquadStack internal
        </p>
        <h1 style={{ margin: "0 0 8px", fontSize: "28px" }}>Experiment Changelog</h1>
        <p style={{ margin: "0 0 24px", color: "var(--text-muted)", lineHeight: 1.5 }}>
          Sign in with your SquadStack Google account to view and log experiments.
          Data is loaded live from the team Google Sheet.
        </p>

        {params.error ? (
          <div
            style={{
              marginBottom: "16px",
              padding: "10px 12px",
              borderRadius: "8px",
              background: "#fce9e7",
              color: "#c0392b",
              fontSize: "13px",
            }}
          >
            Sign-in failed. Only <strong>@squadstack.ai</strong> accounts can access
            this portal.
          </div>
        ) : null}

        <form action={login}>
          <button
            type="submit"
            style={{
              width: "100%",
              border: "none",
              borderRadius: "10px",
              padding: "12px 16px",
              fontSize: "15px",
              fontWeight: 700,
              cursor: "pointer",
              background: "var(--lucid)",
              color: "var(--white)",
            }}
          >
            Continue with Google
          </button>
        </form>

        <p
          style={{
            margin: "18px 0 0",
            fontSize: "12px",
            color: "var(--text-muted)",
            lineHeight: 1.6,
          }}
        >
          You must be logged in before the dashboard loads. Sharing the link alone
          does not grant access.
        </p>
      </div>
    </main>
  );
}
