"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

export function Navbar() {
  const router = useRouter();
  const { user, logout, isAuthenticated } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const isLoggedIn = mounted && isAuthenticated();

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-200 ${
        scrolled
          ? "bg-white/95 backdrop-blur-sm border-b border-surface-200 shadow-sm"
          : "bg-white border-b border-surface-200"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex justify-between h-14">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-accent rounded-md flex items-center justify-center">
                <span className="text-white font-bold text-sm">L</span>
              </div>
              <span className="text-sm font-semibold text-surface-900 tracking-tight">
                Litmus
              </span>
            </Link>
            {isLoggedIn && (
              <div className="flex items-center gap-1">
                {[
                  { href: "/dashboard", label: "Dashboard" },
                  { href: "/experiments/new", label: "New Experiment" },
                  { href: "/hypothesize", label: "Hypothesize" },
                  { href: "/templates", label: "Templates" },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="px-3 py-1.5 text-sm text-surface-500 hover:text-surface-900 hover:bg-surface-100 rounded-md transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
                {user?.role === "operator" && (
                  <Link
                    href="/operator/jobs"
                    className="px-3 py-1.5 text-sm text-surface-500 hover:text-surface-900 hover:bg-surface-100 rounded-md transition-colors"
                  >
                    Available Jobs
                  </Link>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center">
            {isLoggedIn ? (
              <div className="flex items-center gap-4">
                <span className="text-xs text-surface-400">{user?.email}</span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-surface-500 hover:text-surface-900 transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-sm text-surface-500 hover:text-surface-900 transition-colors"
                >
                  Login
                </Link>
                <Link href="/register" className="btn-primary text-xs">
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
