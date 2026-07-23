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
