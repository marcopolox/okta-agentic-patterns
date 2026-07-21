"use client";

import { PatternId } from "@/lib/patterns";

interface FlowDiagramProps {
  patternId: PatternId;
  animate?: boolean;
  fill?: boolean;
  mission?: 1 | 2;
}

const diagrams: Record<PatternId, React.ReactNode> = {
  p1: <P1Diagram />,
  p2: <P2Diagram />,
  p3: <P3Diagram />,
  p4: <P4Diagram />,
  p5: <P5Diagram />,
  p6: <P6Diagram />,
  p7: <P7Diagram />,
  p8: <P8Diagram />,
};

export function FlowDiagram({ patternId, animate = false, fill = false, mission = 2 }: FlowDiagramProps) {
  const diagram = patternId === "p6" && mission === 1 ? <P6Mission1Diagram /> : diagrams[patternId];
  return (
    <div
      className={`flex h-full items-center justify-center rounded-xl border border-cyan-500/20 bg-gray-900/80 p-4 neon-card [&_svg]:overflow-visible ${animate ? "neon-border" : ""} ${fill ? "[&_svg]:max-w-none [&_svg]:w-full" : ""}`}
    >
      {diagram}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function Node({
  label,
  sub,
  sub2,
  color = "slate",
  x,
  y,
  tall = false,
}: {
  label: string;
  sub?: string;
  sub2?: string;
  color?: "slate" | "cyan" | "violet" | "emerald" | "amber";
  x: number;
  y: number;
  tall?: boolean;
}) {
  const bg: Record<string, string> = {
    slate: "fill-gray-700",
    cyan: "fill-cyan-900",
    violet: "fill-violet-900",
    emerald: "fill-emerald-900",
    amber: "fill-amber-900",
  };
  const stroke: Record<string, string> = {
    slate: "#4b5563",
    cyan: "#22d3ee",
    violet: "#a855f7",
    emerald: "#10b981",
    amber: "#f59e0b",
  };
  const height = sub2 ? 50 : (tall && sub) ? 56 : sub ? 38 : 36;
  const labelY = sub2 ? -10 : sub ? -3 : 6;
  return (
    <g transform={`translate(${x},${y})`}>
      <rect
        x={-52} y={-18} width={104} height={height} rx={8}
        className={bg[color]}
        stroke={stroke[color]}
        strokeWidth={1}
        opacity={0.95}
      />
      <text textAnchor="middle" y={labelY} fontSize={11} fill="white" fontWeight="600">
        {label}
      </text>
      {sub && (
        <text textAnchor="middle" y={sub2 ? 5 : 14} fontSize={9} fill={stroke[color]} opacity={0.85}>
          {sub}
        </text>
      )}
      {sub2 && (
        <text textAnchor="middle" y={18} fontSize={9} fill={stroke[color]} opacity={0.85}>
          {sub2}
        </text>
      )}
    </g>
  );
}

function Arrow({
  x1, y1, x2, y2, label, color = "#22d3ee",
}: {
  x1: number; y1: number; x2: number; y2: number; label?: string; color?: string;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const markerId = `arrow-${x1}-${y1}-${x2}-${y2}`;
  return (
    <g>
      <defs>
        <marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={color} />
        </marker>
      </defs>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="4 3"
        markerEnd={`url(#${markerId})`}
        opacity={0.85}
        className="flow-line"
      />
      {label && (
        <text x={mx} y={my - 5} textAnchor="middle" fontSize={9} fill={color} opacity={1} fontWeight="500">
          {label}
        </text>
      )}
    </g>
  );
}

function PathArrow({
  d, label, labelX, labelY, color = "#22d3ee", markerId,
}: {
  d: string; label?: string; labelX?: number; labelY?: number; color?: string; markerId: string;
}) {
  return (
    <g>
      <defs>
        <marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={color} />
        </marker>
      </defs>
      <path
        d={d}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="4 3"
        fill="none"
        markerEnd={`url(#${markerId})`}
        opacity={0.85}
        className="flow-line"
      />
      {label && labelX !== undefined && labelY !== undefined && (
        <text x={labelX} y={labelY} textAnchor="middle" fontSize={9} fill={color} opacity={1} fontWeight="500">
          {label}
        </text>
      )}
    </g>
  );
}

// ── Pattern diagrams ──────────────────────────────────────────────────────────

function P1Diagram() {
  const cyan = "#22d3ee";
  const violet = "#a855f7";
  const amber = "#f59e0b";
  const green = "#10b981";
  const dashes = "4 3";
  return (
    <svg viewBox="0 0 580 250" className="w-full max-w-xl">
      <defs>
        <marker id="p1-c" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={cyan} />
        </marker>
        <marker id="p1-v" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={violet} />
        </marker>
        <marker id="p1-g" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={green} />
        </marker>
        <marker id="p1-a" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={amber} />
        </marker>
      </defs>

      <Node label="Claude Code" sub="3rd party agent" color="slate" x={80} y={120} />
      <Node label="MCP Bridge" sub="OAuth · XAA" color="cyan" x={275} y={60} />
      <Node label="Okta" sub="Auth Server" color="amber" x={275} y={210} />
      <Node label="HR Server" sub="MCP resource" color="emerald" x={490} y={60} />
      <Node label="Finance" sub="MCP resource" color="emerald" x={490} y={135} />

      {/* ① Claude Code → MCP Bridge (elbow right then up) */}
      <path d="M 132 115 L 178 115 L 178 60 L 223 60"
        stroke={cyan} strokeWidth={1.5} strokeDasharray={dashes} fill="none"
        markerEnd="url(#p1-c)" opacity={0.85} className="flow-line" />
      <text x={155} y={109} textAnchor="middle" fontSize={9} fill={cyan} fontWeight="500">① MCP call</text>

      {/* ② MCP Bridge → Okta: XAA request (left lane x=268 downward) */}
      <line x1={268} y1={78} x2={268} y2={192}
        stroke={violet} strokeWidth={1.5} strokeDasharray={dashes}
        markerEnd="url(#p1-v)" opacity={0.85} className="flow-line" />
      <text x={259} y={133} textAnchor="end" fontSize={9} fill={violet} fontWeight="500">② XAA</text>

      {/* Okta → MCP Bridge: token (right lane x=282 upward) */}
      <line x1={282} y1={192} x2={282} y2={78}
        stroke={green} strokeWidth={1.5} strokeDasharray={dashes}
        markerEnd="url(#p1-g)" opacity={0.85} className="flow-line" />
      <text x={291} y={148} textAnchor="start" fontSize={9} fill={green} fontWeight="500">token</text>

      {/* ③ MCP Bridge → HR Server: Bearer (horizontal at y=54) */}
      <line x1={327} y1={54} x2={438} y2={54}
        stroke={green} strokeWidth={1.5} strokeDasharray={dashes}
        markerEnd="url(#p1-g)" opacity={0.85} className="flow-line" />
      <text x={383} y={48} textAnchor="middle" fontSize={9} fill={green} fontWeight="500">③ Bearer</text>

      {/* ③ MCP Bridge → Finance: Bearer (elbow right then down) */}
      <path d="M 327 66 L 378 66 L 378 135 L 438 135"
        stroke={green} strokeWidth={1.5} strokeDasharray={dashes} fill="none"
        markerEnd="url(#p1-g)" opacity={0.85} className="flow-line" />
      <text x={398} y={100} textAnchor="start" fontSize={9} fill={green} fontWeight="500">③ Bearer</text>

      {/* ④ HR Server → Okta: JWKS (route via outside Finance right edge) */}
      <path d="M 542 78 L 552 78 L 552 220 L 327 220"
        stroke={amber} strokeWidth={1.5} strokeDasharray={dashes} fill="none"
        markerEnd="url(#p1-a)" opacity={0.85} className="flow-line" />
      <text x={440} y={215} textAnchor="middle" fontSize={9} fill={amber} fontWeight="500">④ JWKS</text>

      {/* ④ Finance → Okta: JWKS (short elbow down then left) */}
      <path d="M 465 153 L 465 192 L 327 192"
        stroke={amber} strokeWidth={1.5} strokeDasharray={dashes} fill="none"
        markerEnd="url(#p1-a)" opacity={0.85} className="flow-line" />
      <text x={473} y={173} textAnchor="start" fontSize={9} fill={amber} fontWeight="500">④ JWKS</text>
    </svg>
  );
}

function P2Diagram() {
  const cyan = "#22d3ee";
  const amber = "#f59e0b";
  const green = "#10b981";
  const violet = "#a855f7";
  const dashes = "4 3";
  // Grid: left col x=75, center col x=250, right col x=420; top row y=80, bottom row y=220
  // User(75,80):         no sub,  h=36, top=62, bottom=98
  // Agent(250,80):       sub+tall, h=56, top=62, bottom=118
  // Adapter(420,80):     sub+tall, h=56, top=62, bottom=118
  // Okta(75,220):        sub,  h=38, top=202, bottom=240
  // Inventory(420,220):  sub,  h=38, top=202, bottom=240
  // 4 arrows Agent↔Adapter at y=70,83,96,109 (within 62–118)
  return (
    <svg viewBox="0 0 510 290" className="w-full max-w-xl">
      <defs>
        <marker id="p2-c" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={cyan} />
        </marker>
        <marker id="p2-g" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={green} />
        </marker>
        <marker id="p2-v" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={violet} />
        </marker>
        <marker id="p2-a" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={amber} />
        </marker>
      </defs>

      <Node label="User" color="slate" x={75} y={80} />
      <Node label="Consumer Agent" sub="3rd Party App" color="cyan" x={250} y={80} tall />
      <Node label="MCP Bridge" sub="DCR · PKCE proxy" color="violet" x={420} y={80} tall />
      <Node label="Okta" sub="Auth Server" color="amber" x={75} y={220} />
      <Node label="Inventory MCP" sub="Resource Server" color="emerald" x={420} y={220} />

      {/* ① chat: User → Consumer Agent */}
      <line x1={127} y1={70} x2={198} y2={70} stroke={cyan} strokeWidth={1.5} strokeDasharray={dashes} opacity={0.85} markerEnd="url(#p2-c)" />
      <text x={163} y={63} textAnchor="middle" fontSize={9} fill={cyan} fontWeight="500">① chat</text>

      {/* ② needs auth: Consumer Agent → User */}
      <line x1={198} y1={84} x2={127} y2={84} stroke={cyan} strokeWidth={1.5} strokeDasharray={dashes} opacity={0.85} markerEnd="url(#p2-c)" />
      <text x={163} y={98} textAnchor="middle" fontSize={9} fill={cyan} fontWeight="500">② needs auth</text>

      {/* ③ DCR: Consumer Agent → MCP Adapter */}
      <line x1={302} y1={70} x2={368} y2={70} stroke={violet} strokeWidth={1.5} strokeDasharray={dashes} opacity={0.85} markerEnd="url(#p2-v)" />
      <text x={335} y={63} textAnchor="middle" fontSize={9} fill={violet} fontWeight="500">③ DCR</text>

      {/* client_id return: MCP Adapter → Consumer Agent */}
      <line x1={368} y1={83} x2={302} y2={83} stroke={violet} strokeWidth={1.5} strokeDasharray={dashes} opacity={0.85} markerEnd="url(#p2-v)" />
      <text x={305} y={79} textAnchor="start" fontSize={9} fill={violet} fontWeight="500">client_id</text>

      {/* ⑥ Bearer: Consumer Agent → MCP Adapter */}
      <line x1={302} y1={96} x2={368} y2={96} stroke={green} strokeWidth={1.5} strokeDasharray={dashes} opacity={0.85} markerEnd="url(#p2-g)" />
      <text x={335} y={89} textAnchor="middle" fontSize={9} fill={green} fontWeight="500">⑥ Bearer</text>

      {/* ⑦ data leg 2: MCP Adapter → Consumer Agent (horizontal) */}
      <line x1={368} y1={109} x2={302} y2={109} stroke={green} strokeWidth={1.5} strokeDasharray={dashes} opacity={0.85} markerEnd="url(#p2-g)" />

      {/* ④ PKCE: User → Okta (vertical) */}
      <line x1={75} y1={98} x2={75} y2={202} stroke={amber} strokeWidth={1.5} strokeDasharray={dashes} opacity={0.85} markerEnd="url(#p2-a)" />
      <text x={87} y={152} textAnchor="start" fontSize={9} fill={amber} fontWeight="500">④ PKCE</text>

      {/* ⑤ access_token: Okta right → elbow → Consumer Agent bottom */}
      <path d="M 127 215 L 225 215 L 225 118" stroke={green} strokeWidth={1.5} strokeDasharray={dashes} opacity={0.85} fill="none" markerEnd="url(#p2-g)" />
      <text x={176} y={208} textAnchor="middle" fontSize={9} fill={green} fontWeight="500">⑤ access_token</text>

      {/* ⑥ fwd: MCP Adapter → Inventory MCP (vertical, right side) */}
      <line x1={432} y1={118} x2={432} y2={202} stroke={green} strokeWidth={1.5} strokeDasharray={dashes} opacity={0.85} markerEnd="url(#p2-g)" />
      <text x={444} y={162} textAnchor="start" fontSize={9} fill={green} fontWeight="500">⑥ fwd</text>

      {/* ⑦ data leg 1: Inventory MCP → MCP Adapter (vertical, left side) */}
      <line x1={412} y1={202} x2={412} y2={118} stroke={green} strokeWidth={1.5} strokeDasharray={dashes} opacity={0.85} markerEnd="url(#p2-g)" />
      <text x={400} y={162} textAnchor="end" fontSize={9} fill={green} fontWeight="500">⑦ data</text>
    </svg>
  );
}

function P3Diagram() {
  const cyan = "#22d3ee";
  const purple = "#a855f7";
  const green = "#10b981";
  const dashes = "4 3";
  return (
    <svg viewBox="0 0 650 280" className="w-full max-w-2xl">
      <defs>
        <marker id="p3-c" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={cyan} />
        </marker>
        <marker id="p3-p" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={purple} />
        </marker>
        <marker id="p3-g" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={green} />
        </marker>
      </defs>

      <Node label="Human User" color="slate" x={80} y={50} />
      <Node label="Okta" sub="Org Server" color="amber" x={330} y={50} />
      <Node label="HR Server" sub="MCP resource" color="emerald" x={80} y={200} />
      <Node label="Finance" sub="MCP resource" color="emerald" x={80} y={265} />
      <Node label="P3 Agent" sub="Okta AI Agent" color="cyan" x={330} y={200} />
      <Node label="Okta" sub="XAA / ID-JAG" sub2="Custom Authz Server" color="amber" x={560} y={200} />

      {/* ① auth code */}
      <Arrow x1={132} y1={50} x2={278} y2={50} label="① auth code" color={cyan} />

      {/* ② id_token: Org Server → Agent (left lane, down) */}
      <line x1={318} y1={68} x2={318} y2={182} stroke={cyan} strokeWidth={1.5} strokeDasharray={dashes} opacity={0.85} markerEnd="url(#p3-c)" />
      <text x={312} y={128} textAnchor="end" fontSize={9} fill={cyan} fontWeight="500">② id_token</text>

      {/* ③ id_token: Agent → Org Server (center lane, up) */}
      <line x1={330} y1={182} x2={330} y2={68} stroke={purple} strokeWidth={1.5} strokeDasharray={dashes} opacity={0.85} markerEnd="url(#p3-p)" />
      <text x={336} y={112} textAnchor="start" fontSize={9} fill={purple} fontWeight="500">③ id_token</text>

      {/* ④ ID-JAG: Org Server → Agent (right lane, down) */}
      <line x1={342} y1={68} x2={342} y2={182} stroke={green} strokeWidth={1.5} strokeDasharray={dashes} opacity={0.85} markerEnd="url(#p3-g)" />
      <text x={348} y={148} textAnchor="start" fontSize={9} fill={green} fontWeight="500">④ ID-JAG</text>

      {/* ⑤ ID-JAG: Agent → Custom Authz */}
      <Arrow x1={382} y1={192} x2={508} y2={192} label="⑤ ID-JAG" color={purple} />

      {/* ⑥ access token: Custom Authz → Agent */}
      <Arrow x1={508} y1={208} x2={382} y2={208} label="⑥ access token" color={green} />

      {/* ⑦ Bearer: Agent → MCP servers */}
      <Arrow x1={278} y1={192} x2={132} y2={200} label="⑦ Bearer" color={green} />
      <Arrow x1={278} y1={210} x2={132} y2={257} label="⑦ Bearer" color={green} />
    </svg>
  );
}

function P4Diagram() {
  const cyan = "#22d3ee";
  const amber = "#f59e0b";
  const green = "#10b981";
  const orange = "#fb923c";
  const dashes = "4 3";
  return (
    <svg viewBox="0 -15 525 315" className="w-full max-w-lg">
      <defs>
        <marker id="p4-c" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={cyan} />
        </marker>
        <marker id="p4-a" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={amber} />
        </marker>
        <marker id="p4-g" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={green} />
        </marker>
        <marker id="p4-o" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={orange} />
        </marker>
      </defs>

      <Node label="Human User" color="slate" x={85} y={55} />
      <Node label="Okta" sub="Org Server" color="amber" x={285} y={55} />
      <Node label="P4 Agent" sub="Okta AI Agent" color="cyan" x={285} y={175} />
      <Node label="Okta STS" sub="Token Broker" color="amber" x={460} y={175} />
      <Node label="SaaS Service" sub="GitHub / Slack" color="emerald" x={285} y={260} />

      {/* ① auth code: User → Okta */}
      <line x1={138} y1={49} x2={233} y2={49}
        stroke={cyan} strokeWidth={1.5} strokeDasharray={dashes}
        markerEnd="url(#p4-c)" opacity={0.85} className="flow-line" />
      <text x={186} y={43} textAnchor="middle" fontSize={9} fill={cyan} fontWeight="500">① auth code</text>

      {/* ② id_token: Okta → Agent (left lane) */}
      <line x1={278} y1={73} x2={278} y2={157}
        stroke={cyan} strokeWidth={1.5} strokeDasharray={dashes}
        markerEnd="url(#p4-c)" opacity={0.85} className="flow-line" />
      <text x={270} y={113} textAnchor="end" fontSize={9} fill={cyan} fontWeight="500">② id_token</text>

      {/* ③ STS exchange: Agent → STS */}
      <line x1={338} y1={163} x2={408} y2={163}
        stroke={amber} strokeWidth={1.5} strokeDasharray={dashes}
        markerEnd="url(#p4-a)" opacity={0.85} className="flow-line" />
      <text x={373} y={157} textAnchor="middle" fontSize={9} fill={amber} fontWeight="500">③ STS exchange</text>

      {/* STS → Agent: interaction_required / needs consent (first time) */}
      <line x1={408} y1={178} x2={338} y2={178}
        stroke={orange} strokeWidth={1.5} strokeDasharray={dashes}
        markerEnd="url(#p4-o)" opacity={0.85} className="flow-line" />
      <text x={373} y={186} textAnchor="middle" fontSize={9} fill={orange} fontWeight="500">needs consent</text>

      {/* User → STS: SaaS OAuth consent (first time, routes via top) */}
      <path d="M 85 37 L 85 -8 L 460 -8 L 460 157"
        stroke={orange} strokeWidth={1.5} strokeDasharray={dashes} fill="none"
        markerEnd="url(#p4-o)" opacity={0.85} className="flow-line" />
      <text x={273} y={-11} textAnchor="middle" fontSize={9} fill={orange} fontWeight="500">SaaS OAuth consent (first time)</text>

      {/* ④ SaaS token: STS → Agent */}
      <line x1={408} y1={194} x2={338} y2={194}
        stroke={green} strokeWidth={1.5} strokeDasharray={dashes}
        markerEnd="url(#p4-g)" opacity={0.85} className="flow-line" />
      <text x={373} y={209} textAnchor="middle" fontSize={9} fill={green} fontWeight="500">④ SaaS token</text>

      {/* ⑤ API call: Agent → SaaS */}
      <line x1={285} y1={213} x2={285} y2={242}
        stroke={green} strokeWidth={1.5} strokeDasharray={dashes}
        markerEnd="url(#p4-g)" opacity={0.85} className="flow-line" />
      <text x={297} y={229} textAnchor="start" fontSize={9} fill={green} fontWeight="500">⑤ API call</text>
    </svg>
  );
}

function P5Diagram() {
  return (
    <svg viewBox="0 0 380 200" className="w-full max-w-sm">
      <Node label="Human User" color="slate" x={60} y={50} />
      <Arrow x1={115} y1={50} x2={185} y2={50} label="PKCE login" color="#22d3ee" />
      <Node label="Okta SSO" sub="GitHub Ent. OIN" color="amber" x={240} y={50} />
      <Arrow x1={240} y1={80} x2={240} y2={120} label="delegated token" color="#10b981" />
      <Node label="AI Agent" sub="acts on behalf" color="cyan" x={240} y={150} />
      <Arrow x1={295} y1={150} x2={335} y2={150} label="GitHub API" color="#10b981" />
      <Node label="GitHub Ent." color="emerald" x={355} y={150} />
    </svg>
  );
}

function P6Mission1Diagram() {
  // Autonomous A2A: no user session — orchestrator gets its own token via CC, then A2A-delegates to workers.
  // Column centers: Slack=65  Orch/OktaCC=215  Workers=390  OktaAS=545  MCP=680
  const violet = "#a855f7";
  const green = "#10b981";
  const amber = "#f59e0b";
  const dashes = "4 3";
  return (
    <svg viewBox="0 0 860 310" className="w-full max-w-3xl">
      <defs>
        <marker id="p6m1-amber" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={amber} />
        </marker>
        <marker id="p6m1-green" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={green} />
        </marker>
        <marker id="p6m1-violet" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={violet} />
        </marker>
      </defs>

      {/* Okta CC — above Orchestrator */}
      <Node label="Okta" sub="CC grant" color="amber" x={225} y={50} />

      {/* Orchestrator */}
      <Node label="P6 Orchestrator" sub="wlp_xxx · autonomous" color="cyan" x={225} y={175} />

      {/* CC request: Orchestrator → Okta (upward, left lane x=218) */}
      <line x1={218} y1={157} x2={218} y2={68}
        stroke={amber} strokeWidth={1.5} strokeDasharray={dashes}
        markerEnd="url(#p6m1-amber)" opacity={0.85} className="flow-line" />
      <text x={210} y={115} textAnchor="end" fontSize={9} fill={amber} fontWeight="500">CC grant</text>

      {/* Token response: Okta → Orchestrator (downward, right lane x=232) */}
      <line x1={232} y1={68} x2={232} y2={157}
        stroke={green} strokeWidth={1.5} strokeDasharray={dashes}
        markerEnd="url(#p6m1-green)" opacity={0.85} className="flow-line" />
      <text x={240} y={130} textAnchor="start" fontSize={9} fill={green} fontWeight="500">access_token</text>

      {/* Workers */}
      <Node label="HR Worker" sub="A2A delegate" color="violet" x={400} y={90} />
      <Node label="Finance Worker" sub="A2A delegate" color="violet" x={400} y={260} />

      {/* Okta auth servers */}
      <Node label="Okta HR" sub="A2A + XAA AS" color="amber" x={595} y={90} />
      <Node label="Okta Finance" sub="A2A + XAA AS" color="amber" x={595} y={260} />

      {/* MCP resource servers */}
      <Node label="HR Server" sub="MCP resource" color="emerald" x={770} y={90} />
      <Node label="Finance Server" sub="MCP resource" color="emerald" x={770} y={260} />

      {/* Slack */}
      <Node label="Slack" sub="bot post" color="violet" x={65} y={285} />

      {/* Orchestrator → HR Worker */}
      <Arrow x1={277} y1={167} x2={348} y2={102} label="A2A token" color={violet} />

      {/* Orchestrator → Finance Worker */}
      <Arrow x1={277} y1={183} x2={348} y2={248} label="A2A token" color={violet} />

      {/* HR Worker → Okta HR */}
      <Arrow x1={452} y1={90} x2={543} y2={90} label="validate+XAA" color={amber} />

      {/* Finance Worker → Okta Finance */}
      <Arrow x1={452} y1={260} x2={543} y2={260} label="validate+XAA" color={amber} />

      {/* Okta HR → HR Server */}
      <Arrow x1={647} y1={90} x2={718} y2={90} label="hr_token" color={green} />

      {/* Okta Finance → Finance Server */}
      <Arrow x1={647} y1={260} x2={718} y2={260} label="fin_token" color={green} />

      {/* Orchestrator → Slack (down to Slack y-center, then left into right side of box) */}
      <path d="M 225 193 L 225 285 L 117 285"
        stroke={violet} strokeWidth={1.5} strokeDasharray={dashes} fill="none"
        markerEnd="url(#p6m1-violet)" opacity={0.85} className="flow-line" />
      <text x={171} y={279} textAnchor="middle" fontSize={9} fill={violet} fontWeight="500">post report</text>
    </svg>
  );
}

function P6Diagram() {
  return (
    <svg viewBox="0 0 670 265" className="w-full max-w-2xl">
      <Node label="Console" sub="user sign-on" color="slate" x={65} y={130} />
      <Node label="P6 Orchestrator" sub="wlp_xxx · user" color="cyan" x={215} y={130} />
      <Node label="HR Worker" sub="A2A delegate" color="violet" x={415} y={65} />
      <Node label="Finance Worker" sub="A2A delegate" color="violet" x={415} y={195} />
      <Node label="HR Server" sub="MCP resource" color="emerald" x={580} y={65} />
      <Node label="Finance" sub="MCP resource" color="emerald" x={580} y={195} />
      <Node label="Slack" sub="bot post" color="violet" x={215} y={248} />
      <Arrow x1={117} y1={130} x2={163} y2={130} label="id_token" color="#22d3ee" />
      <Arrow x1={267} y1={122} x2={363} y2={77} label="A2A" color="#a855f7" />
      <Arrow x1={267} y1={138} x2={363} y2={183} label="A2A" color="#a855f7" />
      <Arrow x1={467} y1={65} x2={528} y2={65} label="hr_token" color="#10b981" />
      <Arrow x1={467} y1={195} x2={528} y2={195} label="fin_token" color="#10b981" />
      <PathArrow
        markerId="p6-slack"
        d="M 215 148 L 215 230"
        label="post"
        labelX={225} labelY={192}
        color="#a855f7"
      />
    </svg>
  );
}

function P7Diagram() {
  return (
    <svg viewBox="0 0 580 310" className="w-full max-w-2xl">
      {/* Top row: Delegation (left), Agent (center), FGA (right) */}
      <Node label="Delegation" sub="UI panel" color="slate" x={65} y={100} />
      <Node label="P7 Agent" sub="XAA + FGA" color="violet" x={250} y={100} />
      <Arrow x1={305} y1={88} x2={398} y2={88} label="check()" color="#f59e0b" />
      <Arrow x1={398} y1={112} x2={305} y2={112} label="allow/deny" color="#f59e0b" />
      <Node label="Okta FGA" sub="delegation store" color="amber" x={450} y={100} tall={true} />
      {/* Delegation → FGA: straight up from Delegation top, across top of diagram, down to FGA top */}
      <PathArrow
        d="M 65 82 L 65 35 L 450 35 L 450 82"
        label="write tuple"
        labelX={258}
        labelY={27}
        color="#64748b"
        markerId="p7-write-tuple"
      />
      {/* Bottom row: User (left), HR/Finance (right) */}
      <Node label="User" sub="PKCE login" color="cyan" x={65} y={240} />
      {/* User → Delegation: vertical arrow going up */}
      <Arrow x1={65} y1={222} x2={65} y2={120} label="toggle ON/OFF" color="#64748b" />
      {/* User → Agent id_token: elbow right then up then right to Agent */}
      <PathArrow
        d="M 117 240 L 185 240 L 185 100 L 198 100"
        label="id_token"
        labelX={151}
        labelY={232}
        color="#22d3ee"
        markerId="p7-id-token"
      />
      {/* Agent → HR/Finance */}
      <Arrow x1={305} y1={118} x2={398} y2={220} label="XAA token" color="#a855f7" />
      <Node label="HR / Finance" sub="MCP server" color="emerald" x={450} y={235} />
    </svg>
  );
}

function P8Diagram() {
  return (
    <svg viewBox="0 0 400 220" className="w-full max-w-sm">
      <Node label="Okta" sub="identity layer" color="cyan" x={70} y={110} />
      <Arrow x1={125} y1={70} x2={195} y2={40} label="XAA / OAuth" color="#22d3ee" />
      <Arrow x1={125} y1={110} x2={195} y2={110} label="XAA / OAuth" color="#a855f7" />
      <Arrow x1={125} y1={150} x2={195} y2={180} label="XAA / OAuth" color="#f59e0b" />
      <Node label="AWS Bedrock" sub="Agents" color="emerald" x={280} y={40} />
      <Node label="Salesforce" sub="Agentforce" color="emerald" x={280} y={110} />
      <Node label="Microsoft" sub="Copilot Studio" color="emerald" x={280} y={180} />
    </svg>
  );
}
