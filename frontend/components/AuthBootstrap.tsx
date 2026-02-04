"use client";

import { useEffect } from "react";
import { getConfig } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const DEV_TOKEN = "dev-token";

export function AuthBootstrap() {
  const { logout, setAuthDisabled, setAuthChecked } = useAuth();

  useEffect(() => {
    getConfig()
      .then((cfg) => {
        setAuthDisabled(cfg.auth_disabled);
        const token = useAuth.getState().token;

        // In auth-disabled mode, treat the session as authenticated without persisting a "dev token".
        if (cfg.auth_disabled) {
          if (token === DEV_TOKEN) {
            logout();
          }
          return;
        }

        // If auth is enabled, ensure we don't carry the dev token across restarts.
        if (token === DEV_TOKEN) {
          logout();
        }
      })
      .catch(() => {
        // If the server is unreachable, default to requiring auth and let pages handle navigation.
        setAuthDisabled(false);
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, [logout, setAuthChecked, setAuthDisabled]);

  return null;
}
