"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, authChecked, authDisabled } = useAuth();

  useEffect(() => {
    if (!authChecked) return;
    router.push(isAuthenticated() ? "/dashboard" : "/login");
  }, [authChecked, isAuthenticated, router]);

  let status = "Loading...";
  if (!authChecked) {
    status = "Checking configuration...";
  } else if (authDisabled) {
    status = "Signing in...";
  } else if (!isAuthenticated()) {
    status = "Redirecting...";
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8 p-8">
      <div className="w-16 h-16 bg-surface-900 flex items-center justify-center">
        <span className="text-accent font-display text-3xl">L</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent"></div>
        <span className="text-surface-500">{status}</span>
      </div>
    </div>
  );
}
