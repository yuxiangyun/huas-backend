# treehole/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/AGENTS.md

成员清单

api/treehole-api.ts: `/api/treehole` 图文帖子、multipart 发布、评论、幂等点赞与删除传输边界
api/treehole-queries.ts: TanStack Query 查询和 mutation 编排，元数据使用 6 小时引用策略、Feed 使用共享 60 秒策略，保持公共/本人/指定用户列表与详情缓存同构，并为幂等点赞提供跨缓存乐观反馈与失败回滚
model/treehole-query-keys.ts: Treehole 元信息、三类帖子列表、详情与评论缓存键命名源
model/treehole-types.ts: Treehole 私有图片、帖子、评论、分页与服务端上传限制的前端契约
ui/treehole-post-media.tsx: Treehole 鉴权媒体展示边界，首页只挂载近视口首图，详情按首图比例只挂载当前与相邻滑动图且轮播只负责横向切图，纵向手势回到详情滚动层

架构决策

Treehole 图片是 Bearer 私有资源，任何展示只能复用 shared/ui 的私有媒体原语，禁止将服务端 URL 直接写入 `img src`。
首页每帖只挂载首图并按视口邻近懒取；详情保持完整图片元数据和占位，但 Blob 请求窗口只覆盖当前与相邻图片，以服务端宽高提前稳定布局。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
