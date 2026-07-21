import fs from "fs";
import path from "path";

export interface MenuLink {
  id: string;
  title: string;
  url: string;
}

export interface AppSettings {
  menuLinks: MenuLink[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

const DEFAULT_SETTINGS: AppSettings = { menuLinks: [] };

export function readSettings(): AppSettings {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return DEFAULT_SETTINGS;
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: AppSettings): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}
