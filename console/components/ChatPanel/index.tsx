"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles, Trash2, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDemoCredentials } from "@/lib/demo-settings";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface PresetGroup {
  label: string;
  prompts: string[];
}

interface ChatPanelProps {
  agentUrl: string;
  patternId: string;
  disabled?: boolean;
  disabledReason?: string;
  presetPrompts?: string[];
  presetGroups?: PresetGroup[];
  userToken?: string;
  onMessageSent?: () => void;
  preserveSessionOnNavigation?: boolean;
  authStatus?: React.ReactNode;
}

export function ChatPanel({
  agentUrl,
  patternId,
  disabled = false,
  disabledReason,
  presetPrompts,
  presetGroups,
  userToken,
  onMessageSent,
  preserveSessionOnNavigation = false,
  authStatus,
}: ChatPanelProps) {
  const { credentialHeaders } = useDemoCredentials();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const sessionId = useRef(`${patternId}-${Date.now()}`);
  const bottomRef = useRef<HTMLDivElement>(null);
  const presetsRef = useRef<HTMLDivElement>(null);
  const greeted = useRef(false);
  const hasRestoredMessages = useRef(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) {
        setShowPresets(false);
      }
    }
    if (showPresets) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPresets]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Restore conversation state after OAuth redirect (for P2 inline-auth flow)
  useEffect(() => {
    if (!preserveSessionOnNavigation) return;
    const savedMessages = sessionStorage.getItem(`${patternId}_messages`);
    const savedSessionId = sessionStorage.getItem(`${patternId}_session_id`);
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages) as Message[]);
        hasRestoredMessages.current = true;
      } catch { /* ignore */ }
      sessionStorage.removeItem(`${patternId}_messages`);
    }
    if (savedSessionId) {
      sessionId.current = savedSessionId;
      sessionStorage.removeItem(`${patternId}_session_id`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (userToken && !greeted.current && !disabled) {
      greeted.current = true;
      // Post-OAuth redirect: restored conversation exists → auto-send the pending question
      if (hasRestoredMessages.current) {
        const pending = sessionStorage.getItem(`${patternId}_pending`);
        if (pending) {
          sessionStorage.removeItem(`${patternId}_pending`);
          sendText(pending);
        }
        return;
      }
      try {
        const b64 = userToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const claims = JSON.parse(atob(b64)) as Record<string, unknown>;
        const name = (claims.name ?? claims.email ?? "there") as string;
        setMessages([{ role: "assistant", content: `Hi ${name}! How can I help you today?` }]);
      } catch {
        setMessages([{ role: "assistant", content: "Hi! How can I help you today?" }]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userToken, disabled]);

  async function sendText(text: string) {
    if (!text || loading || disabled) return;
    onMessageSent?.();
    setInput("");
    // Add user message + empty assistant placeholder immediately so the thinking
    // indicator appears before the fetch even resolves.
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setLoading(true);

    try {
      const res = await fetch(`/api/chat/${patternId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
          ...credentialHeaders,
        },
        body: JSON.stringify({ message: text, session_id: sessionId.current }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: accumulated };
          return updated;
        });
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Unknown error"}` };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    await sendText(input.trim());
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-700/50 bg-gray-800/60 neon-card">
      <div className="flex items-center justify-between border-b border-gray-700/50 px-4 py-2">
        <span className="text-xs font-semibold tracking-wider text-cyan-400 uppercase neon-text">
          Agent Chat
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600">{messages.length} messages</span>
          <button
            onClick={() => {
              setMessages([]);
              sessionId.current = `${patternId}-${Date.now()}`;
              greeted.current = false;
              hasRestoredMessages.current = false;
              if (preserveSessionOnNavigation) {
                sessionStorage.removeItem(`${patternId}_messages`);
                sessionStorage.removeItem(`${patternId}_session_id`);
                sessionStorage.removeItem(`${patternId}_pending`);
              }
            }}
            disabled={messages.length === 0}
            className="flex items-center gap-1 rounded border border-gray-700/50 px-2 py-0.5 text-[11px] text-slate-500 transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Trash2 size={10} />
            Clear
          </button>
        </div>
      </div>

      {authStatus && (
        <div className="shrink-0 border-b border-gray-700/50 px-4 py-2">
          {authStatus}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && !disabled && (
          <p className="mt-4 text-center text-sm text-slate-600">
            Send a message to trigger the auth flow
          </p>
        )}
        {disabled && (
          <p className="mt-4 text-center text-sm text-slate-600">
            {disabledReason ?? "Pattern not active"}
          </p>
        )}
        {messages.map((msg, i) => {
          const isLastMsg = i === messages.length - 1;
          return (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300">
                <Bot size={14} />
              </div>
            )}
            <div
              className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "max-w-[80%] bg-cyan-500/20 text-cyan-100 border border-cyan-500/40"
                  : "w-full bg-gray-700/50 text-slate-200"
              }`}
            >
              {msg.content ? (
                msg.role === "assistant" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: (props) => <div className="overflow-x-auto my-1"><table className="w-full border-collapse text-xs" {...props} /></div>,
                      thead: (props) => <thead className="border-b border-gray-600" {...props} />,
                      th: (props) => <th className="px-2 py-1 text-left text-slate-400 font-semibold" {...props} />,
                      td: (props) => <td className="px-2 py-1 border-b border-gray-700/50 text-slate-300" {...props} />,
                      strong: (props) => <strong className="text-slate-100 font-semibold" {...props} />,
                      ul: (props) => <ul className="list-disc list-inside space-y-0.5 my-1" {...props} />,
                      li: (props) => <li className="text-slate-300" {...props} />,
                      p: (props) => <p className="mb-1 last:mb-0" {...props} />,
                      a: ({ href, children }) => {
                        const isRelative = href && !href.startsWith("http");
                        if (isRelative && preserveSessionOnNavigation) {
                          return (
                            <a
                              href={href}
                              onClick={(e) => {
                                e.preventDefault();
                                sessionStorage.setItem(`${patternId}_messages`, JSON.stringify(messages));
                                sessionStorage.setItem(`${patternId}_session_id`, sessionId.current);
                                const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                                if (lastUserMsg) sessionStorage.setItem(`${patternId}_pending`, lastUserMsg.content);
                                window.location.href = href!;
                              }}
                              className="text-cyan-400 underline hover:text-cyan-300 cursor-pointer"
                            >
                              {children}
                            </a>
                          );
                        }
                        return <a href={href} target={isRelative ? "_self" : "_blank"} rel={!isRelative ? "noopener noreferrer" : undefined} className="text-blue-400 underline hover:text-blue-300">{children}</a>;
                      },
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : msg.content
              ) : (loading && isLastMsg) ? (
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 size={12} className="animate-spin text-cyan-500/70" />
                  <span>Thinking</span>
                  <span className="flex gap-0.5">
                    <span className="animate-bounce [animation-delay:0ms]">.</span>
                    <span className="animate-bounce [animation-delay:150ms]">.</span>
                    <span className="animate-bounce [animation-delay:300ms]">.</span>
                  </span>
                </span>
              ) : null}
            </div>
            {msg.role === "user" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-300">
                <User size={14} />
              </div>
            )}
          </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700/50 p-3">
        <div className="relative flex gap-2" ref={presetsRef}>
          {/* Preset prompts dropdown */}
          {showPresets && (presetGroups?.length || presetPrompts?.length) ? (
            <div className="absolute bottom-full left-0 mb-2 w-80 rounded-xl border border-cyan-500/30 bg-gray-900 shadow-xl z-10 overflow-hidden">
              {presetGroups ? (
                presetGroups.map((group, gi) => (
                  <div key={group.label}>
                    {gi > 0 && <div className="mx-3 border-t border-gray-700/60" />}
                    <div className="px-4 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {group.label}
                    </div>
                    {group.prompts.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => { sendText(prompt); setShowPresets(false); }}
                        className="block w-full px-4 py-2 text-left text-xs text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-300 transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                ))
              ) : (
                presetPrompts!.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => { sendText(prompt); setShowPresets(false); }}
                    className="block w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-300 first:rounded-t-xl last:rounded-b-xl transition-colors"
                  >
                    {prompt}
                  </button>
                ))
              )}
            </div>
          ) : null}

          {(presetGroups?.length || presetPrompts?.length) && (
            <button
              onClick={() => setShowPresets((v) => !v)}
              disabled={disabled}
              title="Preset prompts"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:opacity-40 ${
                showPresets
                  ? "border-cyan-500/60 bg-cyan-500/30 text-cyan-200"
                  : "border-cyan-500/40 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
              }`}
            >
              <Sparkles size={14} />
            </button>
          )}

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={disabled ? "Pattern not active" : "Ask the agent…"}
            disabled={disabled || loading}
            className="flex-1 rounded-lg bg-gray-700/50 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-40"
          />
          <button
            onClick={send}
            disabled={disabled || loading || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 neon-btn disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
