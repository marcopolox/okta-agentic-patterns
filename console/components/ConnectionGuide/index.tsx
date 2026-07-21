"use client";

import { useState } from "react";
import { Copy, Check, Terminal } from "lucide-react";

interface ConnectionGuideProps {
  adapterUrl: string;
  active: boolean;
  variant?: "developer-tools" | "consumer-agent";
}

export function ConnectionGuide({ adapterUrl, variant = "developer-tools" }: ConnectionGuideProps) {
  const isConsumer = variant === "consumer-agent";
  const [copied, setCopied] = useState<string | null>(null);

  const mcpServerName = isConsumer ? "okta-inventory" : "okta-mcp-adapter";
  const vscodeJson = JSON.stringify(
    { servers: { [mcpServerName]: { type: "http", url: adapterUrl } } },
    null,
    2
  );

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function CodeBlock({ text, copyKey }: { text: string; copyKey: string }) {
    return (
      <div className="group relative flex items-start gap-2 rounded-lg border border-gray-600/50 bg-gray-900/80 px-3 py-2 font-mono text-xs text-emerald-300">
        <span className="flex-1 select-all whitespace-pre-wrap break-all">{text}</span>
        <button
          onClick={() => copyToClipboard(text, copyKey)}
          className="mt-0.5 shrink-0 rounded p-0.5 text-slate-600 transition-colors hover:text-cyan-400 neon-btn"
        >
          {copied === copyKey ? (
            <Check size={12} className="text-emerald-400" />
          ) : (
            <Copy size={12} />
          )}
        </button>
      </div>
    );
  }

  const samplePrompt = isConsumer
    ? "What products do you have available?"
    : "What tools do you have available?";

  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-700/50 bg-gray-800/60 neon-card">
      <div className="flex items-center gap-2 border-b border-gray-700/50 px-4 py-2">
        <Terminal size={13} className="text-cyan-400" />
        <span className="text-xs font-semibold tracking-wider text-cyan-400 uppercase neon-text">
          {isConsumer
            ? "Connect Claude / ChatGPT / Gemini / any AI agent"
            : "Connect Claude Code / Cursor / VSCode / any coding assistant tool"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <ol className="space-y-5">

          {/* Step 1 — custom layout with two sub-options */}
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/15 text-xs font-bold text-cyan-400 neon-text">
              1
            </span>
            <div className="flex-1">
              <p className="mb-3 text-sm font-medium text-white">
                {isConsumer
                  ? "Connect your AI agent to the bridge — it will self-register via DCR on first connect"
                  : "Add the bridge as an MCP server in Claude Code, VSCode, or any coding assistant"}
              </p>
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-400">Claude Code (CLI)</p>
                  <CodeBlock
                    text={`claude mcp add --transport http --scope user ${mcpServerName} ${adapterUrl}`}
                    copyKey="claude-cli"
                  />
                  {!isConsumer && (
                    <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2.5">
                      <p className="text-xs text-amber-300/80 leading-relaxed">
                        <span className="font-semibold text-amber-300">Note:</span> If the <span className="font-mono text-amber-200">/mcp</span> command is showing stale info it is because MCP servers are initialized at session startup. The server was added mid-session, so the current session doesn&apos;t reflect it.
                      </p>
                      <p className="mt-1.5 text-xs text-amber-300/80 leading-relaxed">
                        <span className="font-semibold text-amber-300">Fix:</span> Start a new Claude Code session. The <span className="font-mono text-amber-200">/mcp</span> command will then show <span className="font-mono text-amber-200">okta-mcp-bridge</span> as connected.
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-400">
                    VS Code — add to <span className="text-slate-300">.vscode/mcp.json</span>
                  </p>
                  <CodeBlock text={vscodeJson} copyKey="vscode-json" />
                </div>
                <p className="text-xs text-slate-500">
                  {isConsumer
                    ? "ChatGPT / Gemini: add the URL above as an MCP server in your agent settings."
                    : "Cursor: Settings → MCP → Add Server → HTTP → paste the URL above."}
                </p>
              </div>
            </div>
          </li>

          {/* Step 2 */}
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/15 text-xs font-bold text-cyan-400 neon-text">
              2
            </span>
            <div className="flex-1">
              <p className="mb-1.5 text-sm font-medium text-white">
                {isConsumer ? "Sign in as an end user when prompted" : "Authenticate when prompted"}
              </p>
              <p className="text-xs text-slate-500">
                {isConsumer
                  ? "The bridge opens your Okta login page. Sign in — your identity travels with every tool call as the token's sub claim."
                  : "Your Okta login page will open. Sign in with your demo credentials."}
              </p>
            </div>
          </li>

          {/* Step 3 */}
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/15 text-xs font-bold text-cyan-400 neon-text">
              3
            </span>
            <div className="flex-1">
              <p className="mb-1.5 text-sm font-medium text-white">
                {isConsumer ? "Ask about the product catalog" : "Ask your assistant what tools are available"}
              </p>
              <CodeBlock text={samplePrompt} copyKey="prompt" />
              <p className="mt-1.5 text-xs text-slate-500">
                {isConsumer
                  ? "Try: \"Check stock for WirelessPro Headphones X3\" or \"What's the status of order ORD-10041?\""
                  : "Your assistant will discover all tools connected through the bridge automatically."}
              </p>
            </div>
          </li>

          {/* Step 4 */}
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/15 text-xs font-bold text-cyan-400 neon-text">
              4
            </span>
            <div className="flex-1">
              <p className="mb-1.5 text-sm font-medium text-white">Watch the event flow light up below</p>
              <p className="text-xs text-slate-500">
                {isConsumer
                  ? "Each tool call shows the full identity chain: sub=user_email, act.sub=wlp_xxx (your identity + the agent's identity)."
                  : "Each tool call triggers an XAA token exchange — visible in the event stream."}
              </p>
            </div>
          </li>

        </ol>
      </div>
    </div>
  );
}
