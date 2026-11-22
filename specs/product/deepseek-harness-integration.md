# DeepSeek Harness 与 Loop 集成

> Canonical path: `specs/product/deepseek-harness-integration.md`
> Status: active
> Scope: 本机 Harness 工作区、Loop 账号、会话上传与任务协作。

## 日常入口

用户从独立 DeepSeek Harness Desktop 或 Web 开始工作。Loop 插件提供账号连接、模型、
Loop 业务页面、技能与智能体候选。Loop 主导航不提供启动 Harness 的入口。
宿主模型配置与 Loop 业务连接分别管理；模型可用不代表已获得 Agent 执行或会话上传权限。

连接以服务端验证的 Human、Loop server 和 Loop workspace 为准，不能从设备名称、
本地目录、模型参数或最近使用的 profile 推断身份。切换账号、服务或工作区后，旧响应
与旧目录缓存不能进入新连接；本地会话和文件不因 Loop 暂时不可用而停止。

## 工作区与会话

Harness 本地工作区按稳定 installation 和 Workspace ID 自动映射到同名的个人私有
Loop 频道，不要求先创建 Project 或选择 Task board。首次解析后保存频道 ID，重命名
不改变关系。失权、共享状态变化或频道删除不能让宿主改投另一个同名频道。
每场会话对应一个普通频道话题，首条允许发布的可见事件建立话题，后续消息复用同一目标。
本机 Session 仍由 Harness 保存，Loop 不成为第二个本地会话执行器。

上传检查统一 Host 连接的 `sync.upload` 授权。前台只调度捕获，后台有界读取官方 Session 接口并写入
现有 durable outbox；凭据、隐藏推理和任意文件内容不能随会话上传。后台失败不得阻塞
聊天或弹出凭据授权窗口。迟到的读取和授权结果必须匹配当前连接 generation。

绑定 Project 仅确定项目。历史会话经用户单独启用上传后，重试与重启恢复使用该会话保存的频道与话题。仅从项目继承的历史目的地不再用于上传。已有项目绑定的切换和解绑遵循独立的兼容契约，不成为新本地工作区的
前置步骤。服务端同步契约（Loop 仓库 `specs/api/external-host-sync.md`） 是频道身份和写入权限的权威。

## 任务与能力

DSH 是用户的个人助手（Super Agent），在当前 Host 身份和授权范围内负责调查、选择、
执行、协调与核验结果。角色说明是通用职责，不预加载业务数据，不代表 Human 身份，
也不授予新权限。用户已明确给出的目标、选择与授权不应被反复要求确认。

用户可在输入框 `@` 选择具有授权的 Loop Agent，也可用自然语言指定协作者或授权助手
自行选择。自然语言路径通过 `collaboration_prepare` 将目录中的精确身份绑定到本轮
实际用户消息；不接收模型提供的账号、会话、消息正文或扩大分享参数。仅查询目录不
建立意图，远端协作消息也不能充当用户请求。准备不建任务、不发消息、不邀请成员。
用户提交后，协调 Agent 通过 Loop 创建 Task
并指定 assignee；后续调整继续原 Task，不用普通频道 mention 代替任务派发。结果只按
精确 Task、Run、attempt、generation 和来源消息恢复，不选择最近消息猜测完成。
普通 Loop Agent 通过既有原生 Task runtime 执行；插件只提交授权操作并接收 Task 消息及状态。

工作区映射未就绪时，Host 可按原有 host-sync 授权准备当前本地工作区；协作路由只绑定
到它已保存的精确频道。已有项目、账号、服务器和频道冲突不自动迁移。派工前核对频道
成员；新增成员涉及频道内容分享，仍需相应权限与用户授权。默认只分享任务描述，
不将“主动工作”解释为扩大资源可见性。回执、执行完成和交付验收分别报告。

`/` Loop 技能候选仅展示当前 Agent 可用的精确版本。选择候选不执行技能，只有真实用户
提交后才读取该版本正文并进入正常模型工具循环。技能目录不作为全量 roster 注入上下文，
缓存或显示名称也不能扩大资源权限。实现边界见[技能输入框](../architecture/skill-composer.md)。

任务、能力、通讯录与工作流复用 Loop 已有业务页面；内嵌页面以自己的 Human session
访问业务。Agent 执行、Human 委托、页面登录、模型和同步的凭据互不替代。

## 退出与恢复

账号退出冻结当前 server、Human、workspace 的精确 grant 集合并暂停本地捕获和上传。
服务端完成对应 Disconnect operation 后，宿主才清除对应本地凭据与连接映射。断网、
取消、未确认或未知结果保留可恢复状态，不能显示已撤销，也不能影响其他账号或设备。
本地聊天历史、Loop 已有频道和已上传消息保留。下一次登录重新验证身份和授权。

协议与安全边界分别见[客户端接入设计](../architecture/super-agent-integration.md)、
[本机宿主安全](../architecture/local-host-security.md)和
Loop 服务端退出契约（Loop 仓库 `specs/architecture/super-agent-integration.md`）。

## 验证

每个声明支持的平台记录实际 Harness 构建、集成包和 Loop server 版本。Web 与 Desktop
分别从真实界面验证登录、模型回复、工作区上传和回读、任务委托与结果、重启恢复、撤权
后的拒绝，以及账号切换隔离。组件测试、fixture 写入或 CLI 结果不能替代桌面窗口验收。
测试步骤见[端到端指南](../../docs/testing/super-agent-e2e.md)。
