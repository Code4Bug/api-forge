import { useEffect, useState } from "react";

export type Theme =
  | "light"
  | "dark"
  | "system"
  | "dim"
  | "darkOrange"
  | "lightBlue"
  | "ocean"
  | "forest"
  | "violet"
  | "sunset"
  | "custom";
export type ThemeMode = "light" | "dark";

export interface ThemeConfig {
  background: string;
  surface: string;
  raised: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
}

export interface SavedCustomTheme {
  id: string;
  name: string;
  mode: ThemeMode;
  config: ThemeConfig;
  updatedAt: string;
}

export const themePresets: Record<
  Exclude<Theme, "system" | "custom">,
  ThemeConfig
> = {
  // 默认深色主题使用黑灰配色，避免强调色干扰内容层级。
  dark: {
    background: "#0a0a0a",
    surface: "#111111",
    raised: "#1b1b1b",
    border: "#303030",
    text: "#f2f2f2",
    muted: "#969696",
    accent: "#a3a3a3",
  },
  // 默认浅色主题使用灰白配色，降低蓝色饱和度。
  light: {
    background: "#e9e9e9",
    surface: "#fafafa",
    raised: "#f0f0f0",
    border: "#c4c4c4",
    text: "#202020",
    muted: "#666666",
    accent: "#5f5f5f",
  },
  dim: {
    background: "#101722",
    surface: "#17212e",
    raised: "#202d3c",
    border: "#3a4a5e",
    text: "#f8fafc",
    muted: "#a8b4c3",
    accent: "#7dd3fc",
  },
  darkOrange: {
    background: "#050505",
    surface: "#0b0b0b",
    raised: "#151515",
    border: "#262626",
    text: "#f5f5f5",
    muted: "#8a8a8a",
    accent: "#f59e0b",
  },
  lightBlue: {
    background: "#f4f7fb",
    surface: "#ffffff",
    raised: "#eef2f7",
    border: "#d3dae5",
    text: "#1f2937",
    muted: "#667085",
    accent: "#0891b2",
  },
  ocean: {
    background: "#071923",
    surface: "#0b2634",
    raised: "#10384a",
    border: "#1e586d",
    text: "#e5f6fb",
    muted: "#8bb6c4",
    accent: "#38bdf8",
  },
  forest: {
    background: "#0b1713",
    surface: "#11231c",
    raised: "#19382b",
    border: "#2b5b46",
    text: "#e8f5ed",
    muted: "#91b3a1",
    accent: "#6ee7b7",
  },
  violet: {
    background: "#130f1f",
    surface: "#211832",
    raised: "#302247",
    border: "#57427a",
    text: "#f5efff",
    muted: "#b7a9cf",
    accent: "#c4b5fd",
  },
  sunset: {
    background: "#1d1110",
    surface: "#2b1817",
    raised: "#45231e",
    border: "#704039",
    text: "#fff1ec",
    muted: "#c6a19a",
    accent: "#fbad7b",
  },
};

const themeEvent = "api-forge:theme-change";
const customThemesKey = "customThemes";
const activeCustomThemeKey = "activeCustomThemeId";

function normalizeThemeConfig(value: Partial<ThemeConfig>): ThemeConfig {
  return { ...themePresets.dark, ...value };
}

export function getThemeMode(config: ThemeConfig): ThemeMode {
  const value = config.background.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return "dark";
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 >= 150
    ? "light"
    : "dark";
}

function readSavedCustomThemes(): SavedCustomTheme[] {
  try {
    const stored = localStorage.getItem(customThemesKey);
    if (stored !== null) {
      const saved = JSON.parse(stored) as SavedCustomTheme[];
      return Array.isArray(saved)
        ? saved
            .filter((item) => item?.id && item?.name && item?.config)
            .map((item) => {
              const config = normalizeThemeConfig(item.config);
              return {
                ...item,
                mode:
                  item.mode === "light" || item.mode === "dark"
                    ? item.mode
                    : getThemeMode(config),
                config,
              };
            })
        : [];
    }
  } catch {
    // 继续尝试迁移旧版单主题配置。
  }
  try {
    const legacy = JSON.parse(
      localStorage.getItem("customTheme") ?? "",
    ) as Partial<ThemeConfig>;
    if (!legacy || typeof legacy !== "object") return [];
    const config = normalizeThemeConfig(legacy);
    return [
      {
        id: "legacy-custom-theme",
        name: "自定义主题 1",
        mode: getThemeMode(config),
        config,
        updatedAt: new Date().toISOString(),
      },
    ];
  } catch {
    return [];
  }
}

function activeCustomTheme(
  themes = readSavedCustomThemes(),
): SavedCustomTheme | undefined {
  const activeId = localStorage.getItem(activeCustomThemeKey);
  return themes.find((item) => item.id === activeId) ?? themes[0];
}

function readCustomTheme(): ThemeConfig {
  return activeCustomTheme()?.config ?? themePresets.dark;
}

function systemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  const actualTheme = theme === "system" ? systemTheme() : theme;
  const config =
    actualTheme === "custom"
      ? readCustomTheme()
      : themePresets[actualTheme as keyof typeof themePresets];
  const mode =
    actualTheme === "custom"
      ? (activeCustomTheme()?.mode ?? getThemeMode(config))
      : getThemeMode(config);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.setProperty("--app-bg", config.background);
  root.style.setProperty("--app-surface", config.surface);
  root.style.setProperty("--app-raised", config.raised);
  root.style.setProperty("--app-border", config.border);
  root.style.setProperty("--app-text", config.text);
  root.style.setProperty("--app-muted", config.muted);
  root.style.setProperty("--app-accent", config.accent);
  root.style.setProperty(
    "--app-accent-soft",
    `color-mix(in srgb, ${config.accent} 14%, transparent)`,
  );
  root.style.setProperty(
    "--app-accent-border",
    `color-mix(in srgb, ${config.accent} 52%, ${config.border})`,
  );
  root.style.setProperty(
    "--app-input",
    `color-mix(in srgb, ${config.surface} 72%, ${config.raised})`,
  );
  // 浅色主题的菜单 hover 使用更接近表面的浅色，避免混入深色文字后对比过重。
  const lightTheme = mode === "light";
  const hoverColor = lightTheme
    ? `color-mix(in srgb, ${config.surface} 88%, ${config.accent})`
    : `color-mix(in srgb, ${config.raised} 78%, ${config.text})`;
  root.style.setProperty("--app-hover", hoverColor);
  root.style.setProperty(
    "--app-selection",
    `color-mix(in srgb, ${config.accent} 28%, transparent)`,
  );
  const glowStrength =
    actualTheme === "lightBlue" ? [42, 24, 18] : [24, 14, 10];
  root.style.setProperty(
    "--app-glow-primary",
    `color-mix(in srgb, ${config.accent} ${glowStrength[0]}%, transparent)`,
  );
  root.style.setProperty(
    "--app-glow-secondary",
    `color-mix(in srgb, ${config.accent} ${glowStrength[1]}%, transparent)`,
  );
  root.style.setProperty(
    "--app-glow-grid",
    `color-mix(in srgb, ${config.accent} ${glowStrength[2]}%, transparent)`,
  );
  root.classList.remove("light", "dark", "dim");
  root.classList.add(
    lightTheme ? "light" : actualTheme === "dim" ? "dim" : "dark",
  );
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) || "dark",
  );
  const [customTheme, setCustomTheme] = useState<ThemeConfig>(readCustomTheme);
  const [savedCustomThemes, setSavedCustomThemes] = useState<
    SavedCustomTheme[]
  >(readSavedCustomThemes);
  const [activeCustomThemeId, setActiveCustomThemeId] = useState(
    () => activeCustomTheme()?.id,
  );
  const [customThemeMode, setCustomThemeMode] = useState<ThemeMode>(
    () => activeCustomTheme()?.mode ?? getThemeMode(readCustomTheme()),
  );

  useEffect(() => {
    const sync = () => {
      const next = (localStorage.getItem("theme") as Theme) || "dark";
      const saved = readSavedCustomThemes();
      setThemeState(next);
      setSavedCustomThemes(saved);
      const active = activeCustomTheme(saved);
      setActiveCustomThemeId(active?.id);
      setCustomTheme(active?.config ?? themePresets.dark);
      setCustomThemeMode(active?.mode ?? "dark");
    };
    window.addEventListener(themeEvent, sync);
    return () => window.removeEventListener(themeEvent, sync);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("theme", theme);
  }, [theme, customTheme]);

  function setTheme(next: Theme) {
    localStorage.setItem("theme", next);
    setThemeState(next);
    window.dispatchEvent(new Event(themeEvent));
  }

  function saveCustomTheme(
    config: ThemeConfig,
    name?: string,
    mode = getThemeMode(config),
  ) {
    const saved = readSavedCustomThemes();
    const item: SavedCustomTheme = {
      id: crypto.randomUUID(),
      name: name?.trim() || `自定义主题 ${saved.length + 1}`,
      mode,
      config,
      updatedAt: new Date().toISOString(),
    };
    const next = [item, ...saved];
    localStorage.setItem(customThemesKey, JSON.stringify(next));
    localStorage.setItem(activeCustomThemeKey, item.id);
    localStorage.setItem("customTheme", JSON.stringify(config));
    localStorage.setItem("theme", "custom");
    setSavedCustomThemes(next);
    setActiveCustomThemeId(item.id);
    setCustomTheme(config);
    setCustomThemeMode(mode);
    setThemeState("custom");
    window.dispatchEvent(new Event(themeEvent));
  }

  function activateCustomTheme(id: string) {
    const saved = readSavedCustomThemes();
    const selected = saved.find((item) => item.id === id);
    if (!selected) return;
    localStorage.setItem(activeCustomThemeKey, id);
    localStorage.setItem("customTheme", JSON.stringify(selected.config));
    localStorage.setItem("theme", "custom");
    setSavedCustomThemes(saved);
    setActiveCustomThemeId(id);
    setCustomTheme(selected.config);
    setCustomThemeMode(selected.mode);
    setThemeState("custom");
    window.dispatchEvent(new Event(themeEvent));
  }

  function deleteCustomTheme(id: string) {
    const next = readSavedCustomThemes().filter((item) => item.id !== id);
    localStorage.setItem(customThemesKey, JSON.stringify(next));
    const selected = activeCustomTheme(next);
    if (selected) {
      localStorage.setItem(activeCustomThemeKey, selected.id);
      localStorage.setItem("customTheme", JSON.stringify(selected.config));
      setCustomTheme(selected.config);
      setCustomThemeMode(selected.mode);
      setActiveCustomThemeId(selected.id);
    } else {
      localStorage.removeItem(activeCustomThemeKey);
      localStorage.removeItem("customTheme");
      setCustomTheme(themePresets.dark);
      setCustomThemeMode("dark");
      setActiveCustomThemeId(undefined);
      if (theme === "custom") {
        localStorage.setItem("theme", "dark");
        setThemeState("dark");
      }
    }
    setSavedCustomThemes(next);
    window.dispatchEvent(new Event(themeEvent));
  }

  const actualTheme = theme === "system" ? systemTheme() : theme;
  const themeMode =
    actualTheme === "custom"
      ? customThemeMode
      : getThemeMode(
          themePresets[actualTheme as keyof typeof themePresets] ??
            themePresets.dark,
        );
  const isDark = themeMode === "dark";
  const monacoTheme = themeMode === "light" ? "light" : "vs-dark";
  return {
    theme,
    themeMode,
    monacoTheme,
    setTheme,
    customTheme,
    savedCustomThemes,
    activeCustomThemeId,
    saveCustomTheme,
    activateCustomTheme,
    deleteCustomTheme,
    isDark,
  };
}
