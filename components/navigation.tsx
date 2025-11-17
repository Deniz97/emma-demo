"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigationItems = [
  { href: "/", label: "Chat" },
  { href: "/apps", label: "Apps" },
  { href: "/classes", label: "Classes" },
  { href: "/registered-tools", label: "Methods" },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto flex items-center gap-2 px-4 py-2">
        {navigationItems.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== "/" && pathname?.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "transition-colors",
                  isActive && "bg-primary text-primary-foreground"
                )}
              >
                {item.label}
              </Button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

