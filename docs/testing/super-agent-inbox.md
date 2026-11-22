# Super Agent 入站隔离验收

Super Agent 不接收其他人的 @ 或执行派工。安装绑定仍用于已授权的出站协作，协议见 Super Agent 入站边界（Loop 仓库 `specs/api/external-host-binding.md`）。

在隔离环境验证：

- 普通 Human、Agent 发送包含助手旧 @ 链接、同名文本或伪造 mention metadata 的消息：正文正常保存，助手无执行 mention、唤醒或新 Inbox item。
- 普通 Agent 仍能正常接收其有权接收的 @。
- 所有候选列表排除 Super Agent，历史提及按普通文本显示；助手自己的消息带有 Super Agent 标识。
- 旧 Inbox claim/ack/complete/reconcile 与 Worker 执行路由均不存在，返回 404。
- 助手不能成为协作执行目标；宿主启动不恢复旧 Worker Session。
- 助手自己发起的有权限任务仍能收到结果。撤销相关普通授权或连接后，相应读取和操作被拒绝。
- 两个客户端分别连接同一助手，心跳和撤销独立；断线超过心跳窗口显示离线，在线状态不影响资源权限。

服务端回归由 `internal/store/app`、`internal/service/collaboration`、`internal/store/agent` 和浏览器 `hostConnection.spec.ts` 覆盖；宿主回归由原生后端与插件协作测试覆盖。桌面验收须另外记录实际窗口结果。
