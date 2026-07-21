export type VisualThemeId = "dark" | "light" | "colorful" | "monochrome" | "old-school";

export const DEFAULT_UI_THEME_ID: VisualThemeId = "dark";

export interface VisualTheme {
  id: VisualThemeId;
  label: string;
  icon: string;
  description: string;
}

export const VISUAL_THEMES: VisualTheme[] = [
  {
    id: "dark",
    label: "Dark",
    icon: "🌑",
    description: "Default dark neon look",
  },
  {
    id: "light",
    label: "Light",
    icon: "☀️",
    description: "Neon style on a light background",
  },
  {
    id: "colorful",
    label: "Colorful",
    icon: "🌈",
    description: "Vivid rainbow neon on light",
  },
  {
    id: "monochrome",
    label: "Mono",
    icon: "◑",
    description: "Black, white and grays only",
  },
  {
    id: "old-school",
    label: "Old School",
    icon: "💾",
    description: "90s/2000s internet aesthetic",
  },
];

export function isValidVisualThemeId(id: string): id is VisualThemeId {
  return VISUAL_THEMES.some((t) => t.id === id);
}

export function getVisualTheme(id: string): VisualTheme {
  return VISUAL_THEMES.find((t) => t.id === id) ?? VISUAL_THEMES[0];
}
