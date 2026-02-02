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

    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

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
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-surface-off-white/95 backdrop-blur-sm border-b border-surface-200"
          : "bg-surface-off-white border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 bg-surface-900 flex items-center justify-center">
                <span className="text-accent font-display text-lg">L</span>
              </div>
              <span className="text-sm font-medium tracking-widest uppercase text-surface-900">
                Litmus
              </span>
            </Link>
            {isLoggedIn && (
              <div className="ml-12 flex items-center space-x-1">
                <Link
                  href="/dashboard"
                  className="text-surface-500 hover:text-accent px-3 py-2 text-sm transition-colors tracking-wide"
                >
                  Dashboard
                </Link>
                <Link
                  href="/experiments/new"
                  className="text-surface-500 hover:text-accent px-3 py-2 text-sm transition-colors tracking-wide"
                >
                  New Experiment
                </Link>
                <Link
                  href="/hypothesize"
                  className="text-surface-500 hover:text-accent px-3 py-2 text-sm transition-colors tracking-wide"
                >
                  Hypothesize
                </Link>
                <Link
                  href="/templates"
                  className="text-surface-500 hover:text-accent px-3 py-2 text-sm transition-colors tracking-wide"
                >
                  Templates
                </Link>
                {user?.role === "operator" && (
                  <Link
                    href="/operator/jobs"
                    className="text-surface-500 hover:text-accent px-3 py-2 text-sm transition-colors tracking-wide"
                  >
                    Available Jobs
                  </Link>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center">
            {isLoggedIn ? (
              <div className="flex items-center space-x-6">
                <span className="text-sm text-surface-400">{user?.email}</span>
                <button
                  onClick={handleLogout}
                  className="text-surface-500 hover:text-accent text-sm transition-colors tracking-wide"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <Link
                  href="/login"
                  className="text-surface-500 hover:text-accent text-sm transition-colors tracking-wide"
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
