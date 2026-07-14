# 开发计划

## 1. 项目定位

基于 `design/pages` 下的 UI 设计，本项目定位为一个桌面端接口测试与调试工具，产品名称暂定为“接口调试台”。

技术架构采用：

- `TypeScript`
- `Vite`
- `Electron`
- 支持 `macOS`、`Windows` 多平台打包

设计稿覆盖的核心能力包括：

- API 目录管理
- HTTP 请求调试
- SSE 流式响应调试
- WebSocket 测试
- TCP / UDP Socket 测试
- 环境变量管理
- 请求历史记录
- 请求错误状态展示
- 新建 API、新建目录、API 导入弹窗
- curl 命令导入

## 2. 设计稿范围

设计文件位于 `design/pages`，当前包含以下页面：

| 设计稿 | 功能模块 |
| --- | --- |
| `HTTP 请求调试.html` | HTTP 请求编辑、发送、响应查看、断言、日志、变量摘要 |
| `SSE 流式响应.html` | SSE 请求发送、流式事件时间线、实时内容、事件指标 |
| `WebSocket 测试.html` | WebSocket 连接、消息发送、帧日志、连接统计 |
| `TCP_UDP Socket 测试.html` | TCP / UDP 连接配置、报文编辑、Hex 预览、收发日志 |
| `环境变量管理.html` | Dev / Test / Prod 环境变量、密钥变量、全局 Headers、地址预览 |
| `请求历史记录.html` | 历史请求筛选、分页、详情、恢复请求、响应对比入口 |
| `请求错误状态.html` | 错误响应、失败详情、重试和排查信息 |
| `目录菜单展开.html` | API 目录右键/更多菜单、目录操作入口 |
| `新建 API 弹窗.html` | 新建接口表单 |
| `新建目录弹窗.html` | 新建目录表单、排序、可见性、预览 |
| `API 导入弹窗.html` | Postman / OpenAPI / curl 文件、URL 或命令导入、解析预览、合并策略 |

## 3. 技术架构

### 3.1 前端架构

推荐使用：

- `React + TypeScript + Vite`
- `Tailwind CSS` 或等价的原子化样式方案
- `lucide-react` 作为图标库
- `Zustand` 管理跨页面工作区状态
- `Monaco Editor` 或轻量代码编辑器承载 JSON、Headers、Body、脚本编辑

前端重点不是营销页，而是高密度桌面工具界面，需要保持设计稿中的紧凑布局、深色主题、代码区、表格、标签页和多栏工作台体验。

### 3.2 Electron 架构

采用标准三进程职责：

- `main`：窗口、菜单、文件系统、网络代理、Socket、应用生命周期、本地存储
- `preload`：暴露安全 IPC API
- `renderer`：页面 UI、状态管理、请求编辑、响应展示

安全要求：

- 开启 `contextIsolation`
- 关闭 `nodeIntegration`
- renderer 不直接访问 Node.js API
- 所有文件、Socket、本地存储、系统能力通过 preload 白名单暴露

### 3.3 本地数据方案

首版建议使用本地文件或轻量数据库保存工作区数据：

- API 目录树
- 请求配置
- 环境变量
- 请求历史
- WebSocket / Socket 会话模板
- 用户偏好设置

可选方案：

- 简单首版：JSON 文件 + 原子写入
- 数据增长后：SQLite

## 4. 推荐目录结构

```text
src/
  main/
    index.ts
    window.ts
    ipc/
      api-tree.ts
      environments.ts
      http.ts
      sse.ts
      websocket.ts
      socket.ts
      history.ts
      import.ts
    services/
      workspace-store.ts
      http-client.ts
      stream-client.ts
      websocket-client.ts
      socket-client.ts
      import-parser.ts
  preload/
    index.ts
    api.ts
  renderer/
    main.tsx
    App.tsx
    routes/
    layouts/
      WorkspaceLayout.tsx
    pages/
      HttpDebugPage.tsx
      SseDebugPage.tsx
      WebSocketPage.tsx
      SocketPage.tsx
      EnvironmentPage.tsx
      HistoryPage.tsx
    components/
      api-tree/
      request-tabs/
      request-editor/
      response-viewer/
      env-manager/
      history/
      modals/
      common/
    stores/
      workspace-store.ts
      request-store.ts
      environment-store.ts
    styles/
      theme.css
      globals.css
  shared/
    types/
    ipc-contracts.ts
    constants.ts
```

## 5. 核心模块拆分

### 5.1 工作区布局

对应多个设计稿中的公共结构。

功能：

- 左侧工作区栏
- API 目录树
- 顶部协议导航：HTTP / SSE / WebSocket / Socket
- 环境选择器
- 请求标签页
- 主内容区
- 弹窗遮罩层

首版要求：

- 支持深色主题
- 支持窗口缩放
- 左侧目录可滚动
- 标签页可新增、切换、关闭
- 当前环境在所有调试模块中共享

### 5.2 API 目录管理

对应：

- `目录菜单展开.html`
- `新建目录弹窗.html`
- `新建 API 弹窗.html`
- `API 导入弹窗.html`

功能：

- 目录树展示
- 目录展开 / 收起
- 新建目录
- 新建 API
- 删除目录或 API
- API 移动到目录
- 搜索目录或接口
- 目录菜单操作
- Postman / OpenAPI / curl 导入

curl 导入要求：

- 支持粘贴单条 curl 命令
- 解析 URL、Method、Headers、Query、Body、Cookie
- 支持 `-X`、`-H`、`-d`、`--data`、`--data-raw`、`--compressed` 等常见参数
- 解析结果转为 HTTP 请求标签页，可继续编辑后保存到 API 目录
- 对无法解析的参数给出明确错误提示，不执行 curl 命令本身

数据结构建议：

```ts
interface ApiTreeNode {
  id: string
  type: 'folder' | 'api'
  name: string
  parentId?: string
  method?: HttpMethod
  protocol?: 'http' | 'sse' | 'websocket' | 'socket'
  children?: ApiTreeNode[]
}
```

### 5.3 HTTP 请求调试

对应：`HTTP 请求调试.html`。

功能：

- 请求方法选择：GET / POST / PUT / DELETE 等
- URL 输入
- Params / Headers / Body / Auth / Scripts 标签
- JSON Body 编辑
- 请求参数编辑
- Bearer Token 等认证配置
- 发送请求
- 响应 Body / Headers / Cookies 查看
- 状态码、耗时、大小展示
- 响应复制
- 断言结果摘要
- 请求日志摘要
- 当前变量摘要

首版优先级：

1. 方法、URL、Headers、Body、Auth
2. 发送请求和响应展示
3. 请求历史写入
4. Params 和变量替换
5. Scripts / 断言可作为增强项

### 5.4 SSE 流式响应调试

对应：`SSE 流式响应.html`。

功能：

- SSE 请求配置
- Body / Headers / Auth / Tests 标签
- 发送流式请求
- 展示连接状态、首包耗时、心跳间隔
- 停止 / 重连
- 事件时间线
- 实时内容输出
- 事件数、令牌数、平均延迟、持续时间统计

实现建议：

- main 进程负责实际流式请求
- renderer 通过 IPC 订阅事件分片
- 每个 SSE 会话使用唯一 `requestId`
- 支持停止指定流式请求

### 5.5 WebSocket 测试

对应：`WebSocket 测试.html`。

功能：

- WebSocket URL 配置
- 连接 / 断开
- Header / Auth 配置
- JSON / 文本 / 二进制消息发送
- 心跳、重连、压缩等连接选项
- 帧日志展示：IN / OUT / PING / PONG / CLOSE
- 入站帧、出站帧、平均延迟、丢包统计
- 过滤与清空日志

实现建议：

- WebSocket 连接由 main 进程维护
- renderer 只发送连接配置和消息内容
- 帧事件通过 IPC 推送到 renderer

### 5.6 TCP / UDP Socket 测试

对应：`TCP_UDP Socket 测试.html`。

功能：

- TCP / UDP 协议切换
- 主机、端口、超时、编码配置
- Keep-Alive、自动重连、收包追加换行
- 连接 / 监听
- 文本报文编辑
- Hex 预览
- 发送队列模板
- 收发日志
- 连接指标：延迟、吞吐、收包、丢包

实现建议：

- Socket 能力必须在 main 进程实现
- 使用 Node.js `net` 处理 TCP
- 使用 Node.js `dgram` 处理 UDP
- renderer 只负责配置、展示和操作指令

### 5.7 环境变量管理

对应：`环境变量管理.html`。

功能：

- Dev / Test / Prod 环境切换
- 变量表格：键名、当前值、类型、是否密钥、作用域、描述
- 新增、复制、删除变量
- 密钥变量掩码展示
- 变量筛选
- 地址预览与变量解析
- 鉴权预设
- 全局 Headers
- 导入 / 导出
- 保存 / 同步

变量替换规则：

```text
{{base_url}}/v1/orders/{id}
```

替换来源：

- 当前环境变量
- 全局变量
- 请求级变量

### 5.8 请求历史记录

对应：`请求历史记录.html`。

功能：

- 历史请求列表
- 搜索路径、用户、参数
- 按方法、状态、环境、时间筛选
- 分页
- 记录详情面板
- 请求 / 响应 / Headers 标签
- 恢复请求
- 响应对比入口
- 清空历史
- 导出历史

历史记录字段建议：

```ts
interface RequestHistoryItem {
  id: string
  protocol: 'http' | 'sse' | 'websocket' | 'socket'
  method?: string
  url: string
  status?: number
  durationMs?: number
  sizeBytes?: number
  environmentId: string
  createdAt: string
  requestSnapshot: unknown
  responseSnapshot?: unknown
}
```

### 5.9 错误状态

对应：`请求错误状态.html`。

功能：

- 请求失败状态展示
- 错误码、错误信息、耗时展示
- 请求配置摘要
- 响应错误体展示
- 重试入口
- 复制错误信息
- 排查建议区域

错误类型：

- HTTP 非 2xx
- 网络超时
- DNS 失败
- TLS 失败
- WebSocket 断开
- Socket 连接失败
- SSE 流中断

## 6. 开发阶段计划

### 阶段一：工程骨架

目标：完成 Electron + Vite + TypeScript 基础工程。

任务：

- 初始化 Vite + React + TypeScript
- 接入 Electron main / preload / renderer
- 配置开发启动命令
- 配置 `electron-builder`
- 配置 ESLint / Prettier
- 建立 IPC 类型约定
- 建立窗口创建逻辑
- 配置深色主题基础变量

交付物：

- 应用可本地启动
- 主窗口正常打开
- renderer 可通过 preload 调用测试 IPC

### 阶段二：设计系统与静态页面

目标：把设计稿转为可维护的 React 组件和页面结构。

任务：

- 提取设计 token：颜色、字号、边框、圆角、阴影、代码字体
- 实现公共布局 `WorkspaceLayout`
- 实现 API 目录树静态组件
- 实现顶部协议导航
- 实现请求标签页
- 实现通用组件：按钮、输入框、选择器、表格、弹窗、代码块、状态标签
- 搭建 HTTP / SSE / WebSocket / Socket / 环境变量 / 历史页面静态结构

交付物：

- 所有设计稿对应页面可在应用中访问
- 视觉与设计稿保持一致
- 基础响应式窗口布局可用

### 阶段三：本地数据与工作区状态

目标：让 UI 从真实状态驱动。

任务：

- 定义工作区数据模型
- 实现 API 目录树状态
- 实现请求标签页状态
- 实现环境变量状态
- 实现本地持久化
- 实现启动时加载工作区
- 实现保存、自动保存或保存中状态

交付物：

- 目录、新建 API、新建目录、标签页可操作
- 环境变量可维护并持久化
- 重启应用后数据可恢复

### 阶段四：HTTP 与 SSE 调试能力

目标：完成最核心的请求调试能力。

任务：

- HTTP 请求发送
- Headers / Params / Body / Auth 组装
- 环境变量替换
- 响应状态、耗时、大小统计
- 响应 Body / Headers 展示
- 错误状态展示
- 请求历史写入
- SSE 流式请求发送
- SSE 事件增量推送到 UI
- SSE 停止 / 重连

交付物：

- HTTP 调试完整可用
- SSE 流式响应可实时展示
- 请求历史自动记录

### 阶段五：WebSocket 与 TCP/UDP Socket

目标：补齐长连接和底层 Socket 测试能力。

任务：

- WebSocket 连接管理
- WebSocket 消息发送
- WebSocket 帧日志
- WebSocket 连接统计
- TCP 连接、发送、接收
- UDP 发送、监听、接收
- 文本 / Hex 编码转换
- Socket 收发日志
- Socket 指标统计

交付物：

- WebSocket 页面可连接、发送、记录帧日志
- TCP / UDP 页面可连接或监听、发送报文、查看日志

### 阶段六：导入、历史与增强体验

目标：完善工作区操作效率。

任务：

- Postman Collection 导入
- OpenAPI JSON / YAML 导入
- curl 命令导入
- URL 导入
- 导入预览和合并策略
- 请求历史筛选
- 恢复历史请求
- 响应对比基础入口
- 复制响应、复制错误、导出历史
- 空状态、加载状态、失败状态补齐

交付物：

- API 导入可用
- 历史记录可检索、恢复
- 主要异常场景有明确 UI 反馈

### 阶段七：多平台打包与验收

目标：输出 macOS / Windows 可用安装包。

任务：

- 配置应用名称、图标、版本号、App ID
- 配置 macOS `dmg` / `zip`
- 配置 macOS `x64` / `arm64`
- 配置 Windows `nsis`
- 配置 Windows `x64`
- 验证生产环境资源路径
- 验证本地数据目录
- 验证网络、Socket、文件导入权限
- 验证安装、卸载、覆盖安装

交付物：

- macOS 安装包
- Windows 安装包
- 发布前验收清单

## 7. IPC 能力清单

建议按领域拆分 IPC：

```text
workspace:load
workspace:save
api-tree:create-folder
api-tree:create-api
api-tree:update-node
api-tree:delete-node
import:parse-file
import:parse-url
import:parse-curl
import:apply
http:send
sse:start
sse:stop
websocket:connect
websocket:send
websocket:disconnect
socket:connect
socket:listen
socket:send
socket:disconnect
environment:list
environment:save
history:list
history:create
history:clear
history:restore
```

事件推送：

```text
sse:event
sse:complete
sse:error
websocket:frame
websocket:status
socket:message
socket:status
```

## 8. 打包配置建议

推荐使用 `electron-builder`。

脚本建议：

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "vite build && tsc -p tsconfig.main.json",
    "dist:mac": "electron-builder --mac",
    "dist:win": "electron-builder --win",
    "dist": "electron-builder --mac --win"
  }
}
```

macOS 目标：

- `dmg`
- `zip`
- `x64`
- `arm64`

Windows 目标：

- `nsis`
- `x64`
- `portable` 可选

正式发布增强：

- macOS 代码签名
- macOS notarization
- Windows 代码签名
- 自动更新 `electron-updater`

## 9. 风险点

### 9.1 多协议能力边界

HTTP、SSE、WebSocket、TCP、UDP 的生命周期差异较大。需要在 main 进程中建立统一的会话管理，避免 renderer 页面切换后连接泄漏。

### 9.2 流式数据性能

SSE、WebSocket、Socket 日志可能持续增长。需要限制日志条数，支持清空、分页或虚拟列表。

### 9.3 密钥变量安全

环境变量中包含 token、secret 等敏感数据。首版至少需要掩码展示，后续可接入系统钥匙串或安全存储。

### 9.4 打包后网络和资源路径

开发环境与生产环境路径不同。需要重点验证图标、字体、本地数据库、导入文件、网络请求和 Socket 权限。

### 9.5 Windows 与 macOS 差异

Socket、证书、代理、文件路径、窗口行为在两个平台存在差异，需要分别验收。

## 10. 里程碑

| 里程碑 | 内容 | 完成标准 |
| --- | --- | --- |
| M1 | 工程骨架 | Electron + Vite + TS 可启动 |
| M2 | UI 静态页 | 设计稿页面完成组件化还原 |
| M3 | 工作区数据 | API 目录、标签页、环境变量可持久化 |
| M4 | HTTP / SSE | HTTP 请求和 SSE 流式响应可用 |
| M5 | WebSocket / Socket | 长连接和 TCP/UDP 调试可用 |
| M6 | 导入 / 历史 | API 导入、历史检索、恢复请求可用 |
| M7 | 打包验收 | macOS / Windows 安装包可用 |

## 11. 首版验收标准

首版完成需要满足：

- 所有设计稿中的主页面都有对应实现
- API 目录可创建、展示、搜索和持久化
- HTTP 请求可配置、发送、查看响应和错误
- SSE 请求可展示流式事件并支持停止
- WebSocket 可连接、发送消息、查看帧日志
- TCP / UDP 可配置连接、发送报文、查看收发日志
- 环境变量可按环境维护并参与请求变量替换
- 请求历史可记录、筛选、查看详情和恢复请求
- API 导入支持 Postman / OpenAPI 文件解析和 curl 命令解析
- Electron 安全配置符合基础要求
- macOS 和 Windows 均可打包、安装、启动
