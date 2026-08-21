"use client";

import { useState } from "react";
import { useDemoCredentials } from "@/lib/demo-settings";

export default function ApiKeyGate({ children }: { children: React.ReactNode }) {
  if (typeof window === "undefined") return <>{children}</>;

  return <ApiKeyGateInner>{children}</ApiKeyGateInner>;
}

function ApiKeyGateInner({ children }: { children: React.ReactNode }) {
  const { hasApiKey, creds, setCreds, loaded } = useDemoCredentials();
  const [provider, setProvider] = useState<"anthropic" | "openai" | "litellm">("anthropic");
  const [inputValue, setInputValue] = useState("");
  const [baseUrlValue, setBaseUrlValue] = useState("");
  const [modelValue, setModelValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    if (provider === "litellm" && !baseUrlValue.trim()) return;
    setCreds({
      ...creds,
      provider,
      ...(provider === "anthropic" && { anthropicKey: inputValue.trim() }),
      ...(provider === "openai" && { openaiKey: inputValue.trim() }),
      ...(provider === "litellm" && {
        litellmKey: inputValue.trim(),
        litellmBaseUrl: baseUrlValue.trim(),
        litellmModel: modelValue.trim(),
      }),
    });
  };

  if (!loaded || hasApiKey) return <>{children}</>;

  return (
    <>
      {children}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gray-900 p-8 shadow-2xl">
          <h2 className="mb-1 text-xl font-semibold text-white">Enter your AI API Key</h2>
          <p className="mb-6 text-sm text-gray-400">Required to run the agentic patterns demo.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              <button
                type="button"
                onClick={() => setProvider("anthropic")}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  provider === "anthropic"
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Anthropic
              </button>
              <button
                type="button"
                onClick={() => setProvider("openai")}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  provider === "openai"
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                OpenAI
              </button>
              <button
                type="button"
                onClick={() => setProvider("litellm")}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  provider === "litellm"
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                LiteLLM
              </button>
            </div>

            {provider === "litellm" && (
              <div>
                <label className="mb-1.5 block text-sm text-gray-300">LiteLLM Base URL</label>
                <input
                  type="text"
                  value={baseUrlValue}
                  onChange={(e) => setBaseUrlValue(e.target.value)}
                  placeholder="https://your-litellm-proxy.example.com"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-white/30 focus:ring-0"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm text-gray-300">
                {provider === "anthropic" ? "Anthropic API Key" : provider === "openai" ? "OpenAI API Key" : "LiteLLM API Key"}
              </label>
              <input
                type="password"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={provider === "anthropic" ? "sk-ant-…" : "sk-…"}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-white/30 focus:ring-0"
                autoFocus
              />
            </div>

            {provider === "litellm" && (
              <div>
                <label className="mb-1.5 block text-sm text-gray-300">Model / Alias (optional)</label>
                <input
                  type="text"
                  value={modelValue}
                  onChange={(e) => setModelValue(e.target.value)}
                  placeholder="e.g. gpt-4o, or a LiteLLM router alias"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-white/30 focus:ring-0"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={!inputValue.trim() || (provider === "litellm" && !baseUrlValue.trim())}
              className="w-full rounded-lg bg-white py-2 text-sm font-semibold text-gray-900 transition-opacity disabled:opacity-40"
            >
              Continue
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-gray-500">
            Key is stored in this browser tab only and cleared when you close it.
          </p>
        </div>
      </div>
    </>
  );
}
