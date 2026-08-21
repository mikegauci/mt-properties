import Link from "next/link";

const links = [
  { href: "/", label: "Market" },
  { href: "/listings", label: "Listings" },
  { href: "/valuation", label: "Valuation" },
  { href: "/health", label: "Pipeline" },
];

export function SiteHeader() {
  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4">
        <Link href="/" className="text-primary font-semibold tracking-tight">
          MT Properties
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
