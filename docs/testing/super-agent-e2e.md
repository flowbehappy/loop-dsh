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

## 可积累的场景清单

[场景目录](super-agent-scenarios.json) 按稳定 ID 记录前置条件、步骤、预期和自动化入口，包含频道授权、项目与知识协作、真实模型检查点和 Loop HTTP 回归。新增故障应补充对应场景；不要用某一轮的通过结果覆盖场景定义。

共享同一个测试数据库实例时，串行运行套件，避免多个进程同时迁移测试库。资源取消导致中止时，先结束本轮子进程，保留失败记录和旧数据，再用隔离实例重跑受影响的用例。

每轮另存 Loop/plugin SHA、DSH 版本、测试库限额回读、用例 ID、`pass` / `fail` / `skip` / `not-run`、失败原因和日志位置。模型场景按整个分组执行，不能跳过前置步骤只验证最后的回复。界面验收、真实模型、确定性协议测试分别记录。全文检索未就绪时，授权预检成功不等于搜索结果验收成功。

通用个人授权回归：Agent 权限明确拒绝后，插件对消息目标与任务频道定位字段中的 `#slug` 复用精确频道目录，将同一组稳定参数交给授权预检与后续 Human 执行。原有 ID、私聊、回复串和正文不重写；服务端仍负责动作、资源与实时权限校验。

## 两个会话、两个话题与单人派工

在支持本地模型测试入口的隔离 Test Hub 上，正式 DSH 加载插件，调用 DeepSeek 运行两个独立会话。两名 Loop Agent 分别用自己的运行凭据读写同一私有频道里的两个话题，由真实模型完成初稿、互评和修订。第二个测试用户自己添加其客座 Agent，参与者读到同事与客座 Agent 的意见后再修改诗稿。测试端为每次交付附加随机编号，检查 Loop 投递名单、消息作者、同一请求重试后的条数和原会话收到的推送。另测移出频道、非成员读取，以及单人小曲委派的任务和回信。

```sh
LOOP_TS_E2E_DSH_BIN=/absolute/isolated/node_modules/@deepseek-ai/dsh/lib/bin.js \
LOOP_TS_E2E_BASE_URL=http://127.0.0.1:PORT LOOP_TS_E2E_INSTALL_PACKAGE=1 \
LOOP_TS_E2E_LIVE_TOPIC=1 LOOP_TEST_MODEL_FILE=/absolute/path/to/test-key \
  node --test --test-name-pattern=browser plugins/loop-proxy-dsh/test/native-dsh-runtime.test.mjs
```

同一账号新建第二个 Loop 工作区，登录后再打开一个空的 DSH 工作目录。原工作区与新工作区使用同名作曲智能体，按服务端身份核对目录、任务和回信所属会话。

服务提供方为 DeepSeek，默认模型为 `deepseek-v4-flash`，可通过 `LOOP_TEST_MODEL_NAME` 指定模型。凭据文件须只含测试密钥。Loop 账号中只保存临时测试入口的凭据。写诗派工、项目成员授权及知识库撤权由上面的 `native-real-loop.test.mjs` 覆盖。

## 断线与登录续期恢复

频道通知和 Skill 目录共用接收活性检测：连续 90 秒没有应用帧或 WebSocket 控制心跳时关闭连接，由已有退避循环重连。检测每 15 秒运行一次；唤醒后的状态读取也会检查过期。恢复继续使用已持久化游标、原路由和收件箱去重，空闲会话不依赖业务消息保活。

若刷新请求已经发出但结果未知，不重发旧 refresh token。用户点击登录并在 Loop 确认恢复后，插件通过公开的 credential-recoveries 协议更新原连接 token。交换与保存使用现有跨进程凭据锁，保留账户、grant、device、generation 和页面证明；原订阅回读新凭据后继续重试。取消或丢响应仍保留 unknown，下一次需要新的确认，不重放 recovery code。原授权已撤销、设备不匹配或服务端不支持恢复时明确提示退出后重新登录，不自动替换授权并接续旧会话。

自动化入口见场景目录的 `connection-recovery`。协议故障注入、真实 Loop 恢复、真实模型协作与实际 macOS 合盖／换网分别记录；自动化时钟跳变不等于实际合盖验收。

## 通用插件回归

插件不按自然语言猜测参数，也不用任务标题或某次失败锁住后续操作。通过当前 schema、精确授权、结构化错误和 API 回执建立通用调用链。保留已公开的专用工具。成员预检同时覆盖 Human 和 Agent；测试业务共享频道与 Host 私密历史频道分开，回归还要验证原同步未受影响。

设置上面的隔离服务、官方 DSH 路径、测试模型密钥，并指定新的 `LOOP_TEST_EVIDENCE_DIR` 后，可执行全部真实模型业务分组：

```sh
node plugins/loop-proxy-dsh/test/run-live-business.mjs
```

每组安装当前包，独立建立合成账号和 DSH Home；记录第一轮结果并逐项通过 Loop 规范 API 回读。某一组失败后仍执行其余组，任何失败或缺失证据都会令汇总返回非零。`human-membership` 包含 Session 3f1fed97 的缺失 Human 成员问题。HTTP 错误保留公共 code、hint、参数校验及结果不确定性，同时过滤凭据和未公开字段。

显式本人身份使用 `human actions/schema/call`：先公开目录和 schema，再由服务端按参数预检精确权限，确认后继续同一个调用。无需模型自行拼权限资源，也不先尝试 Agent 写入；旧手动授权入口保持兼容。新用例覆盖未知动作、拒绝、请求变化、原参数执行及实际 DSH 授权卡。

通用接入层不解析用户措辞来判断身份、目标或能否弹出授权卡。只有当前本地用户请求可发起授权；批准、拒绝、撤权与过期来自实际协议事件。回归覆盖非中文请求、非文本输入、远程输入拒绝，以及英文/中文/其他语言的同一错误码保持相同行为。不存在的目标原样报错，不按报错文字切换身份，也不自动搜索替代目标。Agent 可通过公开目录与显式 Human 调用继续处理。

保留的 `loop_channel_*`、私聊、任务留言、文档链接等便捷入口是已公开的兼容接口，负责其明确参数的映射与返回值校验；它们不对其他通用调用施加先后顺序、自然语言意图或成功条件限制。新业务能力通过服务端 action/schema/授权契约接入，不继续增加场景专用分支。
