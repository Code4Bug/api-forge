import type {
  HttpMethod,
  KeyValueItem,
  Protocol,
  RequestDefinition,
} from "@/shared/ipc-contracts";
import { parseCurlCommand } from "./curl.ts";

export interface ImportedApiRequest {
  name: string;
  description?: string;
  protocol: Protocol;
  method?: HttpMethod;
  url: string;
  params: KeyValueItem[];
  headers: KeyValueItem[];
  body?: string;
  bodyType?: RequestDefinition["bodyType"];
  formFields?: NonNullable<RequestDefinition["formFields"]>;
}

export interface ParsedApiImport {
  source: "curl" | "postman" | "openapi" | "swagger";
  sourceLabel: string;
  items: ImportedApiRequest[];
}

function normalizeImportText(value: string) {
  return value.replace(/^\uFEFF/, "").trim();
}

function createKeyValueItem(
  id: string,
  key: string,
  value: string,
): KeyValueItem {
  return { id, key, value, enabled: true };
}

function toPostmanRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function normalizePostmanKeyValueItems(
  value: unknown,
  itemPrefix: string,
  index: number,
) {
  const list = Array.isArray(value) ? value : [];
  return list
    .filter((entry) => {
      const record = toPostmanRecord(entry);
      return (
        !!record &&
        record.disabled !== true &&
        typeof record.key === "string" &&
        record.key.trim().length > 0
      );
    })
    .map((entry, itemIndex) => {
      const record = toPostmanRecord(entry)!;
      return createKeyValueItem(
        `${itemPrefix}-${index}-${itemIndex}`,
        String(record.key).trim(),
        valueToText(record.value),
      );
    });
}

function buildPostmanAuthHeaders(auth: unknown, index: number) {
  const record = toPostmanRecord(auth);
  if (!record) return [];

  const type = typeof record.type === "string" ? record.type.trim().toLowerCase() : "";
  if (type === "bearer") {
    const bearerValue = Array.isArray(record.bearer)
      ? record.bearer.find((entry) => {
          const item = toPostmanRecord(entry);
          return item && typeof item.value === "string" && item.value.trim();
        })
      : toPostmanRecord(record.bearer);
    const token = bearerValue ? String(bearerValue.value ?? "").trim() : "";
    if (!token) return [];
    return [
      createKeyValueItem(
        `import-postman-auth-${index}-0`,
        "Authorization",
        `Bearer ${token}`,
      ),
    ];
  }

  return [];
}

function buildPostmanContentTypeHeader(body: Record<string, unknown> | undefined) {
  if (!body || typeof body !== "object") return undefined;
  const mode = typeof body.mode === "string" ? body.mode : "";
  if (mode === "urlencoded") return "application/x-www-form-urlencoded";
  if (mode === "formdata") return undefined;
  if (mode !== "raw") return undefined;

  const rawOptions = toPostmanRecord(body.options)?.raw;
  const language =
    rawOptions && typeof rawOptions === "object"
      ? String(toPostmanRecord(rawOptions)?.language ?? "").toLowerCase()
      : "";
  if (language === "json") return "application/json";
  if (language === "xml") return "application/xml";
  if (language === "html") return "text/html";
  if (language === "javascript") return "application/javascript";
  if (language === "text") return "text/plain";
  return undefined;
}

function buildUrlFromPostmanUrl(url: unknown) {
  if (typeof url === "string") return url.trim();
  if (!url || typeof url !== "object") return "";
  const record = url as Record<string, unknown>;
  if (typeof record.raw === "string" && record.raw.trim()) return record.raw.trim();
  const protocol = typeof record.protocol === "string" ? record.protocol : "";
  const host = Array.isArray(record.host)
    ? record.host.filter((item) => typeof item === "string").join(".")
    : "";
  const port = typeof record.port === "string" || typeof record.port === "number"
    ? String(record.port)
    : "";
  const path = Array.isArray(record.path)
    ? record.path.filter((item) => typeof item === "string").join("/")
    : "";
  const prefix = protocol ? `${protocol}://` : "";
  const hostPart = host || "";
  const portPart = port ? `:${port}` : "";
  const pathPart = path ? `/${path.replace(/^\/+/, "")}` : "";
  return `${prefix}${hostPart}${portPart}${pathPart}`.trim();
}

function toHttpMethod(value: unknown): HttpMethod | undefined {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return (
    ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].find(
      (item) => item === normalized,
    ) as HttpMethod | undefined
  );
}

function parseQueryLikeValue(value: unknown, index: number) {
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const searchParams = new URLSearchParams(trimmed);
    const entries = Array.from(searchParams.entries());
    if (entries.length > 0 && trimmed.includes("=")) {
      return entries.map(([key, itemValue], itemIndex) =>
        createKeyValueItem(
          `import-param-${index}-${itemIndex}`,
          key,
          itemValue,
        ),
      );
    }
  } catch {
    // 忽略非查询串格式
  }
  const eqIndex = trimmed.indexOf("=");
  return [
    createKeyValueItem(
      `import-param-${index}`,
      eqIndex >= 0 ? trimmed.slice(0, eqIndex).trim() : trimmed,
      eqIndex >= 0 ? trimmed.slice(eqIndex + 1) : "",
    ),
  ].filter((item) => item.key);
}

function getOpenApiComponent(
  document: Record<string, unknown> | undefined,
  ref: string,
): unknown {
  if (!document || !ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/").filter(Boolean);
  let current: unknown = document;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveOpenApiSchema(
  schema: unknown,
  document: Record<string, unknown> | undefined,
  seenRefs = new Set<string>(),
): unknown {
  if (!schema || typeof schema !== "object") return schema;
  const record = schema as Record<string, unknown>;
  if (typeof record.$ref === "string") {
    const ref = record.$ref;
    if (seenRefs.has(ref)) return undefined;
    const resolved = getOpenApiComponent(document, ref);
    if (resolved === undefined) return undefined;
    seenRefs.add(ref);
    return resolveOpenApiSchema(resolved, document, seenRefs);
  }
  return schema;
}

function exampleFromSchema(
  schema: unknown,
  document?: Record<string, unknown>,
): unknown {
  const resolved = resolveOpenApiSchema(schema, document);
  if (!resolved || typeof resolved !== "object") return undefined;
  const record = resolved as Record<string, unknown>;
  if (record.example !== undefined) return record.example;
  if (record.default !== undefined) return record.default;
  if (Array.isArray(record.enum) && record.enum.length > 0)
    return record.enum[0];
  if (Array.isArray(record.oneOf) && record.oneOf.length > 0)
    return exampleFromSchema(record.oneOf[0]);
  if (Array.isArray(record.anyOf) && record.anyOf.length > 0)
    return exampleFromSchema(record.anyOf[0]);
  if (Array.isArray(record.allOf) && record.allOf.length > 0)
    return exampleFromSchema(record.allOf[0]);

  const type = typeof record.type === "string" ? record.type : "";
  if (type === "object" || record.properties) {
    const properties =
      record.properties && typeof record.properties === "object"
        ? (record.properties as Record<string, unknown>)
        : {};
    const result: Record<string, unknown> = {};
    for (const [key, childSchema] of Object.entries(properties)) {
      const child = exampleFromSchema(childSchema, document);
      if (child !== undefined) result[key] = child;
    }
    return result;
  }
  if (type === "array" || record.items) {
    const item = exampleFromSchema(record.items, document);
    return item === undefined ? [] : [item];
  }
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return true;
  if (type === "string") return "string";
  return undefined;
}

function valueToText(value: unknown) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}

function buildFormFieldsFromObject(
  value: unknown,
  kind: "text" | "file" = "text",
): NonNullable<RequestDefinition["formFields"]> {
  if (!value) return [];
  if (typeof value === "string") {
    return parseQueryLikeValue(value, 0).map((item) => ({
      id: item.id,
      key: item.key,
      value: item.value,
      kind,
      enabled: true,
    }));
  }
  if (typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).map(
    ([key, itemValue], index) => ({
      id: `import-form-${index}`,
      key,
      value: valueToText(itemValue),
      kind,
      enabled: true,
    }),
  );
}

function buildPostmanRequest(
  item: Record<string, unknown>,
  parents: string[],
  index: number,
): ImportedApiRequest | undefined {
  const request = item.request as Record<string, unknown> | undefined;
  if (!request) return undefined;
  const requestName = typeof item.name === "string" && item.name.trim()
    ? item.name.trim()
    : typeof request.method === "string" && request.method.trim()
      ? request.method.trim().toUpperCase()
      : "未命名接口";
  const name = [...parents, requestName].filter(Boolean).join(" / ");
  const urlValue = buildUrlFromPostmanUrl(request.url);
  const query =
    request.url && typeof request.url === "object"
      ? (request.url as Record<string, unknown>).query
      : undefined;
  const params = Array.isArray(query)
    ? query
        .filter(
          (entry) => {
            if (!entry || typeof entry !== "object") return false;
            const record = entry as Record<string, unknown>;
            return (
              record.disabled !== true &&
              typeof record.key === "string" &&
              record.key.trim().length > 0
            );
          },
        )
        .map((entry, paramIndex) =>
          createKeyValueItem(
            `import-postman-param-${index}-${paramIndex}`,
            String((entry as Record<string, unknown>).key).trim(),
            valueToText((entry as Record<string, unknown>).value),
          ),
        )
    : [];
  const explicitHeaders = [
    ...normalizePostmanKeyValueItems(request.header, "import-postman-header", index),
    ...normalizePostmanKeyValueItems(request.headers, "import-postman-header-alt", index),
  ];
  const authHeaders = buildPostmanAuthHeaders(request.auth, index);
  const headers = [...explicitHeaders];
  for (const header of authHeaders) {
    const exists = headers.some(
      (item) => item.key.toLowerCase() === header.key.toLowerCase(),
    );
    if (!exists) headers.push(header);
  }
  const body = toPostmanRecord(request.body);
  const contentType = buildPostmanContentTypeHeader(body);
  if (contentType) {
    const hasContentType = headers.some(
      (item) => item.key.toLowerCase() === "content-type",
    );
    if (!hasContentType) {
      headers.push(
        createKeyValueItem(
          `import-postman-header-${index}-content-type`,
          "Content-Type",
          contentType,
        ),
      );
    }
  }
  const mode = typeof body?.mode === "string" ? body.mode : "";
  if (mode === "urlencoded") {
    return {
      name,
      description: typeof item.description === "string" ? item.description : undefined,
      protocol: "http",
      method: toHttpMethod(request.method) ?? "GET",
      url: urlValue,
      params,
      headers,
      bodyType: "form-urlencoded",
      formFields: Array.isArray(body.urlencoded)
        ? normalizePostmanKeyValueItems(body.urlencoded, "import-postman-form", index).map((item) => ({
            id: item.id,
            key: item.key,
            value: item.value,
            kind: "text" as const,
            enabled: item.enabled,
          }))
        : [],
    };
  }
  if (mode === "formdata") {
    return {
      name,
      description: typeof item.description === "string" ? item.description : undefined,
      protocol: "http",
      method: toHttpMethod(request.method) ?? "GET",
      url: urlValue,
      params,
      headers,
      bodyType: "multipart",
      formFields: Array.isArray(body.formdata)
        ? (body.formdata as unknown[])
            .filter((field) => {
              const record = toPostmanRecord(field);
              return (
                !!record &&
                record.disabled !== true &&
                typeof record.key === "string" &&
                String(record.key).trim().length > 0
              );
            })
            .map((field, fieldIndex) => {
              const record = toPostmanRecord(field)!;
              return {
                id: `import-postman-form-${index}-${fieldIndex}`,
                key: String(record.key).trim(),
                value:
                  typeof record.src === "string"
                    ? String(record.src)
                    : valueToText(record.value),
                kind:
                  record.type === "file" ? ("file" as const) : ("text" as const),
                enabled: true,
              };
            })
        : [],
    };
  }
  if (mode === "raw") {
    const raw = body?.raw;
    const language = body?.options &&
      typeof body.options === "object" &&
      typeof (body.options as Record<string, unknown>).raw === "object"
      ? String(
          ((body.options as Record<string, unknown>).raw as Record<string, unknown>)
            .language ?? "",
        )
      : "";
    return {
      name,
      description: typeof item.description === "string" ? item.description : undefined,
      protocol: "http",
      method: toHttpMethod(request.method) ?? "GET",
      url: urlValue,
      params,
      headers,
      body: typeof raw === "string" ? raw : valueToText(raw),
      bodyType:
        language === "json"
          ? "json"
          : language === "xml"
            ? "xml"
            : language === "html"
              ? "html"
              : language === "javascript"
                ? "javascript"
                : language === "text"
                  ? "text"
                  : undefined,
    };
  }
  if (mode === "file") {
    return {
      name,
      description: typeof item.description === "string" ? item.description : undefined,
      protocol: "http",
      method: toHttpMethod(request.method) ?? "GET",
      url: urlValue,
      params,
      headers,
      bodyType: "multipart",
      formFields: [
        {
          id: `import-postman-form-${index}-0`,
          key: "file",
          value:
            typeof body?.file === "object" && body.file && "src" in body.file
              ? valueToText((body.file as Record<string, unknown>).src)
              : "",
          kind: "file",
          enabled: true,
        },
      ],
    };
  }
  return {
    name,
    description: typeof item.description === "string" ? item.description : undefined,
    protocol: "http",
    method: toHttpMethod(request.method) ?? "GET",
    url: urlValue,
    params,
    headers,
    body:
      typeof body?.raw === "string"
        ? body.raw
        : typeof request.url === "string"
          ? ""
          : undefined,
  };
}

function buildOpenApiRequest(
  method: string,
  path: string,
  operation: Record<string, unknown>,
  servers: unknown,
  document: Record<string, unknown> | undefined,
  index: number,
): ImportedApiRequest {
  const serverList = Array.isArray(servers) ? servers : [];
  const serverUrl =
    serverList.length > 0 && serverList[0] && typeof serverList[0] === "object"
      ? String((serverList[0] as Record<string, unknown>).url ?? "").trim()
      : "";
  const basePath = serverUrl || "";
  const replacedPath = path.replace(/\{([^}]+)\}/g, (match, key) => {
    const parameters = Array.isArray(operation.parameters)
      ? operation.parameters
      : [];
    const parameter = parameters.find(
      (item) =>
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).in === "path" &&
        (item as Record<string, unknown>).name === key,
    ) as Record<string, unknown> | undefined;
    const schema =
      parameter && typeof parameter.schema === "object"
        ? resolveOpenApiSchema(parameter.schema, document)
        : undefined;
    const value =
      parameter?.example ??
      parameter?.default ??
      (schema ? exampleFromSchema(schema, document) : undefined);
    return value === undefined || value === null ? match : String(value);
  });
  const url = basePath
    ? `${basePath.replace(/\/+$/, "")}${replacedPath.startsWith("/") ? "" : "/"}${replacedPath}`
    : replacedPath;
  const parameters = Array.isArray(operation.parameters)
    ? operation.parameters
    : [];
  const params = parameters
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).in === "query",
    )
    .map((item, paramIndex) => {
      const record = item as Record<string, unknown>;
      const schema = record.schema && typeof record.schema === "object"
        ? (record.schema as Record<string, unknown>)
        : undefined;
      return createKeyValueItem(
        `import-openapi-param-${index}-${paramIndex}`,
        String(record.name ?? "").trim(),
        valueToText(
          record.example ??
            record.default ??
            (schema ? exampleFromSchema(schema, document) : undefined),
        ),
      );
    })
    .filter((item) => item.key);
  const headers = parameters
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).in === "header",
    )
    .map((item, headerIndex) => {
      const record = item as Record<string, unknown>;
      const schema = record.schema && typeof record.schema === "object"
        ? (record.schema as Record<string, unknown>)
        : undefined;
      return createKeyValueItem(
        `import-openapi-header-${index}-${headerIndex}`,
        String(record.name ?? "").trim(),
        valueToText(
          record.example ??
            record.default ??
            (schema ? exampleFromSchema(schema, document) : undefined),
        ),
      );
    })
    .filter((item) => item.key);

  const content =
    operation.requestBody &&
    typeof operation.requestBody === "object" &&
    (operation.requestBody as Record<string, unknown>).content &&
    typeof (operation.requestBody as Record<string, unknown>).content === "object"
      ? (operation.requestBody as Record<string, unknown>).content as Record<
          string,
          unknown
        >
      : undefined;
  const contentEntries = content ? Object.entries(content) : [];
  const normalizedContentType = (target: string) =>
    contentEntries.find(([key]) => key === target) ??
    contentEntries.find(([key]) => key.endsWith("+json") && target === "application/json") ??
    contentEntries.find(([key]) => key.includes("json") && target === "application/json") ??
    contentEntries.find(([key]) => key === target.replace(/^application\//, "text/"));
  const matched = normalizedContentType("application/json")
    ?? normalizedContentType("application/x-www-form-urlencoded")
    ?? normalizedContentType("multipart/form-data")
    ?? normalizedContentType("text/plain")
    ?? normalizedContentType("application/xml")
    ?? normalizedContentType("text/xml")
    ?? normalizedContentType("text/html");
  const contentType = matched?.[0] ?? "";
  const contentValue =
    matched && matched[1] && typeof matched[1] === "object"
      ? (matched[1] as Record<string, unknown>)
      : undefined;
  const example =
    contentValue?.example ??
    (contentValue?.examples && typeof contentValue.examples === "object"
      ? Object.values(contentValue.examples as Record<string, unknown>)[0]
      : undefined) ??
    (contentValue?.schema ? exampleFromSchema(contentValue.schema, document) : undefined);

  if (contentType === "application/x-www-form-urlencoded") {
    return {
      name:
        typeof operation.summary === "string" && operation.summary.trim()
          ? operation.summary.trim()
          : `${method.toUpperCase()} ${path}`,
      description:
        typeof operation.description === "string"
          ? operation.description
          : undefined,
      protocol: "http",
      method: toHttpMethod(method) ?? "GET",
      url,
      params,
      headers,
      bodyType: "form-urlencoded",
      formFields: buildFormFieldsFromObject(example),
    };
  }
  if (contentType === "multipart/form-data") {
    return {
      name:
        typeof operation.summary === "string" && operation.summary.trim()
          ? operation.summary.trim()
          : `${method.toUpperCase()} ${path}`,
      description:
        typeof operation.description === "string"
          ? operation.description
          : undefined,
      protocol: "http",
      method: toHttpMethod(method) ?? "GET",
      url,
      params,
      headers,
      bodyType: "multipart",
      formFields: buildFormFieldsFromObject(example),
    };
  }
  if (contentType === "application/xml" || contentType === "text/xml") {
    return {
      name:
        typeof operation.summary === "string" && operation.summary.trim()
          ? operation.summary.trim()
          : `${method.toUpperCase()} ${path}`,
      description:
        typeof operation.description === "string"
          ? operation.description
          : undefined,
      protocol: "http",
      method: toHttpMethod(method) ?? "GET",
      url,
      params,
      headers,
      body: valueToText(example),
      bodyType: "xml",
    };
  }
  if (contentType === "text/html") {
    return {
      name:
        typeof operation.summary === "string" && operation.summary.trim()
          ? operation.summary.trim()
          : `${method.toUpperCase()} ${path}`,
      description:
        typeof operation.description === "string"
          ? operation.description
          : undefined,
      protocol: "http",
      method: toHttpMethod(method) ?? "GET",
      url,
      params,
      headers,
      body: valueToText(example),
      bodyType: "html",
    };
  }
  if (contentType === "text/plain") {
    return {
      name:
        typeof operation.summary === "string" && operation.summary.trim()
          ? operation.summary.trim()
          : `${method.toUpperCase()} ${path}`,
      description:
        typeof operation.description === "string"
          ? operation.description
          : undefined,
      protocol: "http",
      method: toHttpMethod(method) ?? "GET",
      url,
      params,
      headers,
      body: valueToText(example),
      bodyType: "text",
    };
  }
  return {
    name:
      typeof operation.summary === "string" && operation.summary.trim()
        ? operation.summary.trim()
        : `${method.toUpperCase()} ${path}`,
    description:
      typeof operation.description === "string"
        ? operation.description
        : undefined,
    protocol: "http",
    method: toHttpMethod(method) ?? "GET",
    url,
    params,
    headers,
    body:
      example === undefined
        ? undefined
        : typeof example === "string"
          ? example
          : JSON.stringify(example, null, 2),
    bodyType:
      example && typeof example === "object" ? "json" : typeof example === "string" ? "text" : undefined,
  };
}

function flattenPostmanItems(
  items: unknown,
  parents: string[] = [],
): ImportedApiRequest[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (Array.isArray(record.item)) {
      const folderName =
        typeof record.name === "string" && record.name.trim()
          ? record.name.trim()
          : "";
      return flattenPostmanItems(record.item, [...parents, folderName].filter(Boolean));
    }
    const request = buildPostmanRequest(record, parents, index);
    return request ? [request] : [];
  });
}

function flattenOpenApiPaths(
  paths: unknown,
  servers: unknown,
  document: Record<string, unknown> | undefined,
): ImportedApiRequest[] {
  if (!paths || typeof paths !== "object") return [];
  return Object.entries(paths as Record<string, unknown>).flatMap(
    ([path, methods]) => {
      if (!methods || typeof methods !== "object") return [];
      return Object.entries(methods as Record<string, unknown>)
        .filter(([, operation]) => operation && typeof operation === "object")
        .map(([method, operation], index) =>
          buildOpenApiRequest(
            method,
            path,
            operation as Record<string, unknown>,
            servers,
            document,
            index,
          ),
        );
    },
  );
}

export function parseApiImportText(value: string): ParsedApiImport | undefined {
  const trimmed = normalizeImportText(value);
  if (!trimmed) return undefined;

  const curl = parseCurlCommand(trimmed);
  if (curl) {
    return {
      source: "curl",
      sourceLabel: "cURL",
      items: [
        {
          name: curl.name,
          protocol: curl.protocol,
          method: curl.method,
          url: curl.url,
          params: curl.params,
          headers: curl.headers,
          body: curl.body,
          bodyType: curl.bodyType,
          formFields: curl.formFields,
        },
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const record = parsed as Record<string, unknown>;

  if (Array.isArray(record.item) && record.info) {
    const items = flattenPostmanItems(record.item);
    if (items.length > 0) {
      return {
        source: "postman",
        sourceLabel: "Postman",
        items,
      };
    }
  }

  const isOpenApi = typeof record.openapi === "string";
  const isSwagger = typeof record.swagger === "string";
  if ((isOpenApi || isSwagger) && record.paths && typeof record.paths === "object") {
    const items = flattenOpenApiPaths(record.paths, record.servers, record);
    if (items.length > 0) {
      return {
        source: isOpenApi ? "openapi" : "swagger",
        sourceLabel: isOpenApi ? "OpenAPI" : "Swagger",
        items,
      };
    }
  }

  return undefined;
}
