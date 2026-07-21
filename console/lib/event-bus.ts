export interface DemoEvent {
  id: string;
  patternId: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  detail?: string;
  tokenSnippet?: string;
  token?: string;
  level: "info" | "auth" | "token" | "error" | "separator";
}

export function subscribeToEvents(
  patternId: string,
  onEvent: (event: DemoEvent) => void,
  onClear?: () => void,
  onError?: (err: Event) => void
): () => void {
  const url = `/api/events/${patternId}`;
  const es = new EventSource(url);

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as DemoEvent & { type?: string };
      if (data.type === "clear") {
        onClear?.();
      } else {
        onEvent(data);
      }
    } catch {
      // ignore malformed events
    }
  };

  if (onError) es.onerror = onError;

  return () => es.close();
}

export async function checkPatternHealth(agentUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${agentUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
