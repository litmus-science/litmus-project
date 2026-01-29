"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getConfig } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, setAuth } = useAuth();
  const [status, setStatus] = useState("Loading...");
  const [config, setConfigState] = useState<{ auth_disabled: boolean; debug_mode: boolean } | null>(null);

  useEffect(() => {
    async function checkAuth() {
      setStatus("Fetching config...");

      try {
        const cfg = await getConfig();
        setConfigState(cfg);
        setStatus(`Config loaded: auth_disabled=${cfg.auth_disabled}`);

        if (cfg.auth_disabled) {
          setStatus("Auth disabled - setting up dev user...");
          setAuth("dev-token", {
            id: "dev-user",
            email: "dev@litmus.science",
            name: "Development User",
            organization: "Litmus Dev",
            role: "admin",
            rate_limit_tier: "pro",
            created_at: new Date().toISOString(),
          });
          setStatus("Redirecting to dashboard...");
          setTimeout(() => router.push("/dashboard"), 1000);
          return;
        }
      } catch (err) {
        setStatus(`Config fetch failed: ${err}`);
      }

      if (isAuthenticated()) {
        setStatus("Already authenticated - redirecting to dashboard...");
        setTimeout(() => router.push("/dashboard"), 1000);
      } else {
        setStatus("Not authenticated - redirecting to login...");
        setTimeout(() => router.push("/login"), 1000);
      }
    }

    checkAuth();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
      <div className="text-xl font-bold">Litmus Debug</div>
      <div className="text-sm bg-gray-100 p-4 rounded max-w-lg">
        <p><strong>Status:</strong> {status}</p>
        <p><strong>API URL:</strong> {process.env.NEXT_PUBLIC_API_URL || "not set (using localhost:8000)"}</p>
        {config && <p><strong>Config:</strong> {JSON.stringify(config)}</p>}
      </div>
    </div>
  );
}
