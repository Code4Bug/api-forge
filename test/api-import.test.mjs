import test from "node:test";
import assert from "node:assert/strict";
import { parseApiImportText } from "../src/utils/api-import.ts";

test("cURL 导入会识别为单个接口", () => {
  const parsed = parseApiImportText(
    "curl -X POST 'https://api.example.com/login' \\\n" +
      "  -H 'Content-Type: application/json' \\\n" +
      "  --data-raw '{\"username\":\"alice\"}'",
  );

  assert.equal(parsed?.source, "curl");
  assert.equal(parsed?.items.length, 1);
  assert.equal(parsed?.items[0]?.method, "POST");
});

test("Postman collection 会展开为多个接口", () => {
  const parsed = parseApiImportText(
    JSON.stringify({
      info: {
        name: "Demo",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: [
        {
          name: "用户",
          item: [
            {
              name: "获取详情",
              request: {
                method: "GET",
                url: "https://api.example.com/users/1",
                header: [{ key: "Accept", value: "application/json" }],
              },
            },
          ],
        },
      ],
    }),
  );

  assert.equal(parsed?.source, "postman");
  assert.equal(parsed?.items.length, 1);
  assert.equal(parsed?.items[0]?.name, "用户 / 获取详情");
  assert.equal(parsed?.items[0]?.url, "https://api.example.com/users/1");
  assert.equal(parsed?.items[0]?.headers[0]?.key, "Accept");
  assert.equal(parsed?.items[0]?.headers[0]?.value, "application/json");
});

test("Postman collection 会保留请求头并补齐 bearer 鉴权", () => {
  const parsed = parseApiImportText(
    JSON.stringify({
      info: {
        name: "Demo",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: [
        {
          name: "带鉴权请求",
          request: {
            method: "GET",
            header: [{ key: "x-access-token", value: "{{token}}" }],
            auth: {
              type: "bearer",
              bearer: [{ key: "token", value: "{{token}}" }],
            },
            url: "https://api.example.com/secure",
          },
        },
      ],
    }),
  );

  assert.equal(parsed?.source, "postman");
  assert.equal(parsed?.items.length, 1);
  assert.deepEqual(
    parsed?.items[0]?.headers.map((item) => [item.key, item.value]),
    [
      ["x-access-token", "{{token}}"],
      ["Authorization", "Bearer {{token}}"],
    ],
  );
});

test("Postman raw JSON 请求会自动补齐 Content-Type", () => {
  const parsed = parseApiImportText(
    JSON.stringify({
      info: {
        name: "Demo",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: [
        {
          name: "登录",
          request: {
            method: "POST",
            header: [],
            body: {
              mode: "raw",
              raw: "{\"username\":\"admin\"}",
              options: {
                raw: {
                  language: "json",
                },
              },
            },
            url: "http://127.0.0.1:9999/sys/login",
          },
        },
      ],
    }),
  );

  assert.equal(parsed?.source, "postman");
  assert.equal(parsed?.items.length, 1);
  assert.deepEqual(
    parsed?.items[0]?.headers.map((item) => [item.key, item.value]),
    [["Content-Type", "application/json"]],
  );
});

test("OpenAPI 文档会按路径导入", () => {
  const parsed = parseApiImportText(
    JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Demo", version: "1.0.0" },
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/orders/{id}": {
          get: {
            summary: "订单详情",
            parameters: [
              { in: "path", name: "id", schema: { example: 1001 } },
              { in: "query", name: "from", schema: { example: "app" } },
            ],
          },
        },
      },
    }),
  );

  assert.equal(parsed?.source, "openapi");
  assert.equal(parsed?.items.length, 1);
  assert.equal(parsed?.items[0]?.name, "订单详情");
  assert.equal(parsed?.items[0]?.url, "https://api.example.com/orders/1001");
  assert.equal(parsed?.items[0]?.params[0]?.key, "from");
});

test("OpenAPI requestBody 的本地引用会解析为 body", () => {
  const parsed = parseApiImportText(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Demo API", version: "1.0.0" },
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/v1/chat/completions": {
          post: {
            summary: "Chat Completion",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ChatRequest",
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          ChatRequest: {
            type: "object",
            properties: {
              model: { type: "string" },
              messages: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/Message",
                },
              },
            },
          },
          Message: {
            type: "object",
            properties: {
              role: { type: "string" },
              content: { type: "string" },
            },
          },
        },
      },
    }),
  );

  assert.equal(parsed?.source, "openapi");
  assert.equal(parsed?.items.length, 1);
  assert.ok(parsed?.items[0]?.body?.includes('"model"'));
  assert.ok(parsed?.items[0]?.body?.includes('"messages"'));
});
