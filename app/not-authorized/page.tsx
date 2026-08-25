import Link from "next/link";

const ADMIN_EMAIL = "saloni.kedia@squadstack.ai";

export default function NotAuthorizedPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "linear-gradient(135deg, #f3f0ff 0%, #faf9fe 40%, #f0edf5 100%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "var(--white)",
          border: "1px solid var(--border)",
          borderRadius: "20px",
          padding: "40px 32px",
          boxShadow: "0 20px 60px rgba(15, 10, 30, 0.06)",
          textAlign: "center",
          animation: "slideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "16px",
            background: "var(--bad-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: "28px",
          }}
        >
          🔒
        </div>
        <h1
          style={{
            margin: "0 0 8px",
            fontSize: "22px",
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          Access Required
        </h1>
        <p
          style={{
            margin: "0 0 24px",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            fontSize: "14px",
          }}
        >
          This portal is invite-only. Contact the admin to get access.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <a
            href={`mailto:${ADMIN_EMAIL}?subject=Request%20Access%20to%20Flywheel&body=Hi%20Saloni%2C%0A%0AI%E2%80%99d%20like%20access%20to%20the%20Flywheel%20experiment%20changelog%20portal.%0A%0AMy%20email%3A%20%5Byour%20%40squadstack.ai%20email%5D%0A%0AThanks!`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "12px 20px",
              borderRadius: "10px",
              background: "var(--lucid)",
              color: "var(--white)",
              fontSize: "14px",
              fontWeight: 600,
              textDecoration: "none",
              transition: "all 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="M22 4L12 13L2 4"/>
            </svg>
            Request Access
          </a>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "10px 20px",
              borderRadius: "10px",
              background: "var(--dark)",
              color: "var(--white)",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
              transition: "all 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}
