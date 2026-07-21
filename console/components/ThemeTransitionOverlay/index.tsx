"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

export function ThemeTransitionOverlay() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleTransition() {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 750);
      return () => clearTimeout(timer);
    }
    window.addEventListener("theme-transition", handleTransition);
    return () => window.removeEventListener("theme-transition", handleTransition);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "12px",
        backgroundColor: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        transition: "opacity 0.2s ease",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "all" : "none",
      }}
    >
      <Loader2
        size={32}
        className="animate-spin"
        style={{ color: "var(--neon-cyan)" }}
      />
      <span
        style={{
          color: "var(--neon-cyan)",
          fontSize: "13px",
          fontWeight: 500,
          letterSpacing: "0.05em",
          textShadow: "0 0 12px currentColor",
        }}
      >
        Applying theme…
      </span>
    </div>,
    document.body
  );
}
