import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-hag-bg-alt border border-hag-border flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" className="text-hag-text-3" />
          <line x1="4.5" y1="4.5" x2="19.5" y2="19.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-hag-text-3" />
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-hag-text">Access Denied</h1>
        <p className="text-hag-text-2 max-w-sm">
          You do not have permission to view this page. If you think this is a mistake, contact your administrator.
        </p>
      </div>
      <Link
        href="/"
        className="px-5 py-2.5 rounded-lg bg-hag-accent text-white text-sm font-semibold hover:bg-hag-accent-dark transition-colors"
      >
        Back to Home
      </Link>
    </div>
  );
}
