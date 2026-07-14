# API Forge 模拟服务

用于前端调试的本地多协议服务，不需要额外生产依赖。

```bash
cd api-server-simulator
npm start
```

启动后同时提供：

- HTTP：`http://127.0.0.1:8787/api/orders`、`/api/orders/:id`、`/api/users/me`、`/api/error`
- SSE：`http://127.0.0.1:8787/sse/events`
- WebSocket：`ws://127.0.0.1:8787/ws/market`
- TCP：`127.0.0.1:18080`
- UDP：`127.0.0.1:18081`

启动时会初始化 `~/.api-forge/workspace.json`，工作区中的环境变量和接口地址与上述实例一致。只生成工作区时执行 `npm run init`。

可通过 `SIMULATOR_HTTP_PORT`、`SIMULATOR_TCP_PORT`、`SIMULATOR_UDP_PORT` 和 `SIMULATOR_HOST` 修改监听地址。
