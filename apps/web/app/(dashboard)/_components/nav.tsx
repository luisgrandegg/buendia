"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { colors, motion, radii, space, typography } from "@/lib/ui";

const items = [
  { href: "/", label: "Apps", match: (p: string) => p === "/" },
  { href: "/shared", label: "Shared with me", match: (p: string) => p.startsWith("/shared") },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

const base = {
  textDecoration: "none",
  color: colors.textMuted,
  padding: `${space[2]} ${space[3]}`,
  borderRadius: radii.md,
  fontFamily: typography.fontSans,
  ...typography.size.md,
  fontWeight: typography.weight.medium,
  transition: `background ${motion.fast}, color ${motion.fast}`,
};

const active = {
  ...base,
  background: colors.bgSubtle,
  color: colors.text,
};

export function Nav() {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", gap: space[1] }}>
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
