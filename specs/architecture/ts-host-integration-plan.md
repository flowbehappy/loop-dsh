# TypeScript 原生 Host 架构

Loop 插件使用 DSH 官方凭据 provider 和 Cordis 生命周期。业务实现、模型会话、协作、同步与 Worksite 在 DSH Host 内运行。本仓库只构建原生插件，不提供独立 Go CLI、helper 或启动器，也不将它们作为故障回退。

## 模块归属

| 模块 | 责任 |
| --- | --- |
| `managed-config.mjs`、`managed-native-actions.mjs` | 私有安装目录、稳定 installation、公开宿主注入与生命周期 |
| `host-actions-core.mjs`、`host-runtime.mjs` | UI/Session facade、当前连接与工作区边界 |
| `backend/credentials.ts`、`http.ts`、`oauth.ts`、`human-oauth.ts` | DSH 凭据、刷新互斥、明确的 Agent/Human 授权 |
| `backend/collaboration*.ts` | 已接受意图、任务与话题权限、幂等账本、结果投递 |
| `backend/sync*.ts`、`plugins/loop-dsh/lib` | 官方会话捕获、持久待发队列与有界上传 |
| `backend/models.ts` | 目录、短期模型会话、流式转发与取消 |
| `backend/worksite.ts`、`yamux.ts` | 独立 Worksite 连接、固定目标 HTTP/WebSocket 与私有 cookie |
| `backend/storage.ts`、`codec.ts` | 原生锁、私有原子文件、旧状态兼容编码 |

公开 HTTP/WS 协议与业务授权仍由 Loop 服务端负责。资源定位来自用户或已授权读取，模型输入不能覆盖 Host 的账号、workspace、Session 或已接受用户消息。不存在新的通用 token 导出接口。

## 生命周期与恢复

插件退出取消目录、模型会话和流式请求，关闭订阅及 transport。未知写入结果保留原回执身份；任务结果和讨论续接始终核对当前权限及原目标。关闭插件不撤销账号，完整退出需确认服务端精确连接撤销。

旧协作账本和 outbox 按既有编码及内核锁读取，v1 账本升级保留私有备份。升级不自动导入旧 Go/keychain 凭据，也不改变已有授权或同名资源归属。回退须保留旧发布包，并避免旧实现覆盖升级后的在途状态。

## 验证

Node 单元和组件测试覆盖错误、并发、权限和持久化；独立 Node 进程验证锁与进程死亡释放。真实 Loop 与官方 DSH 测试验证 OAuth、流式模型、上传回执、协作和撤销。Worksite 真实服务端联调验证跨语言协议。各平台及 Desktop GUI 必须另行记录实测结果。

详细契约见[本机安全](local-host-security.md)、[同步与模型](host-runtime.md)、[协作](host-collaboration.md)和[验收](../../docs/testing/super-agent-e2e.md)。
