// Next re-mounts a `template.tsx` (unlike `layout.tsx`, which persists)
// on every navigation into this segment, including between sibling tabs
// (Home -> Friends -> Groups) -- so this is the one place that animates
// every move between dashboard screens, with one consistent treatment,
// guaranteed on every page without each one adding it to its own root
// div. Replaces the old per-page `.fade-in` (stripped from every page
// here and in app/auth/ in favor of this -- having both would have
// doubled the motion on mount for no reason). Pure CSS, no client JS:
// the animation runs itself the moment this div is mounted.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
