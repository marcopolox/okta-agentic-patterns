import Link from "next/link";
import Image from "next/image";
import { Settings, ExternalLink } from "lucide-react";
import { readSettings } from "@/lib/settings";
import FooterBar from "@/components/FooterBar";

export default function TopBar() {
  const { menuLinks } = readSettings();

  return (
    <div className="sticky top-0 z-50 relative flex w-full items-center justify-between px-5 py-2 border-b border-white/5 bg-[var(--background)]/90 backdrop-blur-sm">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/logo-mark.svg" alt="" width={22} height={22} priority />
        <span className="text-xs font-semibold tracking-wide whitespace-nowrap">
          <span className="text-cyan-300">Okta Agentic</span>{" "}
          <span className="text-purple-300">Patterns</span>
        </span>
      </Link>

      <div className="absolute left-1/2 -translate-x-1/2">
        <FooterBar />
      </div>

      <div className="flex items-center gap-2">
        {menuLinks.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-medium text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors"
          >
            <ExternalLink size={9} />
            {link.title}
          </a>
        ))}
        <Link
          href="/settings"
          className="rounded p-1 text-white/20 hover:text-cyan-400 transition-colors"
          title="Settings"
        >
          <Settings size={13} />
        </Link>
      </div>
    </div>
  );
}
