# Super Agent 插件验收

记录插件 commit、Loop commit、官方 DSH 版本、包摘要和各项实际结果。使用独立数据库、DSH Home、工作目录及合成账号，不继承日常凭据。Loop 服务端的测试能力清单由 Loop 仓库维护，本仓库的原生测试位于 `plugins/loop-proxy-dsh/test`。

## 本仓检查

```sh
npm run bootstrap
npm run check
npm test
node plugins/loop-proxy-dsh/build-native.mjs /absolute/new/package
```

测试不依赖 Go。覆盖凭据刷新互斥、OAuth、账号切换、模型、知识与技能、协作意图、权限拒绝、账本恢复、会话捕获、原生同步、Worksite 和界面组件。固定编码样本保留旧状态序列化兼容性。原生内核锁通过独立 Node 进程验证释放、共享读取和并发写入；真实 Loop 联调验证跨语言服务端协议。

## 真实 Loop 与官方 DSH

显式提供隔离 Test Hub 后运行：

```sh
LOOP_TS_E2E_BASE_URL=http://127.0.0.1:PORT LOOP_TS_E2E_BUNDLE=1 \
  node --test plugins/loop-proxy-dsh/test/native-real-loop.test.mjs

LOOP_TS_E2E_DSH_BIN=/absolute/isolated/node_modules/@deepseek-ai/dsh/lib/bin.js \
LOOP_TS_E2E_BASE_URL=http://127.0.0.1:PORT LOOP_TS_E2E_INSTALL_PACKAGE=1 \
  node --test plugins/loop-proxy-dsh/test/native-dsh-runtime.test.mjs
```

先执行 `npm --prefix plugins/loop-proxy-dsh run build:backend`。Worksite、服务端路由与 loopback 模型 fixture 的前置条件见[后端测试说明](../../plugins/loop-proxy-dsh/backend/README.md)。缺少显式环境的用例必须标记未执行。确定性模型仅验证协议与持久化链路，不验证远程模型质量。

## 权限与界面

分别验证无授权、只读、精确资源限制、跨账号/工作区、连接单独撤销和授权恢复。Agent 不能继承 Human 页面或委托权限；Human 业务与 Apps 连接不能互相替代。结果未知的写入只核对原回执，不切换身份或自动重复提交。

Web 与 Desktop 各自从实际界面验证登录、模型回复、知识与 Skill 选择、业务面板、上传回读、任务协作、插件启停与重启。观察撤权后的实际拒绝和旧响应隔离。Node 组件测试、SDK 和 CLI 结果不能替代 Desktop GUI 验收。

[入站隔离场景](super-agent-inbox.md)单独验证助手不接受他人派工及旧 Worker 状态。
