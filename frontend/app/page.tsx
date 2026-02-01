"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getConfig } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, setAuth } = useAuth();
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    async function checkAuth() {
      setStatus("Checking configuration...");

      try {
        const cfg = await getConfig();

        if (cfg.auth_disabled) {
          setAuth("dev-token", {
            id: "dev-user",
            email: "dev@litmus.science",
            name: "Development User",
            organization: "Litmus Dev",
            role: "admin",
            rate_limit_tier: "pro",
            created_at: new Date().toISOString(),
          });
          router.push("/dashboard");
          return;
        }
      } catch {
        setStatus("Connecting to server...");
      }

      if (isAuthenticated()) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
    }

    checkAuth();
  }, [isAuthenticated, router, setAuth]);

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
