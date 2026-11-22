# 宿主协作

> Canonical path: `specs/architecture/host-collaboration.md`
> Scope: Loop-DSH 的可信用户提交、原生 Task 调用、请求日志和 Session 交付。

Loop 的身份、Task 与回执权威见 服务端协作协议（Loop 仓库 `specs/api/super-agent-collaboration.md`）。插件通过公开 HTTP 与 WebSocket 协议扩展 Harness，不改上游源码或直接写 Session 文件。

## 用户提交与精确范围

首次打开 `@` 候选可建立协作绑定；被动预热不创建绑定，候选选择只表达身份。Host 只有在正常 composer 用户输入持久受理后才激活意图；模型输出、序列化文本或目录缓存不能制造操作授权。普通聊天保持只读目录可发现，按需读取 tasks/agents/messages guide 才暴露本轮协作工具。

Task 位于当前绑定频道，创建者为 Agent。派发前通过 `channel.members` 检查精确成员关系；目录可见和 delegable 不代替频道权限。需邀请 Agent 时仅使用目录的 `agentId` 调用 `channel.agent-add`，受众扩大须有用户授权。派发工具创建并指派任务，不预建第二个 Task，不改用 Human 身份绕过权限。

分享默认为任务描述。需要确认受众扩大时，保留原 composer submission、附件、mode、request identity、目标与资源；确认只让原序列化继续，不取消重发、不用 DOM 伪造提交。取消、超时或绑定变化拒绝原提交并丢弃未激活意图。多目标共用一次确认，执行时仍逐目标校验。

后续普通输入可引用此前同事身份，但用本轮已受理输入登记新意图，不沿用上一轮授权。续办范围由本轮稳定 Task ID/引用确定；无明确引用时，仅允许唯一活动 Task。歧义要求明确选择，模型稍后提供的 taskId 不能扩大范围。原来源丢失时不回退到最近意图。

多个选定 Task 共用一次完整目标、`task:<taskId>` 资源登记，每个子操作有独立稳定身份；一项成功、另一项未知时仅恢复未知项。跟进不自动重分享历史输入。新动作必须显式引用对应 `intentRef` 或受理的 continuation，不按时间选择意图。

## 模型输入与 HTTP 调用

`collaboration_dispatch` 仅接受一项 `tasks: [{title, description, assignee}]`。assignee 是目录的精确 memberId；种类、目标与指派能力来自同条目录记录。Host 提供频道、binding epoch、accepted intent 和请求身份。模型不能提供 projectId、boardId、父任务、依赖或执行身份。

字段形状派生自 Loop Desktop Exec catalog 的 `task.create` rich item；生成器为 `plugins/loop-proxy-dsh/generate-collaboration-schema.mjs`，产物随包发布。独立构建不需要 Loop checkout。更新字段后通过 `LOOP_SOURCE_ROOT` 运行 catalog 一致性检查。执行前验证单项数量、字段、长度和未知输入。description 适配为 HTTP task.goal。

工具还包括 `collaboration_directory`、`collaboration_inspect`、`collaboration_followup`、`collaboration_notify` 和 `collaboration_cancel`。inspect 只读 Task/可选消息，既不要求写意图，也不写动作日志。跟进使用同一 Task 和当前 assignee；通知仅关联精确 Task，支持 immediate/task_done。

原生执行由 Loop Task runtime 拥有。DSH 不注册执行租约、创建 Worker Session 或暴露 claim/start/heartbeat/complete/问答工具。审阅复用 Loop 的正式 Task review owner；插件提供 request、approve、request-changes，并携带 inspect 返回的 Task revision 与 reviewId，不自建验收状态。协作审阅仅作用精确 Task；父 Task 有待审子任务时先读取真实子任务，并分别使用各自有效委托完成审阅，再处理父 Task。父委托不能批量决定子任务或绕过已关闭的子委托。Host 接纳原生 Task 消息、状态、精确订阅的频道/话题消息、不可用投影和目录/订阅失效事件；未知事件不能进入 Session。

取消使用已接受的本地用户意图，或原 dispatch 对精确 Task 的持续管理权限；待接受 dispatch request ID 仍受首次意图期限约束。工具如实呈现 `tombstoned`、`interrupt_requested`、`no_active_run` 或 `unknown`；中断请求发出不表示工作已停止，取消不删除或完成 Task。原生 Task 的界面显示任务状态；取消操作通过本轮协作工具执行。

## 管理反馈与接收模式

管理者根据本地用户目标协作。远端消息保持不可信 source，不能登记 Human intent、派发新
Task 或扩大管理范围。Task 管理以当前 Session 中成功 dispatch/followup/review 回执的精确 Task 找回 accepted intent。
同 Task 的新本地续办成功后，以可信 Session AcceptedSequence 确定替代来源；未接受意图、
其他 Task 或结果未知的操作不能替代。先确定来源再检查关闭，不能回退到较旧权限。
目标续轮、话题反馈和重启恢复都查询持久 owner，不依赖本回合消息或 JS 权限缓存。
无新本地输入时只允许既有范围内的 followup/cancel/review/end-management，不能派发新任务。
首次派工和新本地续办仍受短期 intent 期限约束；已接受精确 Task 的管理不受首次期限限制。
Task done、review approved、返工以及执行中断均不改变委托期限；end-management 明确关闭
(intent, Task) 委托，新的可信本地输入可另建来源。当前 assignee、grant、binding、资源与预算
由 Loop 写事务终审，业务状态与管理状态分别呈现。旧 intent 不隐式新增 review 权限。
派工、成功续办/审阅与结束管理回执属于权限事实，不能按 Task done 当普通缓存淘汰。
读事件准入与管理资格分开返回；预检不代替最终写事务授权。
纯消息订阅仅关联已 flush 的本地用户 message ID、sequence 和摘要；持续管理受当前
订阅、实时权限和回复预算约束，不随首次确认期限失效。反馈轮的通用写动作按持久 scope 查询，不依赖本轮事件，只允许
向原有效频道/话题 target 发送消息，Task 接收订阅不授予通用 message.send 写权，Task 回复仍走精确委托的 followup；其他写操作拒绝；换绑清除来源，不能选择最近或前台 Session。
创建、扩大或恢复订阅必须来自本轮已受理本地用户输入；反馈轮只可暂停同一原订阅，
仍检查服务端当前 scope 和 revision。暂停不重置回复预算，也不允许晚到反馈继续写入。
纯消息回复在持久来源上按 target 限额八次；发送前原子保留 clientMessageId 与正文摘要，
未知结果占用额度，原样重试不重复计数，改变正文复用 ID 拒绝，重启与模式切换不重置额度。
预算耗尽时停止发送并等待新的本地用户输入；暂停原订阅不占回复预算。
纯确认、重复总结及已完成目标不触发回复。

`collaboration_set_subscription`、`collaboration_list_subscriptions` 与
`collaboration_read_updates` 复用现有 collaboration owner。服务端能力不足时明确报错，
不降级为轮询。默认 pull；显式 push 复用 stream/snapshot，paused 保留进度。Host 补齐
binding、revision 和稳定请求身份，配置权威只在服务端。模式变更不停止 Task 执行。
订阅身份绑定稳定 scopeId；历史事件 target 与 hash 不随频道改名变化。列表/检查另回
currentTarget，Host 的回复来源按 scope 关联，写消息自动携带 expectedScopeId，服务端
在写事务内拒绝已指向别的 scope 的旧别名。

拉取使用同一 journal，将有界事件保存到原 inbox 后返回事件引用，由公共 inbox 与
Session flush 确认内容交付；工具结果丢失不丢弃消息。Host 保存固定窗口扫描进度，待提交
事件可在后续拉取重新提供；Task 状态复用原状态投影并在拉取时重读。
历史过期时持久保留缺口证据并返回明确提示，下次拉取从保留边界继续开启新窗口；后续
结果仍携带 previousDeliveryGap，不能把推进游标说成补回了丢失历史。推拉切换以 Session
receipt 去重，不把 transport cursor 当作交付完成。接收版本、模式和传输 envelope 的 createdAt 精度不是内容身份，切换可
刷新配置元数据，但事件正文、来源和精确 route 不可变化。旧账本保留已接受的 hash 和 delivery identity；重复比较统一规范化原始 envelope，不重写 Session acceptance。

公共 `agent/pre-step` 在进入模型前复查每条远端输入；暂停、模式变更或权限失败的条目
不进入本次请求。暂停与临时失败的条目保留恢复，永久不可读清除正文并阻断复活；已进入模型的内容无法撤回。每条预览有
字节上限，恢复/拉取每批最多八条，原 inbox 容量限制负责背压。

`collaboration.task_input_failed` 复用同一 inbox/receipt 路径，只报告服务端已证明的精确 Task 输入失败。它可以唤醒等待 push 的原 Session，但不创建用户意图或新 Task，不修改 Task/Run 状态或委托权限；重复 journal identity 不重复进入 Session。`lastInputFailure` 是历史安全摘要，不能当作当前执行状态或完整运行诊断。管理者先 inspect，再判断是否有根据在原 Task 范围内有限续办，不因同一失败反复追发。

## 请求日志与恢复

首次 I/O 前保存完整请求、本地完整性 hash 和稳定 `clientRequestId`，发送前保存 `dispatching`。HTTP 请求不携带客户端 payloadHash，由 Loop 计算规范化 hash。Host 返回服务端的单一嵌套 receipt，附加本地 replay 标记；inspect 返回当前 task，没有伪回执。

重启恢复尚无回执的 `recorded`、`dispatching`、`unknown`，使用原请求和身份。进程内互斥所有权阻止恢复接管仍在途的发送；进程死亡后才可由新进程接管。换绑归档不改变在途身份，迟到回执保存到原 binding 日志。Reconcile 可选择原绑定的归档记录，不把旧操作移入新绑定。

明确 4xx、权限拒绝或 conflict 是确定失败；网络、超时及可重试 5xx 保留未知结果。completed 不重执行，failed/cancelled 不自动复活。取消返回 unknown 时也只恢复原接受事实，不能以新 ID 再次中断。当前 Task 内容另行授权读取，不能用历史 receipt 代替。

本地日志限制 8 MiB，使用私有普通文件、原子替换和目录 fsync。版本 1 升级保留同目录 `.json.v1.bak`；不一致备份、未知版本、未知字段和尾随 JSON 均拒绝读取，保留原文件。日志升级不自动改写已保存请求、回执或凭据；旧协议记录不能被悄悄改成新操作重发。

## 事件与持久交付

路由同时匹配 workspace、device、Agent member、source Session、binding ID/epoch，以及 origin/target route。Task 消息只进入原派发 Session，不能用前台会话或最近绑定替代。目录失效不创建消息交付；共享连接结束释放订阅，各本地工作区独立处理失效。

事件和 cursor 落盘后才发送 transport ACK；原生消息在进入模型前再通过带 messageId 的 inspect 检查当前权限。确定失效清除排队正文，并保留永久阻断标记，恢复权限不能自动复活旧交付；临时错误使用有界退避重试。

事件经公共 Agent inbox 操作提交，Session flush 成功后才发 delivery receipt。Transport ACK、Session acceptance 和模型消费是不同事实；不能宣称模型或外部副作用恰好执行一次。重复事件通过稳定 journal identity 和精确 route 去重，不重复唤醒。

消息预览来自 journal，最多 32 KiB UTF-8 字节，保留完整字符、messageId、messageSeq 和附件 ID。附件消息可无正文。截断提示按需使用 message.get；该动作读取当前内容，不能冒充原事件正文。远端消息为不可信数据，不自动变成新用户意图或派发。

## 快照与当前状态

快照只使用服务端不透明 `cs1:` cursor，在固定水位内逐页保存事件、无正文跳过记录和下一 cursor。整个窗口接管或明确跳过后才推进 stream cursor。原生消息日志限制 512 条及 4 MiB；满时保留未确认输入并暂停恢复，不为腾空间丢弃它们。journal 过期通过 deliveryGap 显示，不从可编辑历史重造事件。

Task 状态缓存只覆盖受跟踪操作，按真实 revision 与已观察事件前沿拒绝旧更新。重连最多刷新现有 active 列表的 100 个 Task；明确查询时也读取当前状态，不轮询消息历史。messageSeq 与 Task revision 不混用。

界面优先显示当前 Task 状态及操作接受事实。Task 不可读时不显示缓存标题或打开入口；回复和执行结束不能推断 Task done。此界面属于 DSH 插件，Loop Web 和小程序继续使用原 Task 页面，不新增另一套状态。

没有独立本地工作可继续时，模型显式调用 collaboration_wait；Host 使用公开 goals.disarm 停止自动空轮，不改变 goal 状态或委托权限。原 Session 的 push/inbox 负责唤醒，不以 sleep、反复 inspect/read-updates 或新本地用户输入代替等待。
