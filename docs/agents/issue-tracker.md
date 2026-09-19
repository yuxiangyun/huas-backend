# 本地 Markdown 任务跟踪

用户于 2026-09-19 确认使用本地文件保存规格和任务。规格位于 `.scratch/<feature>/spec.md`，任务位于 `.scratch/<feature>/issues/<NN>-<slug>.md`；一个任务一个文件，编号按依赖顺序排列。

任务声明 What to build、Blocked by、Status 和验收条件。实施前将可执行任务标为 in-progress；完成静态验收后标为 completed，并记录证据与未验证事项。只能开始所有阻塞任务均完成的任务。

技能中的“发布到任务跟踪器”表示写入这些本地文件，不创建 GitHub Issue。修改已有规格与任务时保留用户确认的行为及验证限制。
