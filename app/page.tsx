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
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(135deg, #f3f0ff 0%, #faf9fe 40%, #f0edf5 100%)",
      }}
    >
      {/* Animated background orbs */}
      <div
        style={{
          position: "absolute",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(111, 57, 245, 0.08) 0%, transparent 70%)",
          top: "-200px",
          right: "-100px",
          animation: "float 8s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "400px",
          height: "400px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(111, 57, 245, 0.06) 0%, transparent 70%)",
          bottom: "-150px",
          left: "-50px",
          animation: "float 10s ease-in-out infinite reverse",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "var(--white)",
          border: "1px solid var(--border)",
          borderRadius: "20px",
          padding: "40px 32px",
          boxShadow: "0 20px 60px rgba(15, 10, 30, 0.06), 0 1px 3px rgba(15, 10, 30, 0.04)",
          position: "relative",
          animation: "slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
      >
        <div
          style={{
            marginBottom: "20px",
            animation: "fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both",
          }}
        >
          <svg width="130" height="28" viewBox="0 0 520 110" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M42 8L72 28L42 48L12 28L42 8Z" fill="#0F2137"/>
            <path d="M12 45L42 65L72 45" stroke="#2DD4A8" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M12 62L42 82L72 62" stroke="#2DD4A8" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <text x="88" y="62" fontFamily="Inter, system-ui, sans-serif" fontSize="52" fontWeight="800" fill="#0F2137">SquadStack</text>
          </svg>
        </div>

        <h1
          style={{
            margin: "0 0 8px",
            fontSize: "28px",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            animation: "fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both",
          }}
        >
          Flywheel
        </h1>
        <p
          style={{
            margin: "0 0 28px",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            fontSize: "15px",
            animation: "fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.25s both",
          }}
        >
          Track voice agent experiments, measure what moves, and share wins across the team.
        </p>

        {params.error ? (
          <div
            style={{
              marginBottom: "20px",
              padding: "12px 14px",
              borderRadius: "12px",
              background: "var(--bad-bg)",
              color: "var(--bad)",
              fontSize: "13px",
              fontWeight: 500,
              border: "1px solid rgba(239, 68, 68, 0.1)",
              animation: "shakeIn 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            Only <strong>@squadstack.ai</strong> accounts can access this portal.
          </div>
        ) : null}

        <form action={login}>
          <button
            type="submit"
            className="btn-login"
            style={{
              width: "100%",
              border: "none",
              borderRadius: "12px",
              padding: "14px 16px",
              fontSize: "15px",
              fontWeight: 700,
              cursor: "pointer",
              background: "var(--dark)",
              color: "var(--white)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              transition: "all 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
              animation: "fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </form>

        <p
          style={{
            margin: "20px 0 0",
            fontSize: "12px",
            color: "var(--text-muted)",
            textAlign: "center",
            lineHeight: 1.5,
            animation: "fadeIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.45s both",
          }}
        >
          For @squadstack.ai team members
        </p>
      </div>

    </main>
  );
}
