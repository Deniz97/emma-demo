"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
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
      <div className="container mx-auto flex items-center gap-6 px-4 py-3">
        {/* Logo Section */}
        <Link href="/" className="flex items-center gap-3 mr-4 group">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-linear-to-br from-purple-500 to-pink-500 shadow-md transition-transform group-hover:scale-105">
            <span className="text-2xl">💜</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight bg-linear-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              emma
            </span>
            <span className="text-[10px] text-muted-foreground leading-none">
              crypto intelligence
            </span>
          </div>
        </Link>

        {/* Divider */}
        <div className="h-8 w-px bg-border" />

        {/* Navigation Items */}
        <div className="flex items-center gap-2 flex-1">
          {navigationItems.map((item) => {
            const isActive =
              pathname === item.href ||
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

        {/* Theme Toggle */}
        <ThemeToggle />
      </div>
    </nav>
  );
}
