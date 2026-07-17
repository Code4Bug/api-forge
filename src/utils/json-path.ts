export type JsonPathResult =
  { ok: true; value: unknown } | { ok: false; error: string };

export function extractJsonPath(root: unknown, path: string): JsonPathResult {
  const normalizedPath = path.trim();
  if (!normalizedPath.startsWith("$"))
    return { ok: false, error: "JSONPath 必须以 $ 开头" };
  if (normalizedPath === "$") return { ok: true, value: root };

  const tokenPattern =
    /(?:\.([A-Za-z_$][\w$-]*)|\[(\d+)\]|\["([^"]+)"\]|\['([^']+)'\])/gy;
  tokenPattern.lastIndex = 1;
  const tokens: Array<string | number> = [];

  while (tokenPattern.lastIndex < normalizedPath.length) {
    const start = tokenPattern.lastIndex;
    const match = tokenPattern.exec(normalizedPath);
    if (!match || match.index !== start)
      return { ok: false, error: `不支持的 JSONPath：${normalizedPath}` };
    tokens.push(match[1] ?? match[3] ?? match[4] ?? Number(match[2]));
  }

  let current = root;
  for (const token of tokens) {
    if (
      current === null ||
      typeof current !== "object" ||
      !(token in current)
    ) {
      return { ok: false, error: `响应中不存在路径：${normalizedPath}` };
    }
    current = (current as Record<string | number, unknown>)[token];
  }
  return { ok: true, value: current };
}

export function stringifyProcessVariableValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  return JSON.stringify(value) ?? String(value);
}
