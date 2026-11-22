# 本机宿主安全边界

Loop 原生插件与官方 DSH Host 运行在同一进程，信任 DSH、已安装插件和当前 OS 用户。凭据通过 DSH 官方 provider 的 Loop 命名空间保存。此模型不提供针对同进程插件或同用户任意代码的隔离，也不依赖独立签名 helper、私有父子进程 IPC 或操作者终端。

## 身份与授权

`backend/credentials.ts`、`http.ts`、`oauth.ts` 和 `human-oauth.ts` 负责凭据、刷新协调及 OAuth。连接按精确 server、workspace、installation 和 principal 隔离。请求固定 OAuth resource，禁止跨来源重定向；刷新不扩大动作、用途或资源范围。长期 token 不进入前端、模型工具参数、项目文件或日志。

统一 Host 登录为当前安装保存一对 access/refresh token，Agent、模型和同步复用该 grant，同时接受各领域的实时授权检查。Human 业务与 Apps 委托分别保存独立连接；Agent 失败不能切换 Human。页面 cookie、Worksite proof 与业务凭据互不替代。

刷新使用原生跨进程锁和 generation fence。交换结果未知时保留恢复状态，不能通过重复刷新或旧响应复活连接。完整退出冻结精确连接，确认服务端结果后再清理对应本地状态；其他安装和账号不受影响。

## 本地状态

安装、凭据和账本位于 DSH Home 内的私有目录，并且必须在模型工作区之外。POSIX 校验所有者、权限与符号链接；Windows 使用私有 ACL。状态写入先写私有临时文件、同步并原子发布。DSH credential provider 不承诺断电 fsync，因此不能将成功保存描述为断电保证。

原生内核锁保护协作账本和待发队列。旧 v1 状态按兼容编码读取，账本升级前保存 `.v1.bak`，不删除原凭据或未确认工作。固定编码样本覆盖数值原文、键顺序、转义和精度；不使用普通 `JSON.stringify` 替代协议编码。

## 宿主入口

模型命令由公开 DSH 工具中间件拦截，只接受规定的 `loop-proxy` 字面语法。命令不是 shell 可执行文件；管道、重定向、额外命令、伪造 Session 和不匹配工作目录均失败关闭。具体操作使用 Host 当前连接、真实 Session 及已领取的用户消息，资源权限由 Loop 服务端再次检查。

Worksite 通过独立安装授权、一次性 launch 和固定目标的 HTTP/WebSocket 通道访问当前 Host。私有 DSH cookie 仅由 Host 注入，不返回远端浏览器。Host/Origin、回调和连接 generation 的检查保持独立。

官方插件安装与启停由 DSH 管理。平台支持和 GUI 验收必须记录实际运行结果；Node 单测不证明 Desktop 或其他操作系统已验收。安装说明见[原生插件](../../plugins/loop-proxy-dsh/README.native.md)。
