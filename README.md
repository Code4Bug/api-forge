# API-forge

API-forge 是一个基于 Electron 的桌面端接口测试与调试工具，面向日常 API 联调、环境切换和网络协议验证场景。

产品定位：提供一个轻量级、纯本地运行的 API 测试工具。接口请求、环境变量、请求历史和工作区数据均保存在本机，不依赖云端账号或远程项目服务，适合个人开发、内网联调和本地协议验证。

## 当前能力

- HTTP 请求编辑与发送：GET、POST、PUT、PATCH、DELETE、HEAD、OPTIONS，支持 URL、Params、Headers、Body 和环境变量替换
- 请求体编辑：JSON、`application/x-www-form-urlencoded`、multipart 和文本类内容，JSON 支持格式化/压缩
- HTTP 响应查看：状态码、响应头、响应体、耗时、大小、复制响应和基础日志
- SSE 流式响应：根据 `Content-Type: text/event-stream` 自动识别，支持实时流式内容、原始事件 JSON 和手动中断
- 响应断言：请求完成后可基于 `status`、`headers`、`body` 执行 JavaScript 表达式并显示通过/失败结果
- WebSocket 测试：连接、断开、发送消息和帧日志
- TCP / UDP Socket 测试：连接、发送文本或 Hex 报文、查看收发日志
- API 目录与请求配置：支持目录/API 新建、重命名、删除、搜索和拖拽移动
- curl 导入：解析常见 curl 命令中的 URL、方法、Headers 和 Body 并创建 HTTP API
- 环境变量：环境新增、重命名、删除、切换、变量 CRUD、JSON 导入导出和变量替换
- 请求历史：HTTP 请求结果持久化，支持搜索、方法/状态/环境筛选、详情、清空和恢复请求
- AI 工作台：配置 OpenAI 兼容接口后进行流式对话，可查询/新增/编辑/删除目录和接口（删除操作需确认），支持工具开关、上下文占用提示、复制和导出对话
- 外观与保存设置：深色/浅色/跟随系统/Dim 主题、自定义颜色、工作区自动保存
- 应用更新：生产环境可在设置页检查、下载和安装新版本

当前项目仍处于首版开发阶段。Postman/OpenAPI 导入、WebSocket 重连与二进制消息、历史分页与响应对比、自动化测试等能力尚未完成，详见 [`todo-list.md`](todo-list.md)。

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
- pnpm（推荐；项目脚本也兼容 npm）

## 快速开始

```bash
pnpm install
pnpm dev
```

开发服务默认使用 `http://localhost:5174`。浏览器预览可使用 `pnpm dev:web`，但 HTTP 调试和 Socket 能力需要在 Electron 桌面端运行。

浏览器预览只加载渲染进程界面，不提供 Electron 主进程的真实 HTTP、SSE、TCP/UDP 能力；完整功能请使用 `pnpm dev` 启动桌面端。

### macOS 无法启动

如果安装后提示应用无法打开或无法验证开发者，可在终端执行以下命令，清除 macOS 为下载应用添加的隔离属性：

```bash
xattr -dr com.apple.quarantine "/Applications/API-forge.app"
```

执行完成后重新启动 API-forge。请仅对从可信来源获取的应用执行此命令。

## 本地模拟服务

```bash
cd api-server-simulator
pnpm start
```

默认地址：

| 协议 | 地址 |
| --- | --- |
| HTTP | `http://127.0.0.1:8787` |
| SSE | `http://127.0.0.1:8787/sse/events` |
| WebSocket | `ws://127.0.0.1:8787/ws/market` |
| TCP | `127.0.0.1:18080` |
| UDP | `127.0.0.1:18081` |

模拟服务启动时会初始化 `~/.api-forge/workspace.json`。只生成工作区而不启动服务时执行 `pnpm run init`。监听地址可通过 `SIMULATOR_HOST`、`SIMULATOR_HTTP_PORT`、`SIMULATOR_TCP_PORT` 和 `SIMULATOR_UDP_PORT` 修改。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动 Electron 开发环境 |
| `pnpm dev:web` | 浏览器预览 |
| `pnpm test` / `pnpm check` | TypeScript 类型检查 |
| `pnpm lint` | ESLint 检查 |
| `pnpm build` | 构建应用 |
| `pnpm build:mac` | 构建 macOS 安装包 |
| `pnpm build:win` | 构建 Windows x64 安装包 |
| `pnpm build:win:x64` | 在 macOS/Linux 上构建 Windows x64 安装包 |
| `pnpm build:linux` | 构建 Linux x64 安装包 |
| `pnpm build:linux:x64` | 构建 Linux x64 安装包（AppImage 和 deb） |

在 macOS 上构建 Windows 安装包需要 Wine（NSIS 使用 Wine 运行）。可使用 Homebrew 安装：

```bash
brew install --cask wine-stable
pnpm run build:win:x64
```

Windows 产物会输出到 `release/` 目录，默认生成 NSIS 安装程序。应用未配置代码签名，安装时可能显示 Windows SmartScreen 提示。

Linux 产物也会输出到 `release/` 目录，默认生成 AppImage 和 deb 安装包。Linux 打包建议在 Linux 环境执行；在 macOS 上跨平台构建可能需要额外的 Docker 或系统打包工具支持。

项目当前没有独立的单元测试文件；`test` 脚本执行 TypeScript 类型检查。当前检查受 `src/pages/AIAssistantPage.tsx:133` 使用 ES2022 `Array.at` 影响而失败（项目目标为 ES2020）。当前 ESLint 检查有 6 个错误和 6 个 React Hook 警告，主要涉及未使用变量及 Hook 依赖。

## 实现细节

- 渲染进程使用 React、TypeScript、React Router 和 Zustand 管理页面、路由及工作区状态；Monaco Editor 用于 JSON 和文本编辑。
- `electron/preload` 只通过白名单暴露 IPC 方法。HTTP、SSE、TCP/UDP、工作区和历史文件操作在主进程执行；WebSocket 使用渲染进程原生 `WebSocket`。
- HTTP 请求通过主进程 `fetch` 执行，响应体按流读取并通过 `http:chunk` IPC 回传；请求中断使用 `AbortController`。
- 工作区写入采用临时文件后 rename 的方式；历史记录单独写入，最多保留 200 条。AI 对话和部分界面偏好保存在渲染进程 `localStorage`。
- AI 工作台调用用户配置的 OpenAI 兼容 `baseUrl`；启用工具时会将当前工作区摘要作为对话上下文发送给该服务，目录和接口工具直接调用 Zustand 工作区操作。

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
pnpm check
pnpm lint
pnpm build
```

## GitHub 自动发布

推送版本标签后，GitHub Actions 会自动在 macOS、Windows 和 Linux 上构建安装包，并创建对应的 GitHub Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

标签必须以 `v` 开头，例如 `v1.0.0`。发布流程使用仓库的 `GITHUB_TOKEN`，无需额外配置密钥。

详细开发计划和逐项完成情况见 [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) 与 [`todo-list.md`](todo-list.md)。

## 当前限制

- 尚未支持 Postman、OpenAPI JSON/YAML 和批量 URL 导入。
- SSE 目前复用 HTTP 请求页面，没有独立的连接管理、重连和指标面板。
- WebSocket 尚未支持 Header/Auth 配置、重连、二进制消息、过滤和统计。
- 历史记录尚未支持分页、时间筛选、单条删除、导出和响应对比。
- Cookies 解析、DNS/TLS 错误分类和统一重试机制尚未完成。
- HTTP 页面中的“跟随重定向”和“校验证书”选项尚未完整传递到主进程请求实现；超时链路已在主进程支持，仍需补齐页面参数传递。
- 环境中的密钥仍以明文写入 `workspace.json`，尚未接入 Electron `safeStorage` 或系统钥匙串。
- AI 页面依赖已配置且启用的大模型服务；服务地址、模型或 Key 缺失时入口会引导至设置页。
