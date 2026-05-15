"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "My apps", match: (p: string) => p === "/" },
  { href: "/shared", label: "Shared with me", match: (p: string) => p.startsWith("/shared") },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

const base = {
  textDecoration: "none",
  color: "inherit",
  padding: "0.5rem 0.75rem",
  borderRadius: "0.375rem",
  fontSize: "0.9375rem",
};

const active = {
  ...base,
  background: "#111827",
  color: "white",
};

export function Nav() {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", gap: "0.5rem" }}>
      {items.map((item) => {
        const isActive = item.match(pathname);
        return (
          <Link key={item.href} href={item.href} style={isActive ? active : base}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
