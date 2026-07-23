import type { KeyValueItem, RequestDefinition } from "@/shared/ipc-contracts";

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
        const fileValue = item.value.trim() || "/path/to/file";
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
  const headers = (request.headers ?? [])
    .filter((item) => item.enabled && item.key.trim());
  headers.forEach((item) => {
    parts.push(`-H ${shellQuote(`${item.key}: ${item.value}`)}`);
  });
  if (method !== "GET" && method !== "HEAD") {
    parts.push(...buildBodyParts(request));
  }
  return parts.join(" \\\n  ");
}
