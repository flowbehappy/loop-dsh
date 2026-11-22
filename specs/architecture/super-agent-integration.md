# Super Agent 接入设计

> Canonical path: `specs/architecture/super-agent-integration.md`
> Status: living-spec
> Scope: Loop-DSH 的客户端、宿主适配与本机运行边界。

Loop 服务端授权、安装登记和精确退出协议由 Loop 接入契约（Loop 仓库 `specs/architecture/super-agent-integration.md`） 维护。

Super Agent 在 DeepSeek Harness 中运行，以 Loop 工作区里已有的长期 Agent 身份参与协作。这个 Agent 在工作区内有自己的成员身份。宿主可以开多个会话，Loop 用成员身份判断谁在操作，用宿主会话 ID 判断操作来自哪一场对话。

插件提供业务调用、可见对话上传和自己发起的协作结果接收。个人助手不接收其他人的 @ 或派工，不启动入站 Worker。

## DSH 个人助手与统一权限

每个 Human 在每个 Loop workspace 只有一个个人助手，名称默认为“XXX的个人助手”；不同安装和重复登录复用该身份。DSH 不改上游源码，全部通过公开插件接口完成。普通 Loop 智能体的产品行为不变。

统一登录回调只交换一个 `loop.host offline_access` code。主凭据由 Host 保护，模型和同步通过 exact-grant 非秘密引用共用同一 access/refresh pair 和刷新锁；各台机器有独立 grant，可单独退出。服务端个人助手设置是模块/操作权限的唯一来源，所有设备实时使用该设置，资源访问同时受用户当前权限约束。默认读取、写入、模型与上传开启，删除/管理关闭。设置入口在 Loop 账号设置。旧三-token Host 连接升级后需重新登录，助手身份复用。

普通独立授权入口仍保留原有用途范围；下文中关于独立 sync、model 和 Human-delegation 的隔离规则不代表 DSH 统一登录仍需多次授权。页面恢复、Worksite 和一次性 Human 写操作确认保留各自信任边界。

## 从模型的一条命令到 Loop 中的一次读取

用户在 DSH 完成 Loop 浏览器授权后，当前 Session 通过原生 Host facade 调用公开业务协议。连接与资源权限由 Host 和 Loop 分别检查，不依赖终端绑定或独立可执行文件。

DeepSeek Harness 插件加载 [`loop-proxy-harness`](../../skills/loop-proxy-harness/SKILL.md)。
该 Skill 提供调用说明，插件固定 profile、身份和权限。模型可按需查
动作、看一个动作的参数，再单独发出一次调用。下面每一行都是一次独立的宿主工具调用。

```text
loop-proxy context
loop-proxy actions task.
loop-proxy schema task.get
loop-proxy call task.get {"taskId":"tsk_example"}
```

`loop-proxy context` 不接受参数，复用当前 Session binding 的 revision fence，
返回当前 Agent 身份、工作区以及保存的 `projectId` 和 `defaultChannelId`。它不返回凭据、profile、配置或任何
secret；模型应使用该结果定位当前绑定，不应扫描本机配置文件、日志或其他会话状态。
该结果只是绑定事实，不会扩大访问权限。

| 环节 | 谁负责 | 对这次读取做什么 |
| --- | --- | --- |
| 识别命令 | 已安装并受信的宿主插件 | 在启动 shell 前识别保留的 `loop-proxy` 命令，只接受规定的字面语法。带管道、重定向或额外命令的请求会被拒绝。 |
| 核对会话 | 原生 Host | 核实宿主来源、会话绑定、动作和参数。调用直接使用规范动作 ID 与参数对象。 |
| 读取任务 | Loop 服务端与任务模块 | 校验令牌、工作区、有效授权、Agent 当前身份和任务访问权。即使本地绑定放行，Agent 失去任务访问权后，服务端仍拒绝读取。 |
| 返回结果 | 原生 Host 与宿主插件 | 把本次动作的结果交回当前会话。凭据留在受信进程内。 |

虚拟命令与 Skill 按需提供动作说明，命令由 DSH 中间件处理，不安装全局 CLI 或修改 `PATH`。公开 HTTP 协议负责动作目录、鉴权与回执。

## 用谁的身份，授予什么权限

操作者在浏览器中为每种用途分别授权。原生客户端通过 OAuth 授权码和 PKCE 完成登录，由受信客户端持有并刷新令牌。宿主的模型供应商登录或 API Key 只用于访问模型。Loop 动作、对话同步及操作员确认各有独立的授权依据。

| 用途 | Loop 接受的身份和资源 | 权限边界 |
| --- | --- | --- |
| Agent 执行业务动作 | 长期 Agent 的工作区成员身份，资源为 `/api/v1/workspaces/{workspaceId}/external/agent` | 同时受 OAuth 的读写范围、动作和资源限制、Agent 当前所有权及领域权限约束。访问机器或本地文件还须明确授权到目标 Machine 和具体动作。 |
| 以 Human 身份执行业务动作 | 操作者明确委托的人类成员身份，资源为 `/api/v1/workspaces/{workspaceId}/external/human` | 服务端按该 Human 的权限和授权时选定的动作处理，记录实际主体与调用来源。管理动作和资源范围必须在独立 Human 委托中明确授权。 |
| 同步可见对话 | 授权同步的 Human，资源为 `/api/v1/host-sync` | 授权固定工作区、Agent 和宿主来源，只能用于相应会话的同步。服务端在执行入口拒绝同步令牌。 |

[DeepSeek Harness 深度集成设计](../product/deepseek-harness-integration.md)在同一次用户登录中衔接三种用途：Super Agent 以自身绑定的 Agent 身份调用 Loop API，嵌入的 Loop 页面使用 Human 网页会话，宿主同步器使用统一 Host grant 的同步用途授权。现有 Human 委托协议供支持该模式的客户端使用。

### DeepSeek Harness 原生 Loop 体验

#### 按选择激活协作上下文

Loop 通用协作规则放在已有 `loop-proxy-harness` Skill 的主题指引中，协调者不再注入整段固定规则。
明确 `@` 提交只提供本次目标身份；回合结束后清除，历史联系人不维持工具激活。
`loop-proxy guide tasks` 或 `agents` 在本地读取指引，同时为当前回合显示协作工具；
读取指引不查询任务、不授予权限。后续回合需要工具时重新读取指引。
普通聊天、已有绑定和后台活跃任务均不自动显示全套协作工具或注入任务列表。
普通聊天通过 `loop-proxy guide directory` 按需启用只读通讯录，本回合结束后收起。执行复用 Loop 原生 Task runtime，插件不发布 Worker 执行协议。

用户消息由 Host 在 pre-step 领取，但普通输入不自动准备 continuation，前端也不自动绑定续接。
模型从对话中的工具回执与结果取得精确 taskId；缺失时使用授权查询，不猜测。
只有真正调用协作写工具时，Host 才为本轮已领取的真实用户消息准备 continuation，
校验消息身份、摘要、持久化、当前绑定和目标范围。读操作不生成新的写授权。
续接准备期间回合结束、用户输入变化、撤权或绑定变化均不得继续写入。
远端结果不是用户授权；异步回传仍按原有 Session 路由与持久化收件机制处理。
这些执行记录不作为每轮提示词注入；任务续接仍使用原任务，不重复建任务。

- 每个 Run 的来源包括首次派工和追加轮次；快照恢复、执行认领与结果交付均从该 Run 的持久化动作解析原协调者。派工和追加回执保持顶层字段与 `receipt` 内的身份一致。追加指令随动作回执持久化，快照恢复使用该轮指令，不能退回最初的任务说明。
- 同一会话有多个 Task 时，续接携带这些任务的标题和授权范围；工具必须明确指定其中一个任务，目标不明时先询问用户。既有任务无需重复 `@`，未知任务编号不能回落到另一个任务。
- 协作状态按 Task 聚合最新回执，结果与失败仅匹配对应 Run/attempt/generation；已验收任务显示完成，不被较早结果覆盖。
- 派工成功后协调者结束当前回复，由 Loop 异步送回结果或失败；不得通过 shell 等待或扫描本地文件获取远程进度。
- 个人助手不接受入站 Worker 工作，宿主不创建或恢复 Worker Session。

Harness 的 `ctx.tools.register(definition, {when})` 在每一步重新解析可见工具并约束执行
准入。宿主先解析工具与提示，再调用 `agent/pre-step`，因此准备中的明确提交必须提前进入
候选；pre-step 仍须校验消息身份与摘要并完成 intent 激活，否则拒绝模型步骤，候选可见性
不授予执行权限。`when` 只读取同一 Session 的本地状态，避免逐步查询远端。没有本轮明确提交、已接受选择或主动读取任务/智能体指引时，协调操作不可见；后台活跃 Task 不维持可见性。

权威 status、取消/完成、授权撤销或身份/Workspace/binding 切换会清除对应 Session 的旧
激活状态。清理只影响模型可见性和后续新动作，不删除仍待恢复的 result delivery；
pending delivery 继续按原有持久化恢复路径交付。一个 Session 的状态变化不能改变另一个
Session 的提示或工具可见性。可见性不替代服务端授权、身份和资源检查。

Harness 侧栏通过公开 `sidebar.panellist` 常驻注册任务。其余 Loop 业务入口按 Loop 一级导航的顺序在
`sidebar.panellist.actions` 的 **更多** 菜单中展示，每项打开对应主面板。

侧栏左下的 `settings.launcher` 单槽位按原顺序保留 **设置、意见反馈、登录** 三项。
设置调用宿主 shell owner，意见反馈使用宿主配置的反馈地址，登录启动 Loop 统一登录。
展开菜单不触发连接或授权请求。宿主原有 launcher 注册保留，插件 contribution 销毁后
由槽位 owner 自动恢复原入口；不得修改 DSH 源码或依赖宿主私有账户菜单。

模块页面共用一个可保活 iframe；切换模块只改变其中的站内路由，不重建整份页面的登录和
草稿状态。嵌入模式保留模块内容和必要二级栏，隐藏由 Harness 负责的 Loop 一级导航。

统一登录在一次连接确认后自动初始化 Agent、模型与所选的消息同步授权，并选择可用默认模型；
已有有效模型选择保持不变。对用户只有一个登录状态，来源是 Host 的主 OAuth 连接。
Agent、模型和 `host_sync` 保持各自权限范围，但同一次显式 Host 授权共享登录生命周期；
Human page session 是此连接可恢复的投影。凭据由已有 Host owner 按安装、用户、服务端、
工作区和授权类型持久化，不能以聊天 Session 或页面 cookie 作为其存储范围。
页面会话丢失不应使仍有效的连接重新要求授权。凭据保存完成即结束登录，模型及技能目录、
默认模型选择、网页内容、设备登记和历史同步在后台运行。DSH Settings 的 shell、凭据存储和
API Key 编辑仍由宿主 owner 提供。

Web 主应用没有可用模型时，插件通过公开 `settings.onboarding` 的同 id 低优先级注册接管
首启步骤，只提供 **登录 Loop** 与真实 API Key 两条路径。登录 Loop 不以 Harness
Session、Project 或 Agent binding 为前置：插件先配置全局 Loop server，再暂时收起
onboarding chrome，使用已有的唯一持久 Loop 页面完成 Human 登录和 Workspace 选择，
授权与模型配置自动完成后回到可用状态。不要为 onboarding 创建第二个 iframe；离开页面
或切换模块只改变现有页面的可见位置与站内路由，必须保留登录、草稿和导航状态。

首启引导允许稍后设置，关闭后必须移除遮罩与输入限制，不能再显示无法关闭的“已取消”弹窗。
关闭不代表模型配置完成；取消前的异步响应仍按 controller generation 丢弃。用户从既有
Settings 返回时重新检查实际模型，只有满足 readiness 才完成首启。主动返回 Loop 页面检查
配置时，引导保持收起，直到用户选择继续；普通页面刷新不能抢回焦点。

协作详情先展示任务与可执行操作，连接信息和投递记录按需展开。可选的设备远程访问尚未
启用不能覆盖已可用的协作状态，也不是本机对话与派工的前置条件。回到聊天回答或验收时，
关闭详情并将焦点交还输入框。

API Key 路径打开宿主现有的 Models Settings owner，不复制 Key 存储或伪造 configured
状态。`settings.models.sign-in` 的原 owner 及其 `useApiKey()` 路径保留，不能改造成
Loop OAuth。Desktop 应用内以公开 `shell.overlay#desktop-onboarding` 同 id 低优先级
注册覆盖首启 surface，同样复用唯一 Loop 页面；官方 Desktop 启动前 Welcome 是独立
原生窗口，不属于 client slot，允许保留并单独完成配置。

API Key 提醒位于窗口右上方，以有界高度和内部滚动避开编辑器底部操作区。关闭操作只修改
onboarding client 的 `useKeyPanel` 组件本地 `dismissed` 状态；普通 React 重渲染、
打开或关闭 Settings 都不会清掉该状态，关闭也不会调用 `complete()` 或把模型标为 ready。
关闭后可继续使用编辑器；需要添加或修改 Key 时，仍从既有 Harness Settings/Models owner
进入。该 dismissed 状态没有实现跨 App 重启持久化，不能把它当作完成记录或重启后仍隐藏
的偏好。

readiness 必须校验第一条消息实际会使用的选择：无 Session 时使用
`session.modelCatalog().default`，有 Session 时沿用既有
`modelSelection.next ?? lastUsed ?? default`，并精确匹配 provider、Loop connection route、
picker model 和 catalog model。Loop 选择还必须匹配当前 server revision、Workspace 和
Host `modelStatus.accountPrincipal`；已渲染 shared page 的 Human principal/auth epoch 作为
可选交叉 fence，页面未打开或没有 shared snapshot 不能阻断有效 Host model grant。已有
API Key 的有效外部选择保持用户既有选择，不强制绑定 Loop Workspace；Web 首启 mount 的
只读 probe 发现该精确选择后直接跳过初始化。存在其他模型、active connection 或
`connections.length > 0` 均不能代替这个精确选择。保存的默认值无效时，用户必须显式选择
一个真实 catalog 模型。无活动 Session 时，Host 对当前 model registry 校验该候选，
通过公开 `agentDefaultModel.saveSelection()` 等待可写 configEditor 持久化，再以
`currentSelection()` 精确回读证明该全局默认值；缺少 editor、写入失败或回读不一致均不得
报告成功。已有 Session 时继续使用既有 `session.selectModel` 及其 durable
`modelSelection` projection。不得静默改写默认或费用来源。

只有精确选择已证明可路由时，Loop onboarding 才可调用原步骤的 `complete()`。失败、
取消、迟到响应、server/Workspace/account 切换、过期授权、零模型或缺失 catalog 均保持
onboarding 未完成并允许重试。账号 surface 用公开低优先级 slot 替换
供应商登录、充值或账号菜单入口，不删除磁盘凭据；真实模型配额和授权错误继续显示。
会改变模型连接的 status 读取必须先完成 Host sync，再读取 provider catalog。无 Session
显式选择不得为了写默认值创建空 Session：Host 只接受当前 server revision、Workspace、
Human account 与 connection 内的精确 Loop 候选，或已注册的 external provider/model。
Loop provider route 必须与该 Workspace/connection 的既有路由标识一致，不能以同名模型
代替连接匹配。异步解析模型后、实际写入前再次检查当前身份与所选 Workspace。
保存完成后再次核对；写入期间发生身份或 Workspace 变化时报告结果未知，不得报告成功。
取消后晚到结果不得完成；写入结果未知时同 value 重试必须幂等。只有精确 selection/default
回执才可完成。
保存异常或写入期间取消后，Host 必须回读当前默认值，不能声称已经回滚。当前值已变化或
无法读取时，结果为保存未知；发起操作的客户端保留该状态，单独读取内存 catalog 不能
把它变成保存成功。用户再次显式保存并收到确认后，才可完成首启。

模型展示读取当前 Session 的
`modelSelection.next ?? lastUsed ?? default`，并订阅活动 Session 与 projection 切换；
旧 Session 的异步结果不得覆盖新选择。只展示实际选择，不从可用 provider 目录自动替换。
Harness 官方 `llm/adapters-updated`、`llm/models-updated`、
`settings/document-updated`、`credentials/record-updated` 和
`credentials/reference-updated` 事件会刷新模型目录；事件突发合并处理，并与当前用户操作
串行，不中断授权或选择写入。`connection/reset` 进入新的 catalog generation，
fence 掉旧 catalog/status 响应对当前 readiness、模型选择和默认写入决定的影响，再读取
当前 status。目录刷新失败必须清除旧 catalog 的 ready authority 并显示
`catalog-unavailable`，不能继续把上一次可用模型报告为 ready；后续成功事件可恢复。
目录事件不会自动改写 Session 或全局默认模型；原选择失效时仍须由用户显式选择。
Loop 模型来源和费用主体只由真实 provider route 与 `wire:source:provider:model` picker
identity 对应的精确 connection 推导；无法唯一对应时显示待确认，不按显示名称或裸 model
ID 猜测。Loop 插件不提供供应商登录、充值、赠金、账号菜单或 sign-out 入口；真实模型
配额、授权和失败状态仍由既有模型 owner 显示，不能因替换账号 surface 而隐藏。

Loop 服务地址、账户与 Workspace 选择及聊天上传授权位于 Harness
原生 Settings 的 Loop 页，而不是某个 Harness Workspace 的 binding 字段。保存服务器
地址前必须校验并探测目标服务；成功后才持久化并切换，失败时保留原地址、页面和表单
内容。服务器地址可以使用 loopback HTTP 做本机开发，其他地址必须使用 HTTPS，且不能
包含账号密码、查询参数或 fragment。Loop Workspace 也按服务器分别记忆，由用户在
Loop 原生登录和 Workspace chooser 中明确选择，不从 Harness 本地路径、第一个 API
结果或用户输入推断。

账号弹窗的「浏览器登录」在外部浏览器完成；打开全局 Loop 模块复用同一次连接建立的
isolated Human page session，不要求第二次登录。页面会话丢失时，Host 使用主 OAuth
和显式同意的安装 proof 请求一次性页面入口；主连接无效时移除页面并回到统一登录入口，
不回退到独立网页登录。该复用只作用于 Human 页面访问，不导入或扩大
Agent 执行、host-sync 或 Project binding 权限；页面操作继续按当前 Human 的实时
权限校验。

账号弹窗也支持 **Access Token**。用户在 Loop 的「设置 → 外部智能体 → 默认个人助手」签发 DSH 登录令牌。Host 将令牌提交到同一服务器的 `/api/v1/auth/external-host/token-login`，完成 PKCE 兑换后只保存该安装自己的设备凭据。动作、模型和同步沿用个人助手的实时授权。签发令牌的到期时间限制设备授权，撤销签发令牌会断开使用它登录的设备。普通外部智能体的动作令牌仅用于其独立身份的 API 调用。

令牌登录后，个人页面入口会发起一次设备页面授权。用户在浏览器中以原账号确认后，插件在原面板打开所选页面，重启后沿用授权。业务和应用委托各自请求用户确认。断开设备时，如果 Loop 要求本人确认，DSH 打开原有的浏览器确认流程。

DSH 插件把包内的 `loop-proxy-harness` Skill 安装到安装时指定的项目。自动导入创建的
新 Workspace，以及更换目录后新建的 Workspace，也必须从同一受信包安装或关联该 Skill；
安装器或 Host 只管理自己拥有的 Skill 目录，不覆盖用户编写的 Skill。
`loop-proxy-harness` 指导模型先用无参数的
`loop-proxy context` 读取当前绑定，不扫描本机配置或日志。

模块页通过父页一次性 nonce、当前服务器 revision 和站内路径与 Harness 同步路由。父页
只接受当前 iframe `contentWindow` 与当前配置服务 origin 全部匹配的消息；消息不包含
token、Cookie、page launch、Agent 凭据或 OAuth scope。服务器切换后恢复该服务器已
保存的 Workspace，旧服务器的选择不能在新服务器上复用。页面可在安装消息监听后发送
不含数据的 ready 信号，父页仍须先校验当前 iframe 与 origin 再下发 nonce，避免加载
时序导致握手丢失。项目打开意图只传经过校验的 Workspace ID 与 Project ID；父页校验完整服务器地址（含部署路径），再把它解析成带工作空间限定的 Loop 项目
详情路径，并选中常驻 **Loop 项目** 模块，不能在消息中传递完整外部 URL。

#### 常驻页的共享数据入口

插件只维护一个按当前 Loop 服务器和人类页面身份绑定的根级共享数据服务。常驻页已有的
QueryClient、消息投影和工作区 IM WebSocket 继续是数据所有者；页面在嵌入适配边界发布
有界投影，原生模块只订阅插件根服务。原生模块不得自行打开消息套接字、复制浏览器凭据，
也不得通过 DOM 或 React 私有状态取数。根服务提供同步 `query`、可退订的 `subscribe`
以及明确的连接和重建状态；消费者只持有自己的有界本地视图。

插件客户端加载后即读取已保存的 Loop 服务器和人类页面会话，并在会话有效时初始化这个
数据接收所有者。初始化不以用户是否打开 Loop 模块为前提，也不创建第二个页面。没有服务
器或页面会话时保持未连接，不自动打开 OAuth，不发起授权。读取实现复用现有服务状态和
页面入口，授权仍只在用户明确触发现有登录或连接操作时发生。

共享订阅以服务器 revision、iframe、nonce、工作区、人类主体和工作区授权代次共同约束。
授权代次取自现有页面会话恢复 revision、会话失效状态和服务器传输凭据 revision，不由
工作区成员 ID 或普通 React 渲染推导。身份、工作区、授权代次或服务器切换时，父页取消
旧订阅并清空旧投影；页面和父页都拒绝旧 nonce、旧 revision、旧授权代次或旧订阅 ID 的
迟到消息。一个页面只有一个受支持的共享订阅，多个原生消费者订阅同一根服务的本地快照，
不重复建立传输。

初次订阅先返回带协议版本和连续序号的完整快照，后续只发送发生变化的字段增量。父页缓存
有界视图；增量出现序号缺口时进入重建状态并重新订阅，必须等待新快照后才能恢复，不能
跳过一个区间继续展示。页面卸载、退订、工作区切换或桥接超时都释放页面侧 QueryClient
监听并显示明确状态，不用定时读取消息或任务作为降级手段。

当前共享 schema 只包含收件未读总计、未读会话数，以及 Workspace IM 的
`connecting`、`connected`、`reconnecting`、`disconnected` 阶段和重连时间元数据。
未读投影必须区分 `not-ready` 与可信的 `ready` 值；权威未读缓存尚未加载或读取失败时
不能伪造成零，原生界面只消费 `ready` 值。`ready` 的真实零可以清除徽标，短暂
`not-ready` 不能清除最近一次同授权代次的已加载徽标；权威缓存就绪后由现有 QueryCache
更新继续发布，不新增请求或轮询。
消息正文、完整收件列表、成员目录、Agent 运行上下文和凭据不进入共享桥。需要正文时，
操作者仍在 Loop 页面内按原有权限打开；该投影也不是 Agent 工具或模型上下文，不能把
人类可见数据自动提升为 Agent 可读取的数据。当前不提供原生 Loop 收件入口；连接状态提示
和其他原生消费者使用同一根服务。只切换原生模块不会重建常驻 iframe、QueryClient 或
工作区 WebSocket。

模块页面使用独立于 Agent 执行和 host-sync 凭据的 Human 浏览器会话，并使用
`external-global-page` 及 `loop_external_global_page_*` Cookie family。由 Workspace
Project 菜单打开项目时，Harness 关闭绑定 overlay，并使用这个共享模块页路由到对应
Project ID，不再创建独立 iframe 或 modal。项目只有在 binding 为 active 且绑定服务与
全局模块当前规范化服务基址一致时才执行打开动作；未绑定、失效、旧服务器或无法确认的
目标只显示恢复路径。共享页面的登录、刷新、退出和实时连接使用自己的 family；仍直接
请求 Project-scoped page session 的已发布客户端继续使用 `external-page` 及
`loop_external_page_*` family。两类页面的登录、刷新、退出和实时连接必须按自己的
family 隔离，一个页面的退出或凭据失效不得清除另一个页面。宿主只传入 Loop 页面入口，
不向页面、模型、工具参数或本地绑定文件传递执行 token、refresh token、Cookie 或
page-launch assertion。页面操作继续按当前 Loop Human 的实时权限校验，不能借用已
授权 Agent 的权限。

Workspace 标题菜单明确区分当前绑定和切换选择：查看绑定、绑定成功和切换成功复用同一
组项目详情字段，并提供 **打开 Loop 项目**；切换流程先展示当前绑定，再展示候选项目，
默认选项保持在当前项目而不是列表第一项。打开动作经过当前 server revision fence 后，
只改变共享页面的项目路由和 native 模块选择。

Harness Workspace 标题菜单独立管理该 Workspace 的 Loop Project/Agent 绑定：查看、
绑定、切换和解绑不依赖模块页面；模块页面也不依赖该绑定。已绑定 Project 的会话同步
和 Agent 执行仍使用各自授权。模型或工作区参数不能把模块页面改成另一个 Loop 身份。

### 本地工作区与后台上传

Harness 本地工作区自动关联同名的个人私有频道，每个会话对应频道中的一个话题。
首次解析后保存频道 ID，重命名不改变关系；不要求 Project 选择，不从 Loop 反向创建
本地目录，也不提供逐工作区的目录迁移或项目关联界面。已有已发布会话保留原目的地，
新会话采用当前工作区频道，防止升级复制历史。服务端持久身份、私有性与兼容协议见
外部宿主会话同步（Loop 仓库 `specs/api/external-host-sync.md`）。

上传从前台操作路径中分离：前台事件只调度会话，后台合并触发、分批读取本地日志并写入
既有持久队列。授权、网络或队列失败不阻塞聊天，不弹出授权或错误窗口；用户悬停状态
时读取本地回执。冷会话使用官方只读 Session observation，Web/Desktop 共享 Home 时
沿用同一 installation 和频道身份。消息去重、凭据及投递恢复继续由 原生后端
负责，不为插件再建立一份聊天历史库。

账号菜单的连接状态以 Host 验证的主 OAuth 及本机完整凭据为准，不依赖目录、同步进度或内嵌页面是否挂载。
仅登录内嵌页面不能被标作完整连接；已有上传授权不因 Host 重启丢失页面 Cookie 而失效。
显式打开授权页后，插件可在 challenge 有效期内检查完成状态；同一 challenge 不重复
打开窗口；统一连接不逐项追加授权。成功、错误、到期或插件卸载后停止检查。
本机凭据存储拒绝访问时返回 `loop-host/credential-unavailable`，与网络不可用分开处理；
后台不得因此弹出系统授权窗口，也不得把凭据静默降级到文件存储。

### 账号退出

外部宿主的退出确认使用独立账户级路由；工作区补全跳转不得改写该确认路由或丢弃待确认操作。其他 Loop 页面的工作区跳转和登录行为保持各自既有契约。

Harness 的 **设置 → Loop → 退出 Loop** 作用于当前账号、服务器与 Loop 工作空间连接，
不依赖任何本地工作区或旧项目绑定。Host 复用 server-owned Disconnect operation，
冻结并撤销该连接的精确 Agent、model、host-sync 授权集合，不撤销其他服务器或账号的连接。

点击退出后，BindingStore 持久暂停该连接的工作区发现、会话捕获和上传，通知上传队列
撤回已缓存的投递目标。本地聊天记录、Loop 已有频道和已上传消息均保留。断网或人类确认
未完成时，只显示待完成状态；不能把本机暂停当作服务端撤销成功。原账号通过浏览器确认后，
Host 验证服务端完成回执，再移除凭据和当前连接的本地映射。下一次登录重新验证身份并恢复自动映射。

完成记录必须覆盖服务端撤销、本机凭据清理、Host 回复和活跃账号指针更新之间的中断窗口。
Host 保留已完成的账号退出回执用于幂等重试，下一次验证通过的登录使旧回执失效；BindingStore
保留本机完成标记，使重启能清理失去更新的活跃账号指针。恢复过程不重新撤销其他授权，
也不把上传授权提升为 Agent 执行权限。

Workspace 在 binding 生效后新建的 Session 自动采用该 Project 的出站同步意图，包括自动
导入的受管 Workspace 和用户明确关联 Project 的手工 Workspace；不需要逐 Session 再次
绑定或开启。binding 生效前的 Session 和未绑定 Workspace 不会被静默回填。Host 应分别
记录项目默认选择与用户明确选择，使旧 Session 缺少选择时保持关闭，用户明确关闭的
Session 也保持关闭；重新开启可恢复同步，但不会改写该 Session 已固定的 Project revision。
`session/created` 只能作为尽早 capture 的优化；Workspace registry 尚未投影该 Session
时，受信 Host 必须在首条 telemetry admission 前通过有界重试解析 Workspace 并完成 capture，
不能为未知 Workspace 无限轮询或把首条事件直接丢弃。

自动同步意图不替代独立的 host-sync 授权。已有有效授权时，新 Session 的首条允许发布的
可见事件直接进入现有 outbox。授权缺失或过期时，UI 必须清楚提示并复用现有 browser
OAuth 流程；一次针对该连接的授权成功后继续发送待处理的首条消息，后续新 Session 不重复
要求逐 Session 开关。该授权不得复用 Agent 执行授权。

自动 Session 的确认边界属于 host-sync outbox 的 source sequence，不能使用 Harness
自身 Session 序号或其他宿主的计数空间。OAuth 继续、进程重试和授权恢复必须复用同一个
pending outbox 边界，使等待授权期间的首条可见消息仍高于发布 fence；用户显式关闭后再
开启时才建立新的用户选择边界。

授权 credential 缺失时，受信 Host 可以把已通过 Session admission 的可见事件写入该
Session 的 stopped pending outbox；该 outbox 必须绑定稳定的 profile + Session pending
scope，不能成为可由后续任意连接上传的无归属队列。OAuth callback 应先用新 host-sync
token 对现有 Host Sync Session 入口完成 workspace、Agent、resource、Project/default
Channel 与 boundary 校验，再保存 credential。credential 替换只能迁移当前 challenge
对应的 Session outbox。同一受信 account、Loop workspace、Agent、Project/default
Channel 下，其他尚未过期的 pending Session 必须继续保留为 stopped，等待各自授权，不能
被首个成功授权静默删除。一次正确的首次授权可以在同一连接 context 下激活这些 eligible
pending Session；pending 归属只属于该 Host profile 的当前 account/workspace/Agent/
Project/Channel，并设有有界有效期。归属不匹配、已过期或来自旧连接的 outbox 必须清除。
校验或保存失败必须保持 fail closed，不能用 Human page、Agent execution grant 或 Host
Action 的旧 execution binding 替代本次 host-sync 权限。

DSH 个人助手不启用 Loop @ 入站收件或后台 Worker 唤醒。可见会话同步只负责授权的出站上传，页面登录、安装绑定和其他服务器 profile 都不能开启入站派工。

Loop 模块的短期不可用只影响对应面板，不停止 Harness、其他面板或其他 Workspace。
用户可用 **重新连接 Loop** 重新取得页面入口；普通面板切换保留已打开的 Loop 页面及其
产品内位置。Loop 登录入口在跳回产品前删除 fragment 启动参数，下一跳只接受同源
站内 path；跨源、协议相对地址和内嵌授权入口回退到产品首页，不能让登录页成为开放跳转。
Project-bound 页面使用 Host 新签发的一次性授权页；授权页过期、已消费或会话失效后必须
重新取得，旧授权不能重放。模块页面使用从 Host OAuth 恢复的隔离 Human 会话，不借用也不清除该 Project
页面授权。Workspace 绑定详情和切换成功后的打开动作不申请 Project-bound 页面授权，
而是复用全局模块页及其独立 Human 会话。

**本地会话绑定只能收窄服务端授权。** 模型不能通过参数另选身份、工作区或凭据。Human 委托使用独立原生连接，按精确动作和资源执行；写操作保留其并发版本与幂等要求，未知结果先查原回执或回读资源。凭据由 DSH provider 保存，不进入工具参数、模型上下文或项目文件。

## 同步与协作消息

Host Sync 使用同进程的原生 writer 与持久 outbox。动作执行和同步分别检查当前 grant 的用途；个人助手的入站执行入口保持关闭。

**把宿主对话同步到 Loop。** 宿主适配器只采集选定会话的可见事件，包括 Human 与 Agent 的可见文本、工具运行状态和允许的资源引用。隐藏推理、原始工具参数和附件内容不随对话上传。事件先进入本地待发送队列，断线后按稳定事件标识重放，Loop 据此去重。默认落点是只含该 Human 和 Agent 的私有会话。只有 Human 明确确认后，后续事件才可进入指定 Channel、Task 讨论或 Project 下选定的一个 Channel。确认前的私有历史即使晚到也保留在原处。适配器按游标读取后续 Loop 回复并区分来源，避免来回重复导入。宿主会话同步协议（Loop 仓库 `specs/api/external-host-sync.md`）

新安装或新账号还没有 sync 预置授权时，自动同步 Session 的 UI 提供一次正常
browser OAuth 同意入口。宿主插件返回可恢复的登录 challenge，UI 在当前上下文打开浏览器；
DSH 统一登录提供 `loop.host`，同步仍需相应上传权限。
同意完成后继续最初的自动同步意图和待处理的首条消息。该流程不得要求终端命令、粘贴 token、
使用 Agent bearer 或先写本地开关；拒绝、取消、授权不匹配和频道权限不足都必须保持关闭。
首次建立同步时记录当前 source sequence，之后只发布高于该边界的可见事件。重复授权、并发启用
和授权后重试复用同一 challenge、Session 映射及已确认的频道和话题，只有首条允许发布的
事件创建话题。显式断开连接撤销所选 sync grant 并清理对应待发队列，远端撤销失败时不得
报告断开成功。

已验证的 Host Sync credential 可通过既有 Host Sync API 的 `GET /grant` 读取它自己的
exact `grantId` 和 workspace。Host 在首次成功同步时把该非秘密身份保存在私有本地状态，
供后续 `disconnect-loop-full-exit` 冻结精确集合。该读接口不接受浏览器 Cookie，不返回
bearer，也不允许查询同 Human 的其他 grant。

**个人助手的入站隔离。** Loop 的 @ 候选排除 Super Agent，旧提及只保存为普通消息，不创建 Inbox 或执行任务。Host 不发布 Worker 执行接口。自己发起任务的结果按原协作路由和普通权限交付。公开讨论的回复须匹配设备绑定、原 Session、订阅及当前读取权限。修改接收设置要求 Host 认领本地真实用户消息。远程回复只能在原目标、授权期限和八次发送的共用预算内延续讨论。Super Agent 入站边界（Loop 仓库 `specs/api/external-host-binding.md`）

个人助手创建频道根消息和话题后，可以在第一次请求回复前显式启用 `push` 或 `pull`。
Loop 在该写入事务中校验根消息作者、频道权限和已有参与状态，并同时登记参与和接收设置。
仅解析订阅目标不改变参与状态。Host 按事件 ID 持久化投递，进入 Session 前重新验证。
长回复的投递正文是有界预览，客户端用 `message.get` 对同一目标及消息 ID 读取剩余正文，
后续分段沿用正文摘要校验版本。完成讨论后的暂停依然需要已接受的本地用户消息。

## 宿主信任边界

原生插件使用官方 DSH provider 和工具中间件，信任 Host、已安装插件与当前 OS 用户。状态目录必须在模型工作区之外。公开工具从真实 Session 取得上下文；Skill 只提供说明，不授予权限。服务端始终检查 OAuth、动作、资源和当前主体。该边界不声称隔离同用户任意代码，详见[本机安全](local-host-security.md)。

远程浏览器访问同一已运行 Host 是另一条 authority 和 transport。
它要求 Human 与 installation 的独立 worksite 授权、一次性浏览器 launch、
per-installation origin、route session 和固定 Host generation；不继承 Agent、
model、Host Sync 或 workspace membership。实现边界见
Harness Worksite Transport（Loop 仓库 `specs/architecture/harness-worksite.md`）。

## 怎样验收一个宿主

按“宿主入口 × 实际运行时 × 能力”记录结果。执行能力用真实模型发起受限调用，并由 Loop 正常读路径核实目标、内容和主体。同时检查另一个会话、越权目标与已撤销授权都会被拒绝。同步能力单独验证可见事件到达、私有历史边界和断线重放。入站隔离验证旧 @、其他人的派工和旧 Worker 状态都不能激活个人助手。桌面产品的端到端验收还须从实际窗口完成对应操作。具体验收场景见[Super Agent 端到端测试](../../docs/testing/super-agent-e2e.md)。

## 工作界面的资源入口

DSH 侧栏常驻任务，其他业务页面从插件栏的“更多”进入。底部菜单提供设置、意见反馈和 Loop 登录。

输入框的 `@` 智能体和 `/` Loop 技能候选只展示可读名称及必要的来源、权限说明，
不展示内部引用 ID。发送后的聊天记录通过 DSH 的用户文本扩展点显示技能名和智能体名，
持久化内容及模型输入保留原始引用，不能为调整展示而改写执行数据。候选的展示名称不承担资源标识：同名资源仍通过引用值保留各自的
身份及精确版本。输入 `/Loop` 可查看 Loop 技能，也可以继续输入名称筛选；筛选复用
当前会话和权限范围内的候选缓存，不因输入前缀重新请求全量目录。协作分享范围确认后关闭弹窗并继续原消息发送；
执行进度保留在协作详情中，不自动打开详情遮挡主会话。协作确认弹窗挂载于宿主 shell，
而不是仅在已有消息时出现的输入框状态栏；空白聊天的第一条 `@` 消息也必须能确认、取消和继续发送。协作详情展示任务名称；
同一 Task、Run、attempt 和 execution generation 的结果已确认进入聊天后，状态显示
“结果可用”，提供验收入口，不继续显示最初的派工回执状态。未送达或身份不匹配的
结果不能据此将任务标为完成；任务是否通过验收仍由 Loop 的任务状态决定。
