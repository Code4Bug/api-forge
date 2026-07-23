import type {
  HttpFieldItem,
  HttpMethod,
  HttpSendRequest,
  RequestDefinition,
} from "./ipc-contracts.js";

export interface HttpRequestInput {
  method: HttpMethod;
  url: string;
  params?: HttpFieldItem[];
  headers?: HttpFieldItem[];
  body?: string;
  bodyType?: RequestDefinition["bodyType"];
  formFields?: NonNullable<RequestDefinition["formFields"]>;
}

export function replaceTemplateVariables(
  value: string,
  variables: Record<string, string>,
): string {
  return value.replace(
    /\{\{([^{}]+)\}\}/g,
    (match, key: string) => variables[key] ?? match,
  );
}

export function resolveHttpFields(
  fields: HttpFieldItem[] | undefined,
  variables: Record<string, string>,
): HttpFieldItem[] {
  return (fields ?? [])
    .filter((item) => item.enabled && item.key.trim())
    .map((item) => ({
      ...item,
      key: replaceTemplateVariables(item.key, variables),
      value: replaceTemplateVariables(item.value, variables),
    }));
}

export function buildHttpSendRequest(
  input: HttpRequestInput,
  variables: Record<string, string>,
): HttpSendRequest {
  const params = resolveHttpFields(input.params, variables);
  const headers = Object.fromEntries(
    resolveHttpFields(input.headers, variables).map((item: HttpFieldItem) => [
      item.key,
      item.value,
    ]),
  );
  const formFields = (input.formFields ?? [])
    .filter((item) => item.enabled && item.key.trim())
    .map((item: NonNullable<RequestDefinition["formFields"]>[number]) => ({
      ...item,
      key: replaceTemplateVariables(item.key, variables),
      value: replaceTemplateVariables(item.value, variables),
    }));
  const body =
    input.method === "GET" || input.method === "HEAD"
      ? undefined
      : input.bodyType === "form-urlencoded"
        ? new URLSearchParams(
            formFields
              .filter((item) => item.kind === "text")
              .map((item) => [item.key, item.value] as [string, string]),
          ).toString()
        : input.bodyType === "multipart"
          ? undefined
          : input.body
            ? replaceTemplateVariables(input.body, variables)
            : undefined;

  return {
    method: input.method,
    url: replaceTemplateVariables(input.url, variables),
    params,
    headers,
    body,
    bodyType: input.bodyType,
    formFields,
  };
}

export function buildFetchBody(
  request: Pick<
    HttpSendRequest,
    "method" | "body" | "bodyType" | "formFields"
  >,
  readFileFromPath?: (path: string) => Promise<Uint8Array | ArrayBuffer>,
): URLSearchParams | FormData | string | undefined | Promise<URLSearchParams | FormData | string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  if (request.bodyType === "form-urlencoded") {
    return new URLSearchParams(
      (request.formFields ?? [])
        .filter((item) => item.enabled && item.kind === "text" && item.key.trim())
        .map((item: NonNullable<HttpSendRequest["formFields"]>[number]) => [item.key, item.value] as [string, string]),
    );
  }
  if (request.bodyType === "multipart") {
    const formData = new FormData();
    return (async () => {
      for (const item of (request.formFields ?? []).filter(
        (field) => field.enabled && field.key.trim(),
      )) {
        if (item.kind === "file") {
          const filePath = item.value.replace(/^@/, "").trim();
          const fileName = filePath.split(/[/\\]/).pop() || "file";
          if (!filePath) continue;
          if (!readFileFromPath) {
            throw new Error("multipart 文件字段缺少文件读取器");
          }
          const content = await readFileFromPath(filePath);
          formData.append(item.key, new Blob([content]), fileName);
          continue;
        }
        formData.append(item.key, item.value);
      }
      return formData;
    })();
  }
  return request.body;
}

export function buildFetchHeaders(
  request: Pick<HttpSendRequest, "headers" | "bodyType">,
) {
  const headers = { ...(request.headers ?? {}) };
  if (request.bodyType === "multipart") {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "content-type") delete headers[key];
    }
  }
  return headers;
}

export function buildFetchUrl(
  request: Pick<HttpSendRequest, "url" | "params">,
) {
  const trimmedUrl = request.url.trim();
  if (!trimmedUrl) return trimmedUrl;
  try {
    const parsed = new URL(trimmedUrl, "http://localhost");
    (request.params ?? [])
      .filter((item) => item.enabled && item.key.trim())
      .forEach((item: HttpFieldItem) => {
        parsed.searchParams.set(item.key, item.value);
      });
    return parsed.toString().replace("http://localhost", "");
  } catch {
    return trimmedUrl;
  }
}
