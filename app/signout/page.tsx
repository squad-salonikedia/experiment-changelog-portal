import { signOut } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function SignOutPage() {
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
          maxWidth: "380px",
          background: "var(--white)",
          border: "1px solid var(--border)",
          borderRadius: "20px",
          padding: "36px 32px",
          textAlign: "center",
          boxShadow:
            "0 20px 60px rgba(15, 10, 30, 0.06), 0 1px 3px rgba(15, 10, 30, 0.04)",
          animation: "slideUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
      >
        <h1
          style={{
            margin: "0 0 8px",
            fontSize: "20px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Sign out of Flywheel?
        </h1>
        <p
          style={{
            margin: "0 0 24px",
            fontSize: "14px",
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          You will need to sign in with Google again to get back in.
        </p>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "10px",
              border: "none",
              background: "var(--ink, #0f0a1e)",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Sign out
          </button>
        </form>

        <a
          href="/dashboard"
          style={{
            display: "inline-block",
            marginTop: "14px",
            fontSize: "13px",
            color: "var(--text-muted)",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          Never mind, take me back
        </a>
      </div>
    </main>
  );
}
