"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";

const HIDDEN_PATHS = ["/agent-demo"];

export function ConditionalNavbar() {
  const pathname = usePathname();
  if (HIDDEN_PATHS.some((p) => pathname.startsWith(p))) return null;
  return <Navbar />;
}
