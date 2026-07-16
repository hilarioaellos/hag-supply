export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-hag-bg-alt flex flex-col">
      {children}
    </div>
  );
}
