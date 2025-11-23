"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect, startTransition } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";

const navigationItems = [
  { href: "/", label: "Chat" },
  { href: "/apps", label: "Apps" },
  { href: "/classes", label: "Classes" },
  { href: "/registered-tools", label: "Methods" },
];

type ThemeOption = "light" | "dark" | "system";

const themeOptions: Array<{
  value: ThemeOption;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

export function NavigationMenu() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    startTransition(() => {
      setMounted(true);
    });
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    // Add a delay before closing to allow moving mouse to the menu
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className="p-1.5 md:p-2 rounded-md hover:bg-muted transition-colors bg-background border shadow-sm"
        aria-label="Navigation menu"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground"
        >
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1.5 md:mt-2 w-44 md:w-48 bg-popover border rounded-md shadow-lg z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-1.5 md:p-2 space-y-0.5 md:space-y-1">
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
                      "w-full justify-start transition-colors text-xs md:text-sm h-8 md:h-9",
                      isActive && "bg-primary text-primary-foreground"
                    )}
                  >
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </div>

          {/* Theme Selector */}
          <div className="border-t border-border my-0.5 md:my-1" />
          <div className="p-1.5 md:p-2">
            <div className="text-[10px] md:text-xs font-medium text-muted-foreground px-1.5 md:px-2 pb-1.5 md:pb-2">
              Theme
            </div>
            <div className="grid grid-cols-3 gap-0.5 md:gap-1">
              {mounted
                ? themeOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = theme === option.value;
                    return (
                      <Button
                        key={option.value}
                        variant={isActive ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTheme(option.value)}
                        className={cn(
                          "flex flex-col items-center gap-0.5 md:gap-1 h-auto py-1.5 md:py-2 transition-colors",
                          isActive && "bg-primary text-primary-foreground"
                        )}
                      >
                        <Icon className="h-3 w-3 md:h-4 md:w-4" />
                        <span className="text-[9px] md:text-[10px]">
                          {option.label}
                        </span>
                      </Button>
                    );
                  })
                : // Skeleton while mounting
                  themeOptions.map((option) => (
                    <div
                      key={option.value}
                      className="flex flex-col items-center gap-0.5 md:gap-1 h-auto py-1.5 md:py-2 bg-muted rounded-md animate-pulse"
                    >
                      <div className="h-3 w-3 md:h-4 md:w-4 bg-muted-foreground/20 rounded" />
                      <div className="h-2 w-6 md:w-8 bg-muted-foreground/20 rounded" />
                    </div>
                  ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
