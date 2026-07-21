# Console (Next.js)

The shared demo UI for all 7 Okta agentic identity patterns. Runs on port 3020.

See the [root README](../README.md) for full setup and run instructions.

## Local development

```bash
cd console
npm install
npm run dev   # → http://localhost:3020
```

The console reads from the root `.env` file (via Docker Compose). For standalone dev, copy the relevant env vars into `console/.env.local`.
