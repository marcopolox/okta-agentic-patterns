import express, { Request, Response } from "express";

const app = express();
app.use(express.json());

const SHARED_SESSION = "_shared";
const key = (patternId: string, sessionId: string) => `${patternId}:${sessionId}`;

// composite "patternId:sessionId" → Set of SSE response objects
const subscribers = new Map<string, Set<Response>>();

// patternId → set of sessionIds currently subscribed (used to fan out session-less events)
const patternSessions = new Map<string, Set<string>>();

// composite "patternId:sessionId" → recent events (last 100, replayed to new subscribers)
const BUFFER_SIZE = 100;
const recentEvents = new Map<string, object[]>();

// patternId → recent session-less events (e.g. from the P1 adapter, which isn't session-aware)
const sharedRecentEvents = new Map<string, object[]>();

function bufferEvent(map: Map<string, object[]>, mapKey: string, event: object) {
  if (!map.has(mapKey)) map.set(mapKey, []);
  const buf = map.get(mapKey)!;
  buf.push(event);
  if (buf.length > BUFFER_SIZE) buf.shift();
}

// POST /emit — pattern services push events here
// Body: { patternId, actor, action, target, detail?, tokenSnippet?, level?, sessionId?, callId? }
app.post("/emit", (req: Request, res: Response) => {
  const { patternId, actor, action, target, detail, tokenSnippet, token, level, sessionId, callId } = req.body as {
    patternId: string;
    actor: string;
    action: string;
    target: string;
    detail?: string;
    tokenSnippet?: string;
    token?: string;
    level?: "info" | "auth" | "token" | "error";
    sessionId?: string;
    callId?: string;
  };

  if (!patternId || !actor || !action || !target) {
    res.status(400).json({ error: "patternId, actor, action, target are required" });
    return;
  }

  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    patternId,
    timestamp: new Date().toISOString(),
    actor,
    action,
    target,
    ...(detail !== undefined && { detail }),
    ...(tokenSnippet !== undefined && { tokenSnippet }),
    ...(token !== undefined && { token }),
    ...(callId !== undefined && { callId }),
    level: level ?? "info",
  };

  const data = `data: ${JSON.stringify(event)}\n\n`;
  let delivered = 0;

  if (sessionId) {
    bufferEvent(recentEvents, key(patternId, sessionId), event);
    const subs = subscribers.get(key(patternId, sessionId));
    if (subs) {
      for (const client of subs) {
        try { client.write(data); delivered++; } catch { /* cleaned up on close */ }
      }
    }
  } else {
    // Session-less event (e.g. P1 adapter, agent startup ping) — fan out to every
    // session currently subscribed to this pattern.
    bufferEvent(sharedRecentEvents, patternId, event);
    for (const sid of patternSessions.get(patternId) ?? []) {
      const subs = subscribers.get(key(patternId, sid));
      if (subs) {
        for (const client of subs) {
          try { client.write(data); delivered++; } catch { /* cleaned up on close */ }
        }
      }
    }
  }

  res.json({ ok: true, delivered });
});

// GET /events/:patternId?sessionId=... — console subscribes here via SSE
app.get("/events/:patternId", (req: Request, res: Response) => {
  const { patternId } = req.params;
  const sessionId = String(req.query.sessionId ?? SHARED_SESSION);
  const compositeKey = key(patternId, sessionId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Send a heartbeat comment every 15s to keep the connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 15_000);

  if (!subscribers.has(compositeKey)) {
    subscribers.set(compositeKey, new Set());
  }
  subscribers.get(compositeKey)!.add(res);

  if (!patternSessions.has(patternId)) {
    patternSessions.set(patternId, new Set());
  }
  patternSessions.get(patternId)!.add(sessionId);

  // Replay buffered events (pattern-wide session-less events, then this session's own)
  // so reconnecting clients see what they missed, in the order they occurred.
  const buffered = [
    ...(sharedRecentEvents.get(patternId) ?? []),
    ...(recentEvents.get(compositeKey) ?? []),
  ].sort((a, b) => String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)));
  for (const ev of buffered) {
    try {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    } catch { /* ignore */ }
  }

  req.on("close", () => {
    clearInterval(heartbeat);
    const subs = subscribers.get(compositeKey);
    subs?.delete(res);
    if (subs?.size === 0) {
      subscribers.delete(compositeKey);
      patternSessions.get(patternId)?.delete(sessionId);
      if (patternSessions.get(patternId)?.size === 0) {
        patternSessions.delete(patternId);
      }
    }
  });
});

// DELETE /events/:patternId?sessionId=... — clear this session's buffer for this pattern
// and notify only this session's own subscribers. Must not touch other sessions' buffers
// or the pattern-wide session-less buffer, both of which are shared across viewers.
app.delete("/events/:patternId", (req: Request, res: Response) => {
  const { patternId } = req.params;
  const sessionId = String(req.query.sessionId ?? SHARED_SESSION);
  const compositeKey = key(patternId, sessionId);

  recentEvents.delete(compositeKey);

  const data = `data: ${JSON.stringify({ type: "clear" })}\n\n`;
  const subs = subscribers.get(compositeKey);
  if (subs) {
    for (const client of subs) {
      try { client.write(data); } catch { /* disconnected */ }
    }
  }
  res.json({ ok: true });
});

// GET /health — used by console and docker healthcheck
app.get("/health", (_req: Request, res: Response) => {
  const bySession: Record<string, number> = {};
  for (const [k, v] of subscribers.entries()) bySession[k] = v.size;
  res.json({ ok: true, subscribers: bySession });
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`event-bus listening on :${PORT}`);
});
