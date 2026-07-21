import { NextRequest, NextResponse } from "next/server";
import { readSettings, writeSettings, MenuLink } from "@/lib/settings";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readSettings());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, link } = body as {
    action: "add" | "delete" | "reorder" | "update";
    link?: { title: string; url: string };
    id?: string;
    links?: MenuLink[];
  };

  const settings = readSettings();

  if (action === "update" && body.id && link) {
    const title = String(link.title).trim();
    const url = String(link.url).trim();
    if (!title || !url) {
      return NextResponse.json({ error: "title and url are required" }, { status: 400 });
    }
    settings.menuLinks = settings.menuLinks.map((l) =>
      l.id === body.id ? { ...l, title, url } : l
    );
  } else if (action === "add" && link) {
    const title = String(link.title).trim();
    const url = String(link.url).trim();
    if (!title || !url) {
      return NextResponse.json({ error: "title and url are required" }, { status: 400 });
    }
    settings.menuLinks.push({ id: randomUUID(), title, url });
  } else if (action === "delete" && body.id) {
    settings.menuLinks = settings.menuLinks.filter((l) => l.id !== body.id);
  } else if (action === "reorder" && body.links) {
    settings.menuLinks = body.links;
  } else {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  writeSettings(settings);
  return NextResponse.json(settings);
}
