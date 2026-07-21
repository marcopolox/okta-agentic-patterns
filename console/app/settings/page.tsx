"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Settings, ExternalLink, Pencil, Check, X, Eye, EyeOff } from "lucide-react";
import type { MenuLink } from "@/lib/settings";
import { useDemoCredentials } from "@/lib/demo-settings";
import { IndustrySwitcher } from "@/components/IndustrySwitcher";
import { VisualThemeSwitcher } from "@/components/VisualThemeSwitcher";
import type { IndustryId } from "@/lib/industries";
import { DEFAULT_INDUSTRY_ID } from "@/lib/industries";
import type { VisualThemeId } from "@/lib/ui-themes";
import { DEFAULT_UI_THEME_ID } from "@/lib/ui-themes";

interface EditState {
  id: string;
  title: string;
  url: string;
}

export default function SettingsPage() {
  const [links, setLinks] = useState<MenuLink[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [addError, setAddError] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [editError, setEditError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [industryId, setIndustryId] = useState<IndustryId>(DEFAULT_INDUSTRY_ID);
  const [uiThemeId, setUiThemeId] = useState<VisualThemeId>(DEFAULT_UI_THEME_ID);

  const { creds, setCreds, loaded: credsLoaded } = useDemoCredentials();
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setLinks(data.menuLinks ?? []));
    fetch("/api/industry")
      .then((r) => r.json())
      .then((data) => { if (data.industryId) setIndustryId(data.industryId as IndustryId); });
    fetch("/api/ui-theme")
      .then((r) => r.json())
      .then((data) => { if (data.uiThemeId) setUiThemeId(data.uiThemeId as VisualThemeId); });
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!newTitle.trim() || !newUrl.trim()) {
      setAddError("Both label and URL are required.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", link: { title: newTitle, url: newUrl } }),
      });
      const data = await res.json();
      if (res.ok) {
        setLinks(data.menuLinks);
        setNewTitle("");
        setNewUrl("");
      } else {
        setAddError(data.error ?? "Failed to add link.");
      }
    });
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setEditError("");
    if (!editing.title.trim() || !editing.url.trim()) {
      setEditError("Both label and URL are required.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: editing.id, link: { title: editing.title, url: editing.url } }),
      });
      const data = await res.json();
      if (res.ok) {
        setLinks(data.menuLinks);
        setEditing(null);
      } else {
        setEditError(data.error ?? "Failed to save.");
      }
    });
  }

  async function handleDelete(id: string) {
    startTransition(async () => {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (res.ok) {
        const data = await res.json();
        setLinks(data.menuLinks);
        if (editing?.id === id) setEditing(null);
      }
    });
  }

  const inputCls = "flex-1 min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30";

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-2xl">
        {/* Back link */}
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to demo
        </Link>

        {/* Page header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
            <Settings size={18} className="text-cyan-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Settings</h1>
            <p className="text-sm text-slate-400">Configure the demo console</p>
          </div>
        </div>

        {/* LLM Credentials section */}
        <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="mb-1 text-base font-semibold text-white">LLM Credentials</h2>
          <p className="mb-4 text-sm text-slate-400">
            Stored in <code className="text-cyan-300">sessionStorage</code> only — cleared when you close this tab. Never sent to any server except your chosen LLM provider.
          </p>

          {/* Provider toggle */}
          <div className="mb-4 flex gap-2">
            {(["anthropic", "openai"] as const).map((p) => (
              <button
                key={p}
                disabled={!credsLoaded}
                onClick={() => setCreds({ ...creds, provider: p })}
                className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
                  creds.provider === p
                    ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
                    : "border-white/10 text-slate-400 hover:text-white"
                }`}
              >
                {p === "anthropic" ? "Anthropic" : "OpenAI"}
              </button>
            ))}
          </div>

          {/* API key input */}
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              {creds.provider === "anthropic" ? "Anthropic API Key" : "OpenAI API Key"}
            </label>
            <div className="flex gap-2">
              <input
                type={showKey ? "text" : "password"}
                disabled={!credsLoaded}
                placeholder={creds.provider === "anthropic" ? "sk-ant-…" : "sk-…"}
                value={creds.provider === "anthropic" ? creds.anthropicKey : creds.openaiKey}
                onChange={(e) =>
                  setCreds({
                    ...creds,
                    ...(creds.provider === "anthropic"
                      ? { anthropicKey: e.target.value }
                      : { openaiKey: e.target.value }),
                  })
                }
                className={inputCls}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                className="rounded-lg border border-white/10 p-2 text-slate-400 hover:text-white transition-colors"
                title={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Slack token + channel */}
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Slack Bot Token (optional — P4 / P6)</label>
            <input
              type="password"
              disabled={!credsLoaded}
              placeholder="xoxb-…"
              value={creds.slackToken}
              onChange={(e) => setCreds({ ...creds, slackToken: e.target.value })}
              className={inputCls}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Slack Channel (optional — P6)</label>
            <input
              type="text"
              disabled={!credsLoaded}
              placeholder="demo-reports"
              value={creds.slackChannel}
              onChange={(e) => setCreds({ ...creds, slackChannel: e.target.value })}
              className={inputCls}
              autoComplete="off"
            />
          </div>
        </section>

        {/* Industry Customization section */}
        <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="mb-1 text-base font-semibold text-white">Industry Customization</h2>
          <p className="mb-4 text-sm text-slate-400">
            Switch the console to a different industry vertical. Changes the color scheme and mock data returned by the MCP servers.
          </p>
          <IndustrySwitcher currentIndustryId={industryId} />
        </section>

        {/* Visual Theme section */}
        <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="mb-1 text-base font-semibold text-white">Visual Theme</h2>
          <p className="mb-4 text-sm text-slate-400">
            Change the overall look and feel of the console UI.
          </p>
          <VisualThemeSwitcher currentUiThemeId={uiThemeId} />
        </section>

        {/* Menu Links section */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="mb-1 text-base font-semibold text-white">Custom Menu Links</h2>
          <p className="mb-6 text-sm text-slate-400">
            Links added here appear in the top bar on every page.
          </p>

          {/* Add form */}
          <form onSubmit={handleAdd} className="mb-6 flex flex-col gap-3">
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Label (e.g. Okta Admin)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className={inputCls}
              />
              <input
                type="url"
                placeholder="URL (https://…)"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className={inputCls}
              />
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
            {addError && <p className="text-xs text-red-400">{addError}</p>}
          </form>

          {/* Links list */}
          {links.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 py-6 text-center text-sm text-slate-500">
              No links yet. Add one above.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {links.map((link) =>
                editing?.id === link.id ? (
                  /* ── Edit row ── */
                  <li key={link.id} className="flex flex-col gap-2 rounded-lg border border-cyan-500/30 bg-white/[0.04] px-4 py-3">
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={editing.title}
                        onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                        className={inputCls}
                        placeholder="Label"
                      />
                      <input
                        type="url"
                        value={editing.url}
                        onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                        className={inputCls}
                        placeholder="URL (https://…)"
                      />
                      <button
                        onClick={handleSaveEdit}
                        disabled={isPending}
                        className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-2 text-cyan-300 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
                        title="Save"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => { setEditing(null); setEditError(""); }}
                        disabled={isPending}
                        className="rounded-lg border border-white/10 p-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {editError && <p className="text-xs text-red-400">{editError}</p>}
                  </li>
                ) : (
                  /* ── View row ── */
                  <li
                    key={link.id}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3"
                  >
                    <ExternalLink size={14} className="shrink-0 text-slate-500" />
                    <span className="flex-1 truncate text-sm font-medium text-white">
                      {link.title}
                    </span>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="max-w-[220px] truncate text-xs text-slate-400 hover:text-cyan-400 transition-colors"
                    >
                      {link.url}
                    </a>
                    <button
                      onClick={() => { setEditing({ id: link.id, title: link.title, url: link.url }); setEditError(""); }}
                      disabled={isPending}
                      className="ml-1 rounded p-1 text-slate-500 hover:text-cyan-400 transition-colors disabled:opacity-50"
                      aria-label={`Edit ${link.title}`}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(link.id)}
                      disabled={isPending}
                      className="rounded p-1 text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
                      aria-label={`Delete ${link.title}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                )
              )}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
