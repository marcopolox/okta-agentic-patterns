import { useMemo } from "react";

interface TokenClaimsProps {
  token: string;
  className?: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, b64] = token.split(".");
    return JSON.parse(atob(b64.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export function TokenClaims({ token, className }: TokenClaimsProps) {
  const payload = useMemo(() => decodeJwtPayload(token), [token]);
  const jwtIoUrl = `https://jwt.io/#token=${token}`;
  const tokenPreview = token.length > 40 ? `${token.slice(0, 20)}…${token.slice(-8)}` : token;

  if (!payload) {
    return (
      <div className={`rounded border border-emerald-500/20 bg-gray-950/80 px-3 py-2 font-mono text-[11px] leading-5 ${className ?? ""}`}>
        <div className="flex gap-2">
          <span className="w-10 shrink-0 text-slate-600">type</span>
          <span className="text-slate-500">opaque token</span>
        </div>
        <div className="mt-1.5 border-t border-emerald-500/10 pt-1.5 truncate text-emerald-400">
          {tokenPreview}
        </div>
      </div>
    );
  }

  const iss = typeof payload.iss === "string"
    ? payload.iss.replace(/^https?:\/\//, "")
    : null;
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  const name = typeof payload.name === "string" ? payload.name : null;
  const email = typeof payload.email === "string" ? payload.email : null;
  const cid = typeof payload.cid === "string" ? payload.cid : null;
  const aud = payload.aud
    ? Array.isArray(payload.aud) ? payload.aud.join(", ") : String(payload.aud)
    : null;
  const scopes: string[] = Array.isArray(payload.scp)
    ? (payload.scp as string[])
    : typeof payload.scp === "string" ? payload.scp.split(" ")
    : typeof payload.scope === "string" ? payload.scope.split(" ")
    : [];
  const act = payload.act && typeof payload.act === "object"
    ? (payload.act as Record<string, unknown>)
    : null;
  const exp = typeof payload.exp === "number" ? payload.exp : null;

  const rows = [
    iss && { label: "iss", value: iss, color: "text-slate-300" },
    sub && { label: "sub", value: sub, color: "text-slate-300" },
    name && { label: "name", value: name, color: "text-cyan-300" },
    email && { label: "email", value: email, color: "text-cyan-300" },
    cid && cid !== sub && { label: "cid", value: cid, color: "text-slate-300" },
    aud && { label: "aud", value: aud, color: "text-slate-300" },
    exp && { label: "exp", value: new Date(exp * 1000).toLocaleTimeString(), color: "text-slate-400" },
  ].filter(Boolean) as { label: string; value: string; color: string }[];

  return (
    <div className={`rounded border border-emerald-500/20 bg-gray-950/80 px-3 py-2 font-mono text-[11px] leading-5 ${className ?? ""}`}>
      {rows.map(({ label, value, color }) => (
        <div key={label} className="flex gap-2">
          <span className="w-10 shrink-0 text-slate-600">{label}</span>
          <span className={`truncate ${color}`}>{value}</span>
        </div>
      ))}
      {scopes.length > 0 && (
        <div className="flex gap-2">
          <span className="w-10 shrink-0 text-slate-600">scp</span>
          <div className="flex flex-wrap gap-1">
            {scopes.map((s) => (
              <span key={s} className="rounded bg-cyan-500/15 px-1.5 text-cyan-300">{s}</span>
            ))}
          </div>
        </div>
      )}
      {act && (
        <div className="flex gap-2">
          <span className="w-10 shrink-0 text-slate-600">act</span>
          <span className="text-amber-300 break-all">{JSON.stringify(act)}</span>
        </div>
      )}
      <div className="mt-1.5 border-t border-emerald-500/10 pt-1.5">
        <a
          href={jwtIoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-600 hover:text-emerald-400 transition-colors"
          title={token}
        >
          {tokenPreview}
        </a>
      </div>
    </div>
  );
}
