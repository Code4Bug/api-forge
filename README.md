# API-forge

API-forge 是一个基于 Electron 的桌面端接口测试与调试工具，面向日常 API 联调、环境切换和网络协议验证场景。

产品定位：提供一个轻量级、纯本地运行的 API 测试工具。接口请求、环境变量、请求历史和工作区数据均保存在本机，不依赖云端账号或远程项目服务，适合个人开发、内网联调和本地协议验证。

## 当前能力

- HTTP 请求编辑与发送：方法、URL、Params、Headers、Body、Bearer Token
- HTTP 响应查看：状态码、响应头、响应体、耗时和大小
- SSE 流式响应：通过 HTTP 流读取并实时展示响应内容
- WebSocket 测试：连接、断开、发送消息和帧日志
- TCP / UDP Socket 测试：连接、发送文本或 Hex 报文、查看收发日志
- API 目录与请求配置：支持目录/API 新建、重命名、删除、搜索和拖拽移动
- curl 导入：解析常见 curl 命令中的 URL、方法、Headers 和 Body 并创建 HTTP API
- 环境变量：环境新增、重命名、删除、切换、变量 CRUD、JSON 导入导出和变量替换
- 请求历史：HTTP 请求结果持久化，支持搜索、方法/状态/环境筛选、详情、清空和恢复请求
- 外观与保存设置：深色/浅色等主题、自定义颜色、工作区自动保存

当前项目仍处于首版开发阶段。Postman/OpenAPI 导入、SSE 独立控制面板、WebSocket 重连与二进制消息、历史分页与响应对比、完整断言执行和自动化测试等能力尚未完成，详见 [`todo-list.md`](todo-list.md)。

## 技术栈

- React 18 + TypeScript + Vite
- Electron 35
- Tailwind CSS
- Zustand
- Monaco Editor
- lucide-react

渲染进程通过 preload 暴露的白名单 IPC API 与 Electron 主进程通信。主进程负责 HTTP、SSE 流、TCP/UDP Socket、工作区和历史记录等系统能力，WebSocket 当前使用渲染进程原生连接。Electron 已启用 `contextIsolation`，并关闭 `nodeIntegration`。

## 环境要求

- Node.js 18 或更高版本
- npm（项目当前使用 `package-lock.json`；如团队统一使用 pnpm，可按同名脚本执行）

## 快速开始

```bash
npm install
npm run dev
```

开发服务默认使用 `http://localhost:5174`。浏览器预览可使用 `npm run dev:web`，但 HTTP 调试和 Socket 能力需要在 Electron 桌面端运行。

## 本地模拟服务

```bash
cd api-server-simulator
npm start
```

默认地址：

| 协议 | 地址 |
| --- | --- |
| HTTP | `http://127.0.0.1:8787` |
| SSE | `http://127.0.0.1:8787/sse/events` |
| WebSocket | `ws://127.0.0.1:8787/ws/market` |
| TCP | `127.0.0.1:18080` |
| UDP | `127.0.0.1:18081` |

模拟服务启动时会初始化 `~/.api-forge/workspace.json`。只生成工作区而不启动服务时执行 `npm run init`。监听地址可通过 `SIMULATOR_HOST`、`SIMULATOR_HTTP_PORT`、`SIMULATOR_TCP_PORT` 和 `SIMULATOR_UDP_PORT` 修改。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发环境 |
| `npm run dev:web` | 浏览器预览 |
| `npm run check` | TypeScript 类型检查 |
| `npm run lint` | ESLint 检查（当前存在 1 个错误和 3 个警告） |
| `npm run build` | 构建应用 |
| `npm run build:mac` | 构建 macOS 安装包 |
| `npm run build:win` | 构建 Windows 安装包 |

项目当前没有配置 `npm test` 测试脚本或自动化测试文件。当前 `check` 和 `build` 通过，`lint` 因 `electron/main/index.ts:246` 的未使用变量 `_history` 失败，并存在 3 个 React Hook 警告。

## 数据与文件

- 工作区：`~/.api-forge/workspace.json`
- 请求历史：`~/.api-forge/history.json`
- 打包产物：`release/`

密钥变量目前只在界面中掩码展示，底层仍会写入工作区 JSON；尚未接入 Electron `safeStorage` 或系统钥匙串，不应存放生产凭据。工作区读取异常目前可能回退默认数据，权限错误或损坏文件需要额外排查。

## 项目结构

```text
src/                       React 渲染进程、页面、状态和共享类型
  layouts/                 工作区布局与 API 目录交互
  pages/                   HTTP、WebSocket、Socket、环境、历史和设置页面
  stores/                  Zustand 工作区状态与持久化调用
  shared/                  IPC 合约和数据模型
electron/main/             Electron 主进程、窗口、网络和本地存储
electron/preload/          安全 IPC 白名单
api-server-simulator/      多协议模拟服务
design/pages/              产品设计稿
```

## 质量检查

```bash
npm run check
npm run lint
npm run build
```

详细开发计划和逐项完成情况见 [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) 与 [`todo-list.md`](todo-list.md)。

## 当前限制

- 尚未支持 Postman、OpenAPI JSON/YAML 和批量 URL 导入。
- SSE 目前复用 HTTP 流式响应展示，没有独立的停止、重连和指标面板。
- WebSocket 尚未支持 Header/Auth 配置、重连、二进制消息、过滤和统计。
- 历史记录尚未支持分页、时间筛选、单条删除、导出和响应对比。
- HTTP 响应断言、Cookies 解析、DNS/TLS 错误分类和统一重试机制尚未完成。
