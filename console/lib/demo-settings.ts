"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "okta-demo-credentials";

export interface DemoCredentials {
  provider: "anthropic" | "openai";
  anthropicKey: string;
  openaiKey: string;
  slackToken: string;
  slackChannel: string;
}

const DEFAULTS: DemoCredentials = {
  provider: "anthropic",
  anthropicKey: "",
  openaiKey: "",
  slackToken: "",
  slackChannel: "",
};

function load(): DemoCredentials {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function save(creds: DemoCredentials): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  } catch {
    // sessionStorage unavailable
  }
}

export function useDemoCredentials() {
  const [creds, setCredsState] = useState<DemoCredentials>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setCredsState(load());
    setLoaded(true);
  }, []);

  const setCreds = useCallback((next: DemoCredentials) => {
    save(next);
    setCredsState(next);
  }, []);

  const credentialHeaders = loaded
    ? {
        ...(creds.provider === "anthropic" && creds.anthropicKey
          ? { "X-LLM-Api-Key": creds.anthropicKey, "X-LLM-Provider": "anthropic" }
          : {}),
        ...(creds.provider === "openai" && creds.openaiKey
          ? { "X-LLM-Api-Key": creds.openaiKey, "X-LLM-Provider": "openai" }
          : {}),
        ...(creds.slackToken ? { "X-Slack-Token": creds.slackToken } : {}),
        ...(creds.slackChannel ? { "X-Slack-Channel": creds.slackChannel } : {}),
      }
    : {};

  const hasApiKey = loaded
    ? (creds.provider === "anthropic" && !!creds.anthropicKey) ||
      (creds.provider === "openai" && !!creds.openaiKey)
    : false;

  return { creds, setCreds, credentialHeaders, hasApiKey, loaded };
}
