import Link from "next/link";

const ADMIN_EMAIL = "saloni.kedia@squadstack.ai";

const MAILTO =
  `mailto:${ADMIN_EMAIL}?subject=Request%20Access%20to%20Flywheel&body=Hi%20Saloni%2C%0A%0AI%E2%80%99d%20like%20access%20to%20the%20Flywheel%20experiment%20changelog%20portal.%0A%0AMy%20email%3A%20%5Byour%20%40squadstack.ai%20email%5D%0A%0AThanks!`;

/**
 * Two different things send people here, and they need different words.
 *
 * `?reason=unavailable` means the database could not be read, so we never found
 * out whether this person is on the invite list — see lib/auth.ts. Showing them
 * the invite-only copy would accuse the whole team of losing access every time
 * the database is briefly down, which is exactly what a paused Supabase project
 * did. Everyone else genuinely is not on the list, and still gets the request
 * flow unchanged.
 */
const VARIANTS = {
  unauthorized: {
    icon: "🔒",
    iconBg: "var(--bad-bg)",
    title: "Access Required",
    body: "This portal is invite-only. Contact the admin to get access.",
    primary: { label: "Request Access", href: MAILTO, mail: true },
    secondary: { label: "Back to login", href: "/" },
  },
  unavailable: {
    icon: "🛠️",
    iconBg: "var(--warn-bg)",
    title: "Portal is unavailable",
    body:
      "We could not reach the database to check your access, so this is not about your account. It usually clears in a few minutes — try again, and tell the admin if it keeps happening.",
    primary: { label: "Try again", href: "/", mail: false },
    secondary: { label: "Contact the admin", href: MAILTO },
  },
} as const;

export default function NotAuthorizedPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  const v =
    searchParams?.reason === "unavailable" ? VARIANTS.unavailable : VARIANTS.unauthorized;

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
            background: v.iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: "28px",
          }}
        >
          {v.icon}
        </div>
        <h1
          style={{
            margin: "0 0 8px",
            fontSize: "22px",
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          {v.title}
        </h1>
        <p
          style={{
            margin: "0 0 24px",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            fontSize: "14px",
          }}
        >
          {v.body}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <a
            href={v.primary.href}
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
            {v.primary.mail ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="M22 4L12 13L2 4"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
                <path d="M21 3v6h-6"/>
              </svg>
            )}
            {v.primary.label}
          </a>
          <Link
            href={v.secondary.href}
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
            {v.secondary.label}
          </Link>
        </div>
      </div>
    </main>
  );
}
