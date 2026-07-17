import { useEffect, useRef, useState } from "react";
import {
  Check,
  Clock3,
  Droplets,
  Eye,
  EyeOff,
  Leaf,
  Monitor,
  Moon,
  Palette,
  Save,
  Sun,
  Sunset,
  Waves,
  Bot,
  Sparkles,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  MousePointer2,
  SlidersHorizontal,
  Plus,
  Trash2,
  Power,
  LoaderCircle,
  RotateCcw,
  Shuffle,
} from "lucide-react";
import {
  getThemeMode,
  themePresets,
  useTheme,
  type Theme,
  type ThemeConfig,
} from "@/hooks/useTheme";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  getActiveLightModel,
  type LargeModelConfig,
  type LightModelConfig,
} from "@/shared/ipc-contracts";
import type { UpdateStatus } from "@/shared/ipc-contracts";
import { ThemedSelect } from "@/components/common/ThemedSelect";
import { ConfirmModal } from "@/components/common/ConfirmModal";

const themes: Array<{
  id: Theme;
  name: string;
  description: string;
  icon: typeof Sun;
}> = [
  { id: "dark", name: "深色", description: "适合低光环境", icon: Moon },
  { id: "light", name: "浅色", description: "清晰明亮的界面", icon: Sun },
  {
    id: "system",
    name: "跟随系统",
    description: "根据系统偏好自动切换",
    icon: Monitor,
  },
];

const colorThemes: Array<{
  id: Theme;
  name: string;
  description: string;
  icon: typeof Sun;
}> = [
  {
    id: "lightBlue",
    name: "浅色-蓝色",
    description: "清晰明亮的蓝色界面",
    icon: Sun,
  },
  {
    id: "darkOrange",
    name: "深色-橙色",
    description: "黑色背景与橙色强调",
    icon: Sunset,
  },
  {
    id: "dim",
    name: "深色高对比",
    description: "更强的文字和边界对比",
    icon: Palette,
  },
  { id: "ocean", name: "海洋蓝", description: "冷静通透的蓝绿色", icon: Waves },
  { id: "forest", name: "森林绿", description: "沉稳自然的绿色", icon: Leaf },
  {
    id: "violet",
    name: "紫罗兰",
    description: "柔和优雅的紫色",
    icon: Droplets,
  },
  { id: "sunset", name: "落日橙", description: "温暖明快的橙色", icon: Sunset },
];

function ThemeColorPreview({ id }: { id: Theme }) {
  if (id === "system") {
    return (
      <span
        aria-hidden="true"
        className="grid h-8 w-11 shrink-0 grid-cols-2 overflow-hidden rounded border border-zinc-600"
      >
        {[themePresets.dark, themePresets.light].map((preset) => (
          <span
            key={preset.background}
            className="relative"
            style={{ backgroundColor: preset.background }}
          >
            <span
              className="absolute inset-x-1 top-1 h-3 rounded-sm"
              style={{ backgroundColor: preset.surface }}
            />
            <span
              className="absolute inset-x-1 bottom-1 h-1 rounded-sm"
              style={{ backgroundColor: preset.accent }}
            />
          </span>
        ))}
      </span>
    );
  }
  const preset = themePresets[id as keyof typeof themePresets];
  if (!preset) return null;
  return <ThemeConfigPreview config={preset} />;
}

function ThemeConfigPreview({ config }: { config: ThemeConfig }) {
  return (
    <span
      aria-hidden="true"
      className="relative h-8 w-11 shrink-0 overflow-hidden rounded border"
      style={{ backgroundColor: config.background, borderColor: config.border }}
    >
      <span
        className="absolute inset-x-1 top-1 h-4 rounded-sm"
        style={{ backgroundColor: config.surface }}
      />
      <span
        className="absolute bottom-1 left-1 h-1 w-5 rounded-sm"
        style={{ backgroundColor: config.accent }}
      />
    </span>
  );
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = l - chroma / 2;
  const [red, green, blue] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return `#${[red, green, blue]
    .map((value) =>
      Math.round((value + match) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function createRandomTheme(): ThemeConfig {
  const hue = Math.floor(Math.random() * 360);
  const light = Math.random() > 0.5;
  return light
    ? {
        background: hslToHex(hue, 24, 96),
        surface: "#ffffff",
        raised: hslToHex(hue, 20, 91),
        border: hslToHex(hue, 18, 78),
        text: hslToHex(hue, 24, 14),
        muted: hslToHex(hue, 12, 42),
        accent: hslToHex(hue, 72, 42),
      }
    : {
        background: hslToHex(hue, 28, 7),
        surface: hslToHex(hue, 25, 11),
        raised: hslToHex(hue, 22, 16),
        border: hslToHex(hue, 18, 28),
        text: hslToHex(hue, 18, 94),
        muted: hslToHex(hue, 12, 66),
        accent: hslToHex(hue, 76, 62),
      };
}

const modelProviders = [
  "OpenAI 兼容",
  "OpenAI",
  "通义千问",
  "智谱 AI",
  "DeepSeek",
  "Moonshot AI",
  "Ollama",
  "自定义",
];
const providerPresets: Record<string, { baseUrl: string; model: string }> = {
  "OpenAI 兼容": { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  OpenAI: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  通义千问: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-turbo",
  },
  "智谱 AI": {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
  },
  DeepSeek: { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  "Moonshot AI": {
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
  },
  Ollama: { baseUrl: "http://localhost:11434/v1", model: "llama3.2" },
};

const defaultLargeModel: LargeModelConfig = {
  id: "",
  name: "新大模型",
  enabled: false,
  provider: "OpenAI 兼容",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  temperature: 0.7,
  maxTokens: 2048,
  maxContextTokens: 128000,
  thinkingEnabled: false,
};
const defaultLightModel: LightModelConfig = {
  id: "",
  name: "新小模型",
  enabled: false,
  provider: "OpenAI 兼容",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  temperature: 0.3,
  maxTokens: 512,
};

type SettingsCategory = "appearance" | "model" | "workspace" | "application";

const settingsCategories: Array<{
  id: SettingsCategory;
  name: string;
  description: string;
  icon: typeof Palette;
}> = [
  {
    id: "appearance",
    name: "外观与交互",
    description: "主题和视觉效果",
    icon: Palette,
  },
  { id: "model", name: "AI 模型", description: "大模型与轻量模型", icon: Bot },
  {
    id: "workspace",
    name: "工作区",
    description: "自动保存设置",
    icon: SlidersHorizontal,
  },
  {
    id: "application",
    name: "应用",
    description: "版本与更新",
    icon: Download,
  },
];

export default function SettingsPage() {
  const {
    theme,
    setTheme,
    customTheme,
    savedCustomThemes,
    activeCustomThemeId,
    saveCustomTheme,
    activateCustomTheme,
    deleteCustomTheme,
  } = useTheme();
  const {
    autoSaveEnabled,
    autoSaveInterval,
    saveStatus,
    setAutoSaveSettings,
    saveNow,
  } = useWorkspaceStore();
  const {
    workspace,
    updateLargeModelConfig,
    updateLightModelConfig,
    deleteLargeModelConfig,
    deleteLightModelConfig,
    activateLargeModelConfig,
    activateLightModelConfig,
  } = useWorkspaceStore();
  const [customColors, setCustomColors] = useState<ThemeConfig>(customTheme);
  const [customThemeName, setCustomThemeName] = useState("");
  const [selectedLargeModelId, setSelectedLargeModelId] = useState("");
  const [selectedLightModelId, setSelectedLightModelId] = useState("");
  const [showLargeApiKey, setShowLargeApiKey] = useState(false);
  const [showLightApiKey, setShowLightApiKey] = useState(false);
  const [cursorGlowEnabled, setCursorGlowEnabled] = useState(
    () => localStorage.getItem("cursorMosaicGlow") !== "false",
  );
  const [cursorGlowEffect, setCursorGlowEffect] = useState(
    () => localStorage.getItem("cursorMosaicEffect") || "breathe",
  );
  const [cursorGlowTexture, setCursorGlowTexture] = useState(
    () => localStorage.getItem("cursorMosaicTexture") || "grid",
  );
  const [cursorGlowColor, setCursorGlowColor] = useState(
    () => localStorage.getItem("cursorMosaicColor") || "theme",
  );
  const [slogan, setSlogan] = useState(
    () => localStorage.getItem("api-forge:slogan") || "Local API Workspace",
  );
  const [sloganEffect, setSloganEffect] = useState(
    () => localStorage.getItem("api-forge:slogan-effect") || "static",
  );
  const [generatingSlogan, setGeneratingSlogan] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    state: "idle",
  });
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategory>("appearance");
  const [deleteDialog, setDeleteDialog] = useState<
    | { type: "large-model"; id: string; name: string }
    | { type: "light-model"; id: string; name: string }
    | { type: "custom-theme"; id: string; name: string }
  >();
  const settingsFileInputRef = useRef<HTMLInputElement>(null);
  const customColorMode = getThemeMode(customColors);

  useEffect(() => setCustomColors(customTheme), [customTheme]);
  const largeModels = workspace?.preferences.largeModels ?? [];
  const lightModels = workspace?.preferences.lightModels ?? [];
  const modelConfig =
    largeModels.find((item) => item.id === selectedLargeModelId) ??
    largeModels.find(
      (item) => item.id === workspace?.preferences.activeLargeModelId,
    ) ??
    largeModels[0] ??
    defaultLargeModel;
  const lightModelConfig =
    lightModels.find((item) => item.id === selectedLightModelId) ??
    lightModels.find(
      (item) => item.id === workspace?.preferences.activeLightModelId,
    ) ??
    lightModels[0] ??
    defaultLightModel;

  useEffect(() => {
    if (!largeModels.some((item) => item.id === selectedLargeModelId)) {
      setSelectedLargeModelId(
        workspace?.preferences.activeLargeModelId &&
          largeModels.some(
            (item) => item.id === workspace.preferences.activeLargeModelId,
          )
          ? workspace.preferences.activeLargeModelId
          : (largeModels[0]?.id ?? ""),
      );
    }
  }, [
    largeModels,
    selectedLargeModelId,
    workspace?.preferences.activeLargeModelId,
  ]);
  useEffect(() => {
    if (!lightModels.some((item) => item.id === selectedLightModelId)) {
      setSelectedLightModelId(
        workspace?.preferences.activeLightModelId &&
          lightModels.some(
            (item) => item.id === workspace.preferences.activeLightModelId,
          )
          ? workspace.preferences.activeLightModelId
          : (lightModels[0]?.id ?? ""),
      );
    }
  }, [
    lightModels,
    selectedLightModelId,
    workspace?.preferences.activeLightModelId,
  ]);
  useEffect(() => {
    void window.desktopApi
      ?.getAppInfo()
      .then((info) => setAppVersion(info.version))
      .catch(() => undefined);
    return window.desktopApi?.onUpdateStatus?.(setUpdateStatus);
  }, []);
  useEffect(() => {
    const handleSaveSettings = () => saveNow();
    window.addEventListener("api-forge:save-settings", handleSaveSettings);
    return () =>
      window.removeEventListener("api-forge:save-settings", handleSaveSettings);
  }, [saveNow]);

  function updateModelConfig(patch: Partial<LargeModelConfig>) {
    const next = { ...modelConfig, ...patch };
    updateLargeModelConfig(next);
  }

  function updateLightConfig(patch: Partial<LightModelConfig>) {
    const next = { ...lightModelConfig, ...patch };
    updateLightModelConfig(next);
  }

  function addLargeModel() {
    const config = {
      ...defaultLargeModel,
      id: crypto.randomUUID(),
      name: `大模型 ${largeModels.length + 1}`,
    };
    updateLargeModelConfig(config);
    setSelectedLargeModelId(config.id);
  }

  function addLightModel() {
    const config = {
      ...defaultLightModel,
      id: crypto.randomUUID(),
      name: `小模型 ${lightModels.length + 1}`,
    };
    updateLightModelConfig(config);
    setSelectedLightModelId(config.id);
  }

  function removeLargeModel() {
    if (!modelConfig.id) return;
    setDeleteDialog({
      type: "large-model",
      id: modelConfig.id,
      name: modelConfig.name,
    });
  }

  function removeLightModel() {
    if (!lightModelConfig.id) return;
    setDeleteDialog({
      type: "light-model",
      id: lightModelConfig.id,
      name: lightModelConfig.name,
    });
  }

  function selectLargeProvider(provider: string) {
    updateModelConfig({ provider, ...(providerPresets[provider] ?? {}) });
  }

  function selectLightProvider(provider: string) {
    updateLightConfig({ provider, ...(providerPresets[provider] ?? {}) });
  }

  function updateCustomColor(key: keyof ThemeConfig, value: string) {
    setCustomColors((current) => ({ ...current, [key]: value }));
  }

  function resetCustomColors() {
    if (theme === "custom") setCustomColors(customTheme);
    else if (theme === "system")
      setCustomColors(
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? themePresets.dark
          : themePresets.light,
      );
    else
      setCustomColors(
        themePresets[theme as keyof typeof themePresets] ?? themePresets.dark,
      );
  }

  function saveCurrentCustomTheme() {
    saveCustomTheme(customColors, customThemeName, customColorMode);
    setCustomThemeName("");
  }

  function removeCustomTheme(id: string, name: string) {
    setDeleteDialog({ type: "custom-theme", id, name });
  }

  function confirmDelete() {
    if (!deleteDialog) return;
    if (deleteDialog.type === "large-model")
      deleteLargeModelConfig(deleteDialog.id);
    if (deleteDialog.type === "light-model")
      deleteLightModelConfig(deleteDialog.id);
    if (deleteDialog.type === "custom-theme")
      deleteCustomTheme(deleteDialog.id);
    setDeleteDialog(undefined);
  }

  function updateCursorGlow(enabled: boolean) {
    setCursorGlowEnabled(enabled);
    localStorage.setItem("cursorMosaicGlow", String(enabled));
    window.dispatchEvent(new Event("api-forge:cursor-glow-change"));
  }

  function updateCursorGlowEffect(effect: string) {
    setCursorGlowEffect(effect);
    localStorage.setItem("cursorMosaicEffect", effect);
    window.dispatchEvent(new Event("api-forge:cursor-glow-change"));
  }

  function updateCursorGlowSetting(
    key: "cursorMosaicTexture" | "cursorMosaicColor",
    value: string,
  ) {
    if (key === "cursorMosaicTexture") setCursorGlowTexture(value);
    else setCursorGlowColor(value);
    localStorage.setItem(key, value);
    window.dispatchEvent(new Event("api-forge:cursor-glow-change"));
  }

  function updateSlogan(value: string) {
    const next = value.slice(0, 80);
    setSlogan(next);
    localStorage.setItem("api-forge:slogan", next || "Local API Workspace");
    window.dispatchEvent(new Event("api-forge:slogan-change"));
  }

  function updateSloganEffect(value: string) {
    setSloganEffect(value);
    localStorage.setItem("api-forge:slogan-effect", value);
    window.dispatchEvent(new Event("api-forge:slogan-change"));
  }

  async function generateSlogan() {
    const config = getActiveLightModel(workspace?.preferences);
    if (!config || !window.desktopApi?.httpSend) {
      window.alert("请先在 AI 模型中激活一个小模型");
      return;
    }
    setGeneratingSlogan(true);
    try {
      const response = await window.desktopApi.httpSend({
        method: "POST",
        url: `${config.baseUrl.replace(/\/$/, "")}/chat/completions`,
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey
            ? { Authorization: `Bearer ${config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: config.model,
          temperature: Math.max(config.temperature, 0.8),
          max_tokens: 32,
          stream: false,
          messages: [
            {
              role: "system",
              content:
                "生成一句简短、帅酷、有辨识度的英文个性化 Slogan。最多 4 个单词或 24 个字符，只输出 Slogan，不加引号、标点或解释。不要关联 API、软件、接口、开发、技术或任何具体产品，像潮流品牌或创意工作室的宣言。",
            },
            {
              role: "user",
              content: "请给我一句让人印象深刻、简洁有态度的品牌短句。",
            },
          ],
        }),
        timeout: 30000,
      });
      if (!response.ok || response.status < 200 || response.status >= 300)
        throw new Error("模型请求失败");
      const content = (
        JSON.parse(response.body) as {
          choices?: Array<{ message?: { content?: string } }>;
        }
      ).choices?.[0]?.message?.content
        ?.replace(/[\r\n"'`.,!?：；。！？，、]/g, "")
        .trim()
        .slice(0, 32);
      if (content) updateSlogan(content);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "生成失败，请检查小模型配置",
      );
    } finally {
      setGeneratingSlogan(false);
    }
  }

  async function checkForUpdates() {
    setUpdateStatus({ state: "checking" });
    await window.desktopApi?.checkForUpdates();
  }

  async function downloadUpdate() {
    await window.desktopApi?.downloadUpdate();
  }

  async function installUpdate() {
    await window.desktopApi?.installUpdate();
  }

  function exportSettings() {
    const settings = {
      version: 1,
      theme: localStorage.getItem("theme") ?? theme,
      customTheme: localStorage.getItem("customTheme"),
      customThemes: localStorage.getItem("customThemes"),
      activeCustomThemeId: localStorage.getItem("activeCustomThemeId"),
      cursorMosaicGlow:
        localStorage.getItem("cursorMosaicGlow") ?? String(cursorGlowEnabled),
      cursorMosaicEffect:
        localStorage.getItem("cursorMosaicEffect") ?? cursorGlowEffect,
      cursorMosaicTexture:
        localStorage.getItem("cursorMosaicTexture") ?? cursorGlowTexture,
      cursorMosaicColor:
        localStorage.getItem("cursorMosaicColor") ?? cursorGlowColor,
      slogan,
      sloganEffect,
      autoSaveEnabled: String(autoSaveEnabled),
      autoSaveInterval: String(autoSaveInterval),
      largeModels,
      lightModels,
      activeLargeModelId: workspace?.preferences.activeLargeModelId,
      activeLightModelId: workspace?.preferences.activeLightModelId,
    };
    const blob = new Blob([JSON.stringify(settings, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `api-forge-settings-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importSettings(file?: File) {
    if (!file) return;
    try {
      const settings = JSON.parse(await file.text()) as Record<string, unknown>;
      if (settings.version !== 1 || typeof settings.theme !== "string")
        throw new Error("设置文件格式不正确");
      const supportedThemes = [...themes, ...colorThemes].map(
        (item) => item.id,
      );
      if (
        settings.theme !== "custom" &&
        !supportedThemes.includes(settings.theme as Theme)
      )
        throw new Error("设置文件中的主题不受支持");
      localStorage.setItem("theme", settings.theme);
      for (const key of [
        "customTheme",
        "customThemes",
        "activeCustomThemeId",
        "cursorMosaicGlow",
        "cursorMosaicEffect",
        "cursorMosaicTexture",
        "cursorMosaicColor",
        "slogan",
        "sloganEffect",
      ]) {
        if (typeof settings[key] === "string")
          localStorage.setItem(key, settings[key] as string);
      }
      if (typeof settings.cursorMosaicGlow === "string")
        setCursorGlowEnabled(settings.cursorMosaicGlow !== "false");
      if (typeof settings.cursorMosaicEffect === "string")
        setCursorGlowEffect(settings.cursorMosaicEffect);
      if (typeof settings.cursorMosaicTexture === "string")
        setCursorGlowTexture(settings.cursorMosaicTexture);
      if (typeof settings.cursorMosaicColor === "string")
        setCursorGlowColor(settings.cursorMosaicColor);
      if (typeof settings.slogan === "string") setSlogan(settings.slogan);
      if (typeof settings.sloganEffect === "string")
        setSloganEffect(settings.sloganEffect);
      const enabled = settings.autoSaveEnabled !== "false";
      const interval = Number(settings.autoSaveInterval) || 60;
      setAutoSaveSettings(enabled, interval);
      if (Array.isArray(settings.largeModels))
        settings.largeModels.forEach((config) => {
          if (config && typeof config === "object")
            updateLargeModelConfig(config as LargeModelConfig);
        });
      if (Array.isArray(settings.lightModels))
        settings.lightModels.forEach((config) => {
          if (config && typeof config === "object")
            updateLightModelConfig(config as LightModelConfig);
        });
      if (typeof settings.activeLargeModelId === "string")
        activateLargeModelConfig(settings.activeLargeModelId);
      if (typeof settings.activeLightModelId === "string")
        activateLightModelConfig(settings.activeLightModelId);
      window.dispatchEvent(new Event("api-forge:theme-change"));
      window.dispatchEvent(new Event("api-forge:cursor-glow-change"));
      window.dispatchEvent(new Event("api-forge:slogan-change"));
      saveNow();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? `导入失败：${error.message}`
          : "导入失败：文件无法读取",
      );
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--app-bg)]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
        <div>
          <h1 className="text-sm font-semibold">系统设置</h1>
          <p className="text-xs text-zinc-500">调整界面外观和工作区保存行为</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={settingsFileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              void importSettings(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => settingsFileInputRef.current?.click()}
            className="flex h-9 items-center gap-2 rounded border border-zinc-700 px-3 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            <Upload className="h-3.5 w-3.5" />
            导入
          </button>
          <button
            type="button"
            onClick={exportSettings}
            className="flex h-9 items-center gap-2 rounded border border-zinc-700 px-3 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            <Download className="h-3.5 w-3.5" />
            导出
          </button>
          <button
            onClick={saveNow}
            disabled={saveStatus === "saving"}
            className="flex h-9 items-center gap-2 rounded bg-cyan-400 px-3 text-xs font-semibold text-zinc-950 transition-colors hover:bg-cyan-300 active:bg-cyan-200 disabled:cursor-wait disabled:opacity-70"
          >
            {saveStatus === "saving" ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : saveStatus === "error" ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : saveStatus === "saved" ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saveStatus === "saving"
              ? "保存中..."
              : saveStatus === "error"
                ? "保存失败"
                : saveStatus === "saved"
                  ? "已保存"
                  : "立即保存"}
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          className="w-full shrink-0 border-b border-zinc-800 bg-zinc-950/20 p-2.5 md:w-44 md:border-b-0 md:border-r md:p-3"
          aria-label="设置分类"
        >
          <div className="mb-2 px-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            设置分类
          </div>
          <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
            {settingsCategories.map(({ id, name, description, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveCategory(id)}
                className={`flex min-w-[130px] items-center gap-2 rounded border px-2.5 py-2 text-left transition-colors md:min-w-0 ${activeCategory === id ? "border-cyan-400/40 bg-cyan-400/10 text-zinc-100" : "border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900/60 hover:text-zinc-200"}`}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${activeCategory === id ? "text-cyan-300" : "text-zinc-500"}`}
                />
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium">{name}</span>
                  <span className="mt-0.5 block truncate text-[9px] text-zinc-500">
                    {description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </nav>
        <main className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:space-y-6 sm:p-5">
            {activeCategory === "appearance" && (
              <>
                <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <Palette className="h-4 w-4 text-cyan-300" />
                    <h2 className="text-sm font-medium">主题设置</h2>
                  </div>
                  <div className="mb-3 text-xs font-medium text-zinc-300">
                    默认主题
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
                    {themes.map(({ id, name, description, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => setTheme(id)}
                        className={`flex h-full min-w-0 items-center gap-3 rounded border p-3 text-left ${theme === id ? "border-cyan-400/70 bg-cyan-400/10" : "border-zinc-800 hover:border-zinc-600"}`}
                      >
                        <ThemeColorPreview id={id} />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-xs font-medium">
                            {name}
                          </span>
                          <span className="mt-1 block break-words text-[11px] text-zinc-500">
                            {description}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Icon className="h-4 w-4 text-zinc-400" />
                          {theme === id && (
                            <Check className="h-4 w-4 text-cyan-300" />
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-5 border-t border-zinc-800 pt-4">
                    <div className="mb-3 text-xs font-medium text-zinc-300">
                      更多主题色
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
                      {colorThemes.map(
                        ({ id, name, description, icon: Icon }) => (
                          <button
                            key={id}
                            onClick={() => setTheme(id)}
                            className={`flex h-full min-w-0 items-center gap-3 rounded border p-3 text-left ${theme === id ? "border-cyan-400/70 bg-cyan-400/10" : "border-zinc-800 hover:border-zinc-600"}`}
                          >
                            <ThemeColorPreview id={id} />
                            <span className="min-w-0 flex-1">
                              <span className="block break-words text-xs font-medium">
                                {name}
                              </span>
                              <span className="mt-1 block break-words text-[11px] text-zinc-500">
                                {description}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              <Icon className="h-4 w-4 text-zinc-400" />
                              {theme === id && (
                                <Check className="h-4 w-4 text-cyan-300" />
                              )}
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                    <div className="mt-5 border-t border-zinc-800 pt-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                          <span>自定义主题色</span>
                          <span
                            className={`inline-flex h-6 items-center gap-1 rounded border px-2 text-[10px] ${customColorMode === "light" ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-sky-400/40 bg-sky-400/10 text-sky-300"}`}
                          >
                            {customColorMode === "light" ? (
                              <Sun className="h-3 w-3" />
                            ) : (
                              <Moon className="h-3 w-3" />
                            )}
                            {customColorMode === "light"
                              ? "浅色主题"
                              : "深色主题"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={resetCustomColors}
                            className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 px-2.5 text-[11px] text-zinc-400 hover:text-zinc-200"
                            title="恢复当前已应用主题的颜色"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            复位
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomColors(createRandomTheme())}
                            className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 px-2.5 text-[11px] text-zinc-400 hover:text-zinc-200"
                            title="生成一套可读性良好的随机配色"
                          >
                            <Shuffle className="h-3.5 w-3.5" />
                            随机颜色
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
                        {(
                          [
                            ["background", "背景色"],
                            ["surface", "面板色"],
                            ["raised", "高亮面板"],
                            ["border", "边框色"],
                            ["text", "文字色"],
                            ["muted", "次要文字"],
                            ["accent", "强调色"],
                          ] as Array<[keyof ThemeConfig, string]>
                        ).map(([key, label]) => (
                          <label
                            key={key}
                            className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-400"
                          >
                            <span className="shrink-0">{label}</span>
                            <span className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
                              <input
                                type="color"
                                value={customColors[key]}
                                onChange={(event) =>
                                  updateCustomColor(key, event.target.value)
                                }
                                className="h-8 w-10 shrink-0 cursor-pointer rounded border border-zinc-700 bg-transparent p-0.5"
                              />
                              <code className="min-w-0 break-all text-right text-[10px] text-zinc-500">
                                {customColors[key]}
                              </code>
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <input
                          value={customThemeName}
                          onChange={(event) =>
                            setCustomThemeName(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") saveCurrentCustomTheme();
                          }}
                          placeholder={`自定义主题 ${savedCustomThemes.length + 1}`}
                          maxLength={24}
                          className="h-9 min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-200 outline-none focus:border-cyan-400"
                        />
                        <button
                          type="button"
                          onClick={saveCurrentCustomTheme}
                          className="flex min-h-9 items-center justify-center gap-2 rounded border border-cyan-400/50 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-400/10"
                        >
                          <Save className="h-3.5 w-3.5 shrink-0" />
                          保存为新主题
                        </button>
                      </div>
                      {savedCustomThemes.length > 0 && (
                        <div className="mt-5 border-t border-zinc-800 pt-4">
                          <div className="mb-3 text-xs font-medium text-zinc-300">
                            已保存主题
                          </div>
                          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
                            {savedCustomThemes.map((item) => (
                              <div
                                key={item.id}
                                className={`flex min-w-0 items-center gap-2 rounded border p-2 ${theme === "custom" && activeCustomThemeId === item.id ? "border-cyan-400/70 bg-cyan-400/10" : "border-zinc-800"}`}
                              >
                                <button
                                  type="button"
                                  onClick={() => activateCustomTheme(item.id)}
                                  className="flex min-w-0 flex-1 items-center gap-3 rounded p-1 text-left"
                                >
                                  <ThemeConfigPreview config={item.config} />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-medium text-zinc-200">
                                      {item.name}
                                    </span>
                                    <span className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500">
                                      {item.mode === "light" ? (
                                        <Sun className="h-3 w-3" />
                                      ) : (
                                        <Moon className="h-3 w-3" />
                                      )}
                                      {item.mode === "light" ? "浅色" : "深色"}{" "}
                                      ·{" "}
                                      {theme === "custom" &&
                                      activeCustomThemeId === item.id
                                        ? "当前使用"
                                        : "点击切换"}
                                    </span>
                                  </span>
                                  {theme === "custom" &&
                                    activeCustomThemeId === item.id && (
                                      <Check className="h-4 w-4 shrink-0 text-cyan-300" />
                                    )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeCustomTheme(item.id, item.name)
                                  }
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-rose-400/10 hover:text-rose-300"
                                  title={`删除 ${item.name}`}
                                  aria-label={`删除 ${item.name}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
                <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    <h2 className="text-sm font-medium">品牌 Slogan</h2>
                  </div>
                  <p className="mb-3 text-[11px] text-zinc-500">
                    显示在 Logo 下方的小字，可自定义或使用已激活的小模型生成。
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={slogan}
                      onChange={(event) => updateSlogan(event.target.value)}
                      maxLength={80}
                      placeholder="Local API Workspace"
                      className="h-9 min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-200 outline-none focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => void generateSlogan()}
                      disabled={generatingSlogan}
                      className="flex h-9 items-center justify-center gap-1.5 rounded border border-cyan-400/50 px-3 text-xs text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-50"
                    >
                      <Sparkles
                        className={`h-3.5 w-3.5 ${generatingSlogan ? "animate-spin" : ""}`}
                      />
                      {generatingSlogan ? "生成中..." : "模型生成"}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-zinc-400">
                      <span className="mb-1 block">动效</span>
                      <ThemedSelect
                        value={sloganEffect}
                        options={[
                          { value: "static", label: "静态" },
                          { value: "typewriter", label: "打字机" },
                          { value: "shimmer", label: "流光" },
                          { value: "breathe", label: "呼吸" },
                          { value: "marquee", label: "横向漂移" },
                        ]}
                        onChange={updateSloganEffect}
                      />
                    </label>
                    <div className="flex min-h-9 items-end text-[11px] text-zinc-500">
                      预览：
                      <span
                        className={`ml-1 api-forge-slogan api-forge-slogan-${sloganEffect}`}
                      >
                        {slogan || "Local API Workspace"}
                      </span>
                    </div>
                  </div>
                </section>
                <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <MousePointer2 className="h-4 w-4 text-cyan-300" />
                    <h2 className="text-sm font-medium">交互效果</h2>
                  </div>
                  <label className="flex items-center justify-between gap-4 text-xs text-zinc-300">
                    <span>
                      <span className="block font-medium">
                        启用光标马赛克光晕
                      </span>
                      <span className="mt-1 block text-[11px] text-zinc-500">
                        在光标附近显示跟随移动的像素光晕
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={cursorGlowEnabled}
                      onChange={(event) =>
                        updateCursorGlow(event.target.checked)
                      }
                      className="h-4 w-4 accent-cyan-400"
                    />
                  </label>
                  <div
                    className={`mt-4 border-t border-zinc-800 pt-4 ${!cursorGlowEnabled ? "pointer-events-none opacity-50" : ""}`}
                  >
                    <div className="mb-4">
                      <div className="mb-2 text-xs font-medium text-zinc-300">
                        纹理
                      </div>
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-2">
                        <button
                          onClick={() =>
                            updateCursorGlowSetting(
                              "cursorMosaicTexture",
                              "grid",
                            )
                          }
                          className={`min-h-9 break-words rounded border px-2 py-2 text-[11px] ${cursorGlowTexture === "grid" ? "border-cyan-400/70 bg-cyan-400/15 text-cyan-200" : "border-zinc-700 text-zinc-400"}`}
                        >
                          像素网格
                        </button>
                        <button
                          onClick={() =>
                            updateCursorGlowSetting(
                              "cursorMosaicTexture",
                              "dots",
                            )
                          }
                          className={`min-h-9 break-words rounded border px-2 py-2 text-[11px] ${cursorGlowTexture === "dots" ? "border-cyan-400/70 bg-cyan-400/15 text-cyan-200" : "border-zinc-700 text-zinc-400"}`}
                        >
                          颗粒点阵
                        </button>
                        <button
                          onClick={() =>
                            updateCursorGlowSetting(
                              "cursorMosaicTexture",
                              "soft",
                            )
                          }
                          className={`min-h-9 break-words rounded border px-2 py-2 text-[11px] ${cursorGlowTexture === "soft" ? "border-cyan-400/70 bg-cyan-400/15 text-cyan-200" : "border-zinc-700 text-zinc-400"}`}
                        >
                          柔和光斑
                        </button>
                      </div>
                    </div>
                    <div className="mb-4">
                      <div className="mb-2 text-xs font-medium text-zinc-300">
                        运动
                      </div>
                      {[
                        [
                          "定点光效",
                          [
                            ["breathe", "呼吸"],
                            ["expand", "脉冲扩散"],
                            ["contract", "脉冲收缩"],
                            ["blink", "闪烁"],
                            ["steady", "静止柔光"],
                            ["centerExpand", "中心放射"],
                            ["centerContract", "中心收束"],
                            ["mirrorPulse", "镜像脉冲"],
                            ["rotate", "旋转对称"],
                            ["ripple", "同心波纹"],
                          ],
                        ],
                        [
                          "动态追踪",
                          [
                            ["drift", "轻柔漂移"],
                            ["bounce", "弹跳移动"],
                            ["orbit", "环绕移动"],
                            ["slideX", "水平移动"],
                            ["slideY", "垂直移动"],
                          ],
                        ],
                      ].map(([group, effects]) => (
                        <div key={String(group)} className="mb-3 last:mb-0">
                          <div className="mb-2 text-[11px] text-zinc-500">
                            {group}
                          </div>
                          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-2">
                            {(effects as string[][]).map(([id, name]) => (
                              <button
                                key={id}
                                onClick={() => updateCursorGlowEffect(id)}
                                className={`min-h-9 break-words rounded border px-2 py-2 text-[11px] ${cursorGlowEffect === id ? "border-cyan-400/70 bg-cyan-400/15 text-cyan-200" : "border-zinc-700 text-zinc-400"}`}
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-medium text-zinc-300">
                        色彩
                      </div>
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-2">
                        {[
                          ["theme", "跟随主题"],
                          ["cyan", "青蓝"],
                          ["amber", "琥珀"],
                          ["spectrum", "彩虹"],
                        ].map(([id, name]) => (
                          <button
                            key={id}
                            onClick={() =>
                              updateCursorGlowSetting("cursorMosaicColor", id)
                            }
                            className={`min-h-9 break-words rounded border px-2 py-2 text-[11px] ${cursorGlowColor === id ? "border-cyan-400/70 bg-cyan-400/15 text-cyan-200" : "border-zinc-700 text-zinc-400"}`}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}
            <ConfirmModal
              open={Boolean(deleteDialog)}
              title={
                deleteDialog?.type === "custom-theme" ? "删除主题" : "确认删除"
              }
              description={
                deleteDialog
                  ? `确定删除“${deleteDialog.name}”吗？此操作不可撤销。`
                  : ""
              }
              confirmText="删除"
              onCancel={() => setDeleteDialog(undefined)}
              onConfirm={confirmDelete}
            />
            {activeCategory === "model" && (
              <>
                <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-violet-300" />
                      <h2 className="text-sm font-medium">大模型配置</h2>
                    </div>
                    <button
                      type="button"
                      onClick={addLargeModel}
                      title="新增大模型配置"
                      className="model-add-button model-add-button-large group flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors"
                    >
                      <Plus className="h-4 w-4 text-current transition-transform group-hover:rotate-90" />
                      新增配置
                    </button>
                  </div>
                  <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                    {largeModels.map((config) => {
                      const active =
                        workspace?.preferences.activeLargeModelId === config.id;
                      const selected = modelConfig.id === config.id;
                      return (
                        <button
                          key={config.id}
                          type="button"
                          onClick={() => setSelectedLargeModelId(config.id)}
                          className={`flex min-w-32 items-center justify-between gap-2 rounded border px-3 py-2 text-left ${selected ? "border-violet-400/60 bg-violet-400/10" : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-600"}`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs text-zinc-200">
                              {config.name}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
                              {config.model}
                            </span>
                          </span>
                          {active && (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                          )}
                        </button>
                      );
                    })}
                    {largeModels.length === 0 && (
                      <button
                        type="button"
                        onClick={addLargeModel}
                        className="flex h-16 w-full items-center justify-center gap-2 rounded border border-dashed border-zinc-700 text-xs text-zinc-500 hover:border-violet-400 hover:text-violet-200"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        添加第一个大模型
                      </button>
                    )}
                  </div>
                  {modelConfig.id && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-4">
                      <span className="text-[11px] text-zinc-500">
                        同一时间仅使用一个大模型配置
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={removeLargeModel}
                          className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 px-2.5 text-xs text-zinc-400 hover:border-rose-400 hover:text-rose-300"
                          title="删除当前配置"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            activateLargeModelConfig(modelConfig.id)
                          }
                          disabled={
                            workspace?.preferences.activeLargeModelId ===
                            modelConfig.id
                          }
                          className="flex h-8 items-center gap-1.5 rounded bg-violet-400 px-2.5 text-xs font-semibold text-zinc-950 disabled:bg-emerald-400 disabled:opacity-100"
                        >
                          <Power className="h-3.5 w-3.5" />
                          {workspace?.preferences.activeLargeModelId ===
                          modelConfig.id
                            ? "已激活"
                            : "激活"}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-zinc-400">
                      <span className="mb-1 block">配置名称</span>
                      <input
                        value={modelConfig.name}
                        onChange={(event) =>
                          updateModelConfig({ name: event.target.value })
                        }
                        placeholder="例如：日常开发"
                        disabled={!modelConfig.id}
                        className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-violet-400 disabled:opacity-50"
                      />
                    </label>
                    <label className="text-xs text-zinc-400">
                      <span className="mb-1 block">服务商</span>
                      <ThemedSelect
                        value={modelConfig.provider}
                        disabled={!modelConfig.id}
                        options={modelProviders.map((provider) => ({
                          value: provider,
                          label: provider,
                        }))}
                        onChange={selectLargeProvider}
                      />
                    </label>
                    {(
                      [
                        ["baseUrl", "接口地址", "https://api.openai.com/v1"],
                        ["model", "模型名称", "gpt-4o-mini"],
                      ] as Array<[keyof LargeModelConfig, string, string]>
                    ).map(([key, label, placeholder]) => (
                      <label key={key} className="text-xs text-zinc-400">
                        <span className="mb-1 block">{label}</span>
                        <input
                          value={String(modelConfig[key])}
                          onChange={(event) =>
                            updateModelConfig({ [key]: event.target.value })
                          }
                          placeholder={placeholder}
                          disabled={!modelConfig.id}
                          className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-violet-400 disabled:opacity-50"
                        />
                      </label>
                    ))}
                    <label className="text-xs text-zinc-400">
                      <span className="mb-1 block">API Key</span>
                      <span className="flex h-9 items-center rounded border border-zinc-700 bg-zinc-950 focus-within:border-violet-400">
                        <input
                          type={showLargeApiKey ? "text" : "password"}
                          value={modelConfig.apiKey}
                          onChange={(event) =>
                            updateModelConfig({ apiKey: event.target.value })
                          }
                          placeholder="sk-..."
                          disabled={!modelConfig.id}
                          className="min-w-0 flex-1 bg-transparent px-2 text-xs text-zinc-200 outline-none disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLargeApiKey((value) => !value)}
                          className="p-2 text-zinc-500 hover:text-zinc-200"
                          title={
                            showLargeApiKey ? "隐藏 API Key" : "显示 API Key"
                          }
                        >
                          {showLargeApiKey ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </span>
                    </label>
                    <label className="text-xs text-zinc-400">
                      <span className="mb-1 block">温度（0-2）</span>
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={modelConfig.temperature}
                        onChange={(event) =>
                          updateModelConfig({
                            temperature: Math.min(
                              2,
                              Math.max(0, Number(event.target.value)),
                            ),
                          })
                        }
                        disabled={!modelConfig.id}
                        className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-violet-400 disabled:opacity-50"
                      />
                    </label>
                    <label className="text-xs text-zinc-400">
                      <span className="mb-1 block">最大 Token 数</span>
                      <input
                        type="number"
                        min="1"
                        max="128000"
                        step="1"
                        value={modelConfig.maxTokens}
                        onChange={(event) =>
                          updateModelConfig({
                            maxTokens: Math.max(1, Number(event.target.value)),
                          })
                        }
                        disabled={!modelConfig.id}
                        className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-violet-400 disabled:opacity-50"
                      />
                    </label>
                    <label className="text-xs text-zinc-400">
                      <span className="mb-1 block">最大上下文 Token 数</span>
                      <input
                        type="number"
                        min="1"
                        max="1000000"
                        step="1"
                        value={modelConfig.maxContextTokens}
                        onChange={(event) =>
                          updateModelConfig({
                            maxContextTokens: Math.max(
                              1,
                              Number(event.target.value),
                            ),
                          })
                        }
                        disabled={!modelConfig.id}
                        className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-violet-400 disabled:opacity-50"
                      />
                    </label>
                  </div>
                  <label className="mt-4 flex items-center justify-between gap-4 border-t border-zinc-800 pt-4 text-xs text-zinc-300">
                    <span>
                      <span className="block font-medium">开启思考模式</span>
                      <span className="mt-1 block text-[11px] text-zinc-500">
                        向接口显式传递思考开关并实时展示推理内容，仅支持推理的模型生效
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={modelConfig.thinkingEnabled ?? false}
                      onChange={(event) =>
                        updateModelConfig({
                          thinkingEnabled: event.target.checked,
                        })
                      }
                      disabled={!modelConfig.id}
                      className="h-4 w-4 accent-violet-400"
                    />
                  </label>
                </section>
                <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-emerald-300" />
                        <h2 className="text-sm font-medium">小模型配置</h2>
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        用于标题、摘要和内容等低成本、低延迟任务。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addLightModel}
                      title="新增小模型配置"
                      className="model-add-button model-add-button-light group flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors"
                    >
                      <Plus className="h-4 w-4 text-current transition-transform group-hover:rotate-90" />
                      新增配置
                    </button>
                  </div>
                  <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                    {lightModels.map((config) => {
                      const active =
                        workspace?.preferences.activeLightModelId === config.id;
                      const selected = lightModelConfig.id === config.id;
                      return (
                        <button
                          key={config.id}
                          type="button"
                          onClick={() => setSelectedLightModelId(config.id)}
                          className={`flex min-w-32 items-center justify-between gap-2 rounded border px-3 py-2 text-left ${selected ? "border-emerald-400/60 bg-emerald-400/10" : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-600"}`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs text-zinc-200">
                              {config.name}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
                              {config.model}
                            </span>
                          </span>
                          {active && (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                          )}
                        </button>
                      );
                    })}
                    {lightModels.length === 0 && (
                      <button
                        type="button"
                        onClick={addLightModel}
                        className="flex h-16 w-full items-center justify-center gap-2 rounded border border-dashed border-zinc-700 text-xs text-zinc-500 hover:border-emerald-400 hover:text-emerald-200"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        添加第一个小模型
                      </button>
                    )}
                  </div>
                  {lightModelConfig.id && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-4">
                      <span className="text-[11px] text-zinc-500">
                        同一时间仅使用一个小模型配置
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={removeLightModel}
                          className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 px-2.5 text-xs text-zinc-400 hover:border-rose-400 hover:text-rose-300"
                          title="删除当前配置"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            activateLightModelConfig(lightModelConfig.id)
                          }
                          disabled={
                            workspace?.preferences.activeLightModelId ===
                            lightModelConfig.id
                          }
                          className="flex h-8 items-center gap-1.5 rounded bg-emerald-400 px-2.5 text-xs font-semibold text-zinc-950 disabled:opacity-100"
                        >
                          <Power className="h-3.5 w-3.5" />
                          {workspace?.preferences.activeLightModelId ===
                          lightModelConfig.id
                            ? "已激活"
                            : "激活"}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-zinc-400">
                      <span className="mb-1 block">配置名称</span>
                      <input
                        value={lightModelConfig.name}
                        onChange={(event) =>
                          updateLightConfig({ name: event.target.value })
                        }
                        placeholder="例如：快速摘要"
                        disabled={!lightModelConfig.id}
                        className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-emerald-400 disabled:opacity-50"
                      />
                    </label>
                    <label className="text-xs text-zinc-400">
                      <span className="mb-1 block">服务商</span>
                      <ThemedSelect
                        value={lightModelConfig.provider}
                        disabled={!lightModelConfig.id}
                        options={modelProviders.map((provider) => ({
                          value: provider,
                          label: provider,
                        }))}
                        onChange={selectLightProvider}
                      />
                    </label>
                    <label className="text-xs text-zinc-400">
                      <span className="mb-1 block">模型名称</span>
                      <input
                        value={lightModelConfig.model}
                        onChange={(event) =>
                          updateLightConfig({ model: event.target.value })
                        }
                        placeholder="gpt-4o-mini"
                        disabled={!lightModelConfig.id}
                        className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-emerald-400 disabled:opacity-50"
                      />
                    </label>
                    <label className="text-xs text-zinc-400">
                      <span className="mb-1 block">接口地址</span>
                      <input
                        value={lightModelConfig.baseUrl}
                        onChange={(event) =>
                          updateLightConfig({ baseUrl: event.target.value })
                        }
                        placeholder="https://api.openai.com/v1"
                        disabled={!lightModelConfig.id}
                        className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-emerald-400 disabled:opacity-50"
                      />
                    </label>
                    <label className="text-xs text-zinc-400">
                      <span className="mb-1 block">API Key</span>
                      <span className="flex h-9 items-center rounded border border-zinc-700 bg-zinc-950 focus-within:border-emerald-400">
                        <input
                          type={showLightApiKey ? "text" : "password"}
                          value={lightModelConfig.apiKey}
                          onChange={(event) =>
                            updateLightConfig({ apiKey: event.target.value })
                          }
                          placeholder="sk-..."
                          disabled={!lightModelConfig.id}
                          className="min-w-0 flex-1 bg-transparent px-2 text-xs text-zinc-200 outline-none disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLightApiKey((value) => !value)}
                          className="p-2 text-zinc-500 hover:text-zinc-200"
                          title={
                            showLightApiKey ? "隐藏 API Key" : "显示 API Key"
                          }
                        >
                          {showLightApiKey ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </span>
                    </label>
                    <label className="text-xs text-zinc-400">
                      <span className="mb-1 block">温度（0-2）</span>
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={lightModelConfig.temperature}
                        onChange={(event) =>
                          updateLightConfig({
                            temperature: Math.min(
                              2,
                              Math.max(0, Number(event.target.value)),
                            ),
                          })
                        }
                        disabled={!lightModelConfig.id}
                        className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-emerald-400 disabled:opacity-50"
                      />
                    </label>
                    <label className="text-xs text-zinc-400">
                      <span className="mb-1 block">最大 Token 数</span>
                      <input
                        type="number"
                        min="1"
                        max="8192"
                        step="1"
                        value={lightModelConfig.maxTokens}
                        onChange={(event) =>
                          updateLightConfig({
                            maxTokens: Math.max(1, Number(event.target.value)),
                          })
                        }
                        disabled={!lightModelConfig.id}
                        className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-emerald-400 disabled:opacity-50"
                      />
                    </label>
                  </div>
                </section>
              </>
            )}
            {activeCategory === "workspace" && (
              <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-amber-300" />
                  <h2 className="text-sm font-medium">定时保存</h2>
                </div>
                <label className="flex items-center justify-between gap-4 text-xs text-zinc-300">
                  <span>
                    <span className="block font-medium">自动保存工作区</span>
                    <span className="mt-1 block text-[11px] text-zinc-500">
                      按固定间隔保存接口、环境变量和历史记录
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={autoSaveEnabled}
                    onChange={(event) =>
                      setAutoSaveSettings(
                        event.target.checked,
                        autoSaveInterval,
                      )
                    }
                    className="h-4 w-4 accent-cyan-400"
                  />
                </label>
                <label className="mt-4 flex items-center justify-between gap-4 text-xs text-zinc-400">
                  保存间隔
                  <ThemedSelect
                    className="w-36"
                    disabled={!autoSaveEnabled}
                    value={autoSaveInterval}
                    options={[
                      { value: 30, label: "每 30 秒" },
                      { value: 60, label: "每 1 分钟" },
                      { value: 300, label: "每 5 分钟" },
                      { value: 900, label: "每 15 分钟" },
                    ]}
                    onChange={(value) =>
                      setAutoSaveSettings(autoSaveEnabled, value)
                    }
                  />
                </label>
              </section>
            )}
            {activeCategory === "application" && (
              <section className="rounded border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Download className="h-4 w-4 text-emerald-300" />
                  <h2 className="text-sm font-medium">应用更新</h2>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-300">
                  <span>
                    当前版本{" "}
                    <strong className="ml-1 text-zinc-100">
                      {appVersion ? `v${appVersion}` : "读取中"}
                    </strong>
                  </span>
                  <button
                    onClick={checkForUpdates}
                    disabled={
                      updateStatus.state === "checking" ||
                      updateStatus.state === "downloading"
                    }
                    className="flex h-8 items-center gap-2 rounded border border-zinc-700 px-3 hover:border-cyan-400 hover:text-cyan-200 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${updateStatus.state === "checking" ? "animate-spin" : ""}`}
                    />
                    检查新版本
                  </button>
                </div>
                <div className="mt-3 text-xs text-zinc-500">
                  {updateStatus.state === "checking" && "正在检查更新..."}
                  {updateStatus.state === "not-available" && (
                    <span className="flex items-center gap-2 text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      当前已是最新版本
                    </span>
                  )}
                  {updateStatus.state === "available" && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>发现新版本 v{updateStatus.version}</span>
                      <button
                        onClick={downloadUpdate}
                        className="flex h-8 items-center gap-2 rounded bg-cyan-400 px-3 font-semibold text-zinc-950"
                      >
                        <Download className="h-3.5 w-3.5" />
                        下载更新
                      </button>
                    </div>
                  )}
                  {updateStatus.state === "downloading" && (
                    <div>
                      <div className="mb-2 flex justify-between">
                        <span>正在下载更新</span>
                        <span>{Math.round(updateStatus.percent ?? 0)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded bg-zinc-800">
                        <div
                          className="h-full bg-cyan-400 transition-[width]"
                          style={{
                            width: `${Math.min(100, Math.max(0, updateStatus.percent ?? 0))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {updateStatus.state === "downloaded" && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-emerald-300">
                        更新已下载，重启后安装
                      </span>
                      <button
                        onClick={installUpdate}
                        className="flex h-8 items-center gap-2 rounded bg-emerald-400 px-3 font-semibold text-zinc-950"
                      >
                        立即安装
                      </button>
                    </div>
                  )}
                  {updateStatus.state === "error" && (
                    <span className="flex items-center gap-2 text-rose-300">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {updateStatus.message ?? "更新失败"}
                    </span>
                  )}
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
