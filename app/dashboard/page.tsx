type DashboardPageProps = {
  searchParams: { exp?: string | string[] };
};

/**
 * The dashboard itself is served as a self-contained document at
 * /api/dashboard and shown in a frame here. A shared experiment link lands on
 * this page, so `?exp=` has to be handed through to the frame — without it the
 * link opened the dashboard with nothing selected.
 */
export default function DashboardPage({ searchParams }: DashboardPageProps) {
  const exp = Array.isArray(searchParams.exp) ? searchParams.exp[0] : searchParams.exp;
  const src = exp
    ? `/api/dashboard?exp=${encodeURIComponent(exp)}`
    : "/api/dashboard";

  return (
    <iframe
      title="Experiment Changelog Dashboard"
      src={src}
      style={{
        width: "100%",
        height: "100vh",
        border: "none",
        display: "block",
      }}
    />
  );
}
