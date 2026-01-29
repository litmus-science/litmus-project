"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

export function Navbar() {
  const router = useRouter();
  const { user, logout, isAuthenticated } = useAuth();
  const [mounted, setMounted] = useState(false);

  // Only check auth after component mounts to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const isLoggedIn = mounted && isAuthenticated();

  return (
    <nav className="bg-surface-white border-b border-surface-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-litmus-base-teal to-litmus-base-blue flex items-center justify-center">
                <span className="text-white font-display text-lg">L</span>
              </div>
              <span className="text-xl font-display text-primary">Litmus</span>
            </Link>
            {isLoggedIn && (
              <div className="ml-10 flex items-center space-x-1">
                <Link
                  href="/dashboard"
                  className="text-surface-400 hover:text-primary hover:bg-surface-100 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  href="/experiments/new"
                  className="text-surface-400 hover:text-primary hover:bg-surface-100 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  New Experiment
                </Link>
                <Link
                  href="/templates"
                  className="text-surface-400 hover:text-primary hover:bg-surface-100 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Templates
                </Link>
                {user?.role === "operator" && (
                  <Link
                    href="/operator/jobs"
                    className="text-surface-400 hover:text-primary hover:bg-surface-100 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Available Jobs
                  </Link>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center">
            {isLoggedIn ? (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-surface-400">{user?.email}</span>
                <button
                  onClick={handleLogout}
                  className="text-surface-400 hover:text-primary px-3 py-2 text-sm font-medium transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  href="/login"
                  className="text-surface-400 hover:text-primary px-3 py-2 text-sm font-medium transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="btn-primary text-sm"
                >
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
