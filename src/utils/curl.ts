import type { KeyValueItem, RequestDefinition } from "@/shared/ipc-contracts";

export interface ParsedCurlCommand {
  name: string;
  method: NonNullable<RequestDefinition["method"]>;
  protocol: RequestDefinition["protocol"];
  url: string;
  params: KeyValueItem[];
  headers: KeyValueItem[];
  bodyType?: RequestDefinition["bodyType"];
  body?: string;
  formFields?: NonNullable<RequestDefinition["formFields"]>;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isHttpUrl(value: string) {
  return /^[a-zA-Z][\w+.-]*:/.test(value.trim());
}

function buildRequestUrl(url: string, params: KeyValueItem[]) {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return trimmedUrl;
  try {
    const parsed = isHttpUrl(trimmedUrl)
      ? new URL(trimmedUrl)
      : new URL(trimmedUrl, "http://localhost");
    params
      .filter((item) => item.enabled && item.key.trim())
      .forEach((item) => {
        parsed.searchParams.append(item.key, item.value);
      });
    return isHttpUrl(trimmedUrl)
      ? parsed.toString()
      : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmedUrl;
  }
}

function buildBodyParts(request: RequestDefinition) {
  const bodyType = request.bodyType ?? "json";
  const enabledFormFields =
    request.formFields?.filter((item) => item.enabled && item.key.trim()) ?? [];
  if (bodyType === "form-urlencoded" && enabledFormFields.length > 0) {
    return enabledFormFields.map(
      (item) =>
        `--data-urlencode ${shellQuote(`${item.key}=${item.value}`)}`,
    );
  }
  if (bodyType === "multipart" && enabledFormFields.length > 0) {
    return enabledFormFields.map((item) => {
      if (item.kind === "file") {
        const fileValue = item.value.trim().replace(/^@/, "") || "/path/to/file";
        return `-F ${shellQuote(`${item.key}=@${fileValue}`)}`;
      }
      return `-F ${shellQuote(`${item.key}=${item.value}`)}`;
    });
  }
  if ((request.body ?? "").trim()) {
    return [`--data-raw ${shellQuote(request.body ?? "")}`];
  }
  return [];
}

export function buildCurlCommand(request: RequestDefinition) {
  const method = request.method ?? "GET";
  const url = buildRequestUrl(request.url, request.params ?? []);
  const parts = [`curl -X ${method} ${shellQuote(url || request.url)}`];
  (request.headers ?? [])
    .filter((item) => item.enabled && item.key.trim())
    .forEach((item) => {
      const key = item.key;
      const value = item.value;
      parts.push(`-H ${shellQuote(`${key}: ${value}`)}`);
    });
  if (method !== "GET" && method !== "HEAD") {
    parts.push(...buildBodyParts(request));
  }
  return parts.join(" \\\n  ");
}

function unquoteCurlValue(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    const inner = trimmed.slice(1, -1);
    if (trimmed.startsWith("'")) return inner.replace(/'\\''/g, "'");
    return inner.replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return trimmed;
}

function parseCurlArgs(value: string) {
  const normalized = value
    .replace(/(?:\\|\^)\r?\n/g, " ")
    .replace(/\r?\n/g, " ");
  const args: Array<{ flag: string; value: string }> = [];
  const pattern =
    /(?:^|\s)(-X|--request|-H|--header|-d|--data|--data-raw|--data-binary|--data-urlencode|-F|--form|--form-string)\s+((?:'[^']*(?:'\\''[^']*)*')|(?:"(?:[^"\\]|\\.)*")|[^\s]+)/g;
  for (const match of normalized.matchAll(pattern)) {
    args.push({ flag: match[1], value: unquoteCurlValue(match[2] ?? "") });
  }
  return { normalized, args };
}

export function parseCurlCommand(value: string): ParsedCurlCommand | undefined {
  if (!/\bcurl\b/i.test(value)) return undefined;
  const { normalized, args } = parseCurlArgs(value);
  const url = normalized.match(/https?:\/\/[^\s'"\\]+/i)?.[0];
  if (!url) return undefined;
  const methodMatch = args.find((item) => item.flag === "-X" || item.flag === "--request");
  const headers = args
    .filter((item) => item.flag === "-H" || item.flag === "--header")
    .map((item, index) => {
      const [key, ...valueParts] = item.value.split(":");
      return {
        id: `curl-header-${index}`,
        key: key.trim(),
        value: valueParts.join(":").trim(),
        enabled: true,
      };
    })
    .filter((item) => item.key);
  const dataUrlencode = args.filter((item) => item.flag === "--data-urlencode");
  const formFields = args.filter((item) =>
    item.flag === "-F" || item.flag === "--form" || item.flag === "--form-string",
  );
  const bodyMatch = args.find((item) =>
    item.flag === "-d" ||
    item.flag === "--data" ||
    item.flag === "--data-raw" ||
    item.flag === "--data-binary",
  );
  let bodyType: RequestDefinition["bodyType"] | undefined;
  let body: string | undefined;
  let nextFormFields: NonNullable<RequestDefinition["formFields"]> | undefined;
  if (formFields.length > 0) {
    bodyType = "multipart";
    nextFormFields = formFields.map((item, index) => {
      const raw = item.value;
      const fileMatch = raw.match(/^([^=]+)=@(.+)$/);
      if (fileMatch)
        return {
          id: `curl-form-${index}`,
          key: fileMatch[1].trim(),
          value: fileMatch[2].trim(),
          kind: "file" as const,
          enabled: true,
        };
      const textMatch = raw.match(/^([^=]+)=(.*)$/);
      return {
        id: `curl-form-${index}`,
        key: (textMatch?.[1] ?? raw).trim(),
        value: textMatch?.[2] ?? "",
        kind: "text" as const,
        enabled: true,
      };
    });
  } else if (dataUrlencode.length > 0) {
    bodyType = "form-urlencoded";
    nextFormFields = dataUrlencode.map((item, index) => {
      const raw = item.value;
      const eqIndex = raw.indexOf("=");
      return {
        id: `curl-form-${index}`,
        key: eqIndex >= 0 ? raw.slice(0, eqIndex).trim() : raw.trim(),
        value: eqIndex >= 0 ? raw.slice(eqIndex + 1) : "",
        kind: "text" as const,
        enabled: true,
      };
    });
  } else if (bodyMatch) {
    body = bodyMatch.value;
    bodyType = bodyMatch.flag === "-d" || bodyMatch.flag === "--data"
      ? undefined
      : "json";
  }
  const parsed = new URL(url);
  const params = Array.from(parsed.searchParams.entries()).map(
    ([key, value], index) => ({
      id: `curl-param-${index}`,
      key,
      value,
      enabled: true,
    }),
  );
  parsed.search = "";
  parsed.hash = "";
  const inferredMethod = (methodMatch?.value?.toUpperCase() ??
    (bodyMatch || dataUrlencode.length > 0 || formFields.length > 0
      ? "POST"
      : "GET")) as NonNullable<RequestDefinition["method"]>;
  return {
    name: `${inferredMethod} ${parsed.pathname || "/"}`,
    method: inferredMethod,
    protocol: "http",
    url: parsed.toString(),
    params,
    headers,
    bodyType,
    body,
    formFields: nextFormFields,
  };
}
