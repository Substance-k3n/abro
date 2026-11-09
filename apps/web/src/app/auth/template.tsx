// Same treatment as app/(dashboard)/template.tsx, for the sign-in ->
// verify-email -> setup-profile flow.
export default function AuthTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
