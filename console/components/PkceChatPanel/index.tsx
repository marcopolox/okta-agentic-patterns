"use client";

import { useState, useEffect } from "react";
import { LogIn } from "lucide-react";
import { Pattern } from "@/lib/patterns";
import { ChatPanel } from "@/components/ChatPanel";

export function PkceChatPanel({ pattern, active }: { pattern: Pattern; active: boolean }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(`p5_token`);
    if (stored) setToken(stored);
  }, []);

  function login() {
    const clientId = process.env.NEXT_PUBLIC_P5_OKTA_CLIENT_ID;
    const domain = process.env.NEXT_PUBLIC_OKTA_DOMAIN;
    if (!clientId || !domain) {
      alert("P5_OKTA_CLIENT_ID and OKTA_DOMAIN must be set in .env");
      return;
    }
    const redirect = `${window.location.origin}/api/auth/callback/p5`;
    const state = crypto.randomUUID();
    const verifier = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    sessionStorage.setItem("pkce_verifier", verifier);
    sessionStorage.setItem("pkce_state", state);

    const url = new URL(`https://${domain}/oauth2/v1/authorize`);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid profile email");
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("state", state);
    window.location.href = url.toString();
  }

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-gray-700/50 bg-gray-800/60 p-6 text-center">
        <div>
          <p className="mb-2 text-sm text-slate-500">Pattern 5 not running</p>
          <code className="text-xs text-slate-600">
            docker compose --profile p5 up
          </code>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border border-gray-700/50 bg-gray-800/60 p-6 text-center neon-border">
        <p className="text-sm text-slate-400">
          Log in with your GitHub Enterprise account via Okta SSO to let the
          agent act on your behalf.
        </p>
        <button
          onClick={login}
          className="flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/30 neon-btn"
        >
          <LogIn size={14} />
          Login with GitHub Enterprise
        </button>
      </div>
    );
  }

  return (
    <ChatPanel
      agentUrl={pattern.agentUrl ?? ""}
      patternId={pattern.id}
      disabled={false}
    />
  );
}
