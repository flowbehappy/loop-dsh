# Loop for DeepSeek Harness

这个插件把 Loop 团队工作区接入 DeepSeek Harness（DSH），让你在一个对话里与同事和智能体一起推进项目。你可以让 Agent 查阅知识库、项目文件和频道讨论，使用 Loop 模型和团队 Skill 完成工作，也可以让它创建并分派任务、跟进进度，或运行工作流并查看结果。

## 安装和登录

1. **下载安装包。** [下载 loop-dsh.tgz](https://github.com/flowbehappy/loop-dsh/releases/latest/download/loop-dsh.tgz)，保留原文件。支持的 DSH 版本为 `>=0.2.2-rc.1 <0.3.0`。
2. **安装插件。** 打开 DSH 的「插件 → 添加插件 → 安装第三方插件」，在「包名或地址」中填入下载文件的绝对路径，确认安装。若提示 `koffi` 需要运行安装脚本，核对包名后选择「允许这些脚本并重试」。按 DSH 提示重启。
3. **登录 Loop。** 从 DSH 左下角「更多 → 登录」进入，填入团队的 Loop 服务地址，选择工作区，在浏览器完成登录和授权，然后回到 DSH。

命令行安装可在下载目录运行 `dsh plugin --profile web add ./loop-dsh.tgz --allow-build=koffi`。桌面端先打开一次应用并完全退出，再把命令中的 `web` 换成 `desktop`，安装后重新打开。

## 让 Agent 开始工作

打开一个对话，在**模型选择器**中选一个已授权的 Loop 模型。在输入框键入 **`/`**，选择要用的 Loop Skill，然后说明目标。例如，选择团队的周报 Skill 后，可以这样说。

> 请按刚选的 Skill 整理本周工作，列出已完成事项、阻塞项和下周计划，在当前对话给我草稿。

Agent 可按需读取随插件安装的操作指南，查询当前连接可用的动作和参数。[Agent 操作指南](skills/loop-proxy-harness/SKILL.md)

## 其他常用入口

- **任务与协作**　从侧栏「任务」查看与我相关的任务。输入 `@` 可选择同事或智能体；需要派工时，在消息里写明任务和负责人。
- **知识库**　输入 `/` 选择知识库，让 Agent 查资料并给出来源。
- **工作流与项目**　从侧栏「更多」打开工作流、项目、云盘等页面。

[中文使用指南](docs/public/zh/agents/connect-super-agent.md) · [English guide](docs/public/en/agents/connect-super-agent.md) · [开发与打包](plugins/loop-proxy-dsh/README.native.md)
