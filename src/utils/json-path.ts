export type JsonPathResult =
  { ok: true; value: unknown } | { ok: false; error: string };

export interface JsonPathCursor {
  cursorOffset: number;
}

interface JsonPathNode {
  path: string;
  start: number;
  end: number;
  children: JsonPathNode[];
}

function buildJsonPath(basePath: string, key: string) {
  if (/^[A-Za-z_$][\w$-]*$/.test(key)) return `${basePath}.${key}`;
  return `${basePath}[${JSON.stringify(key)}]`;
}

function skipJsonWhitespace(source: string, offset: number) {
  let current = offset;
  while (current < source.length && /\s/.test(source[current] ?? ""))
    current += 1;
  return current;
}

function parseJsonString(source: string, offset: number) {
  if (source[offset] !== '"') return undefined;
  let current = offset + 1;
  while (current < source.length) {
    const char = source[current];
    if (char === "\\") {
      current += 2;
      continue;
    }
    if (char === '"')
      return {
        value: JSON.parse(source.slice(offset, current + 1)) as string,
        start: offset,
        end: current,
        nextOffset: current + 1,
      };
    current += 1;
  }
  return undefined;
}

function parseJsonPrimitive(source: string, offset: number) {
  const match =
    /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y.exec(
      source.slice(offset),
    );
  if (!match) return undefined;
  return {
    value: JSON.parse(match[0]) as unknown,
    start: offset,
    end: offset + match[0].length - 1,
    nextOffset: offset + match[0].length,
  };
}

function parseJsonValue(
  source: string,
  offset: number,
  path: string,
): { node: JsonPathNode; nextOffset: number } | undefined {
  const current = skipJsonWhitespace(source, offset);
  const char = source[current];
  if (char === "{") return parseJsonObject(source, current, path);
  if (char === "[") return parseJsonArray(source, current, path);
  if (char === '"') {
    const parsed = parseJsonString(source, current);
    if (!parsed) return undefined;
    return {
      node: { path, start: parsed.start, end: parsed.end, children: [] },
      nextOffset: parsed.nextOffset,
    };
  }
  const primitive = parseJsonPrimitive(source, current);
  if (!primitive) return undefined;
  return {
    node: { path, start: primitive.start, end: primitive.end, children: [] },
    nextOffset: primitive.nextOffset,
  };
}

function parseJsonObject(
  source: string,
  offset: number,
  path: string,
): { node: JsonPathNode; nextOffset: number } | undefined {
  let current = offset + 1;
  const children: JsonPathNode[] = [];
  current = skipJsonWhitespace(source, current);
  if (source[current] === "}")
    return {
      node: { path, start: offset, end: current, children },
      nextOffset: current + 1,
    };
  while (current < source.length) {
    const key = parseJsonString(source, current);
    if (!key) return undefined;
    current = skipJsonWhitespace(source, key.nextOffset);
    if (source[current] !== ":") return undefined;
    current = skipJsonWhitespace(source, current + 1);
    const propertyPath = buildJsonPath(path, key.value);
    const value = parseJsonValue(source, current, propertyPath);
    if (!value) return undefined;
    children.push({
      path: propertyPath,
      start: key.start,
      end: value.node.end,
      children: [value.node],
    });
    current = skipJsonWhitespace(source, value.nextOffset);
    if (source[current] === ",") {
      current = skipJsonWhitespace(source, current + 1);
      continue;
    }
    if (source[current] === "}")
      return {
        node: { path, start: offset, end: current, children },
        nextOffset: current + 1,
      };
    return undefined;
  }
  return undefined;
}

function parseJsonArray(
  source: string,
  offset: number,
  path: string,
): { node: JsonPathNode; nextOffset: number } | undefined {
  let current = offset + 1;
  const children: JsonPathNode[] = [];
  current = skipJsonWhitespace(source, current);
  if (source[current] === "]")
    return {
      node: { path, start: offset, end: current, children },
      nextOffset: current + 1,
    };
  let index = 0;
  while (current < source.length) {
    const itemPath = `${path}[${index}]`;
    const value = parseJsonValue(source, current, itemPath);
    if (!value) return undefined;
    children.push(value.node);
    current = skipJsonWhitespace(source, value.nextOffset);
    if (source[current] === ",") {
      current = skipJsonWhitespace(source, current + 1);
      index += 1;
      continue;
    }
    if (source[current] === "]")
      return {
        node: { path, start: offset, end: current, children },
        nextOffset: current + 1,
      };
    return undefined;
  }
  return undefined;
}

function findJsonNodeAtOffset(node: JsonPathNode, offset: number) {
  if (offset < node.start || offset > node.end) return undefined;
  for (const child of node.children) {
    const match = findJsonNodeAtOffset(child, offset);
    if (match) return match;
  }
  return node;
}

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

export function findJsonPathAtOffset(
  source: string,
  cursorOffset: number,
): string | undefined {
  const parsed = parseJsonValue(source, 0, "$");
  if (!parsed) return undefined;
  const node = findJsonNodeAtOffset(parsed.node, cursorOffset);
  return node?.path;
}

export function stringifyProcessVariableValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  return JSON.stringify(value) ?? String(value);
}
