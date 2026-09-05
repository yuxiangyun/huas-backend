# 一键评教 API 接入

所有接口都需要登录后的 Bearer Token：

```http
Authorization: Bearer <token>
```

## 1. 发现评教列表 URL

用于后端从教务系统首页/菜单中发现当前评教入口，并继续进入入口页解析当前评教批次列表 URL。

```http
GET /api/evaluations/discover
```

成功响应：

```json
{
  "success": true,
  "data": {
    "evaluationRequired": true,
    "listUrl": "https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_list.do?pj0502id=...&pj01id=&xnxq01id=2025-2026-2"
  },
  "_meta": {
    "cached": false,
    "source": "jw"
  }
}
```

如果当前菜单或入口页没有可用评教批次：

```json
{
  "success": true,
  "data": {
    "evaluationRequired": false,
    "listUrl": null
  }
}
```

## 2. 查询评教状态

用于前端检测是否存在未完成评教。

```http
GET /api/evaluations/status?listUrl=<encodedListUrl>
```

`listUrl` 是教务系统评教列表页 URL，需要 `encodeURIComponent`：

```ts
const listUrl = 'https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_list.do?pj0502id=...&pj01id=&xnxq01id=2025-2026-2';

const res = await fetch(
  `${API_BASE}/api/evaluations/status?listUrl=${encodeURIComponent(listUrl)}`,
  {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
);

const body = await res.json();
```

成功响应：

```json
{
  "success": true,
  "data": {
    "total": 12,
    "pendingCount": 12,
    "items": [
      {
        "index": "1",
        "teacherId": "2431",
        "teacherName": "张华",
        "college": "文史与法学学院",
        "category": "理论课（含实践、实验）",
        "totalScore": "0",
        "evaluated": "否",
        "submitted": "否",
        "pending": true
      }
    ]
  },
  "_meta": {
    "cached": false,
    "source": "jw"
  }
}
```

前端判断：

```ts
if (body.success && body.data.pendingCount > 0) {
  // 弹窗询问：是否默认满分评教
}
```

## 2.1 成绩接口触发信号

当教务系统返回“评教未完成，不能查询成绩”时，`GET /api/grades` 会返回明确业务错误：

```json
{
  "success": false,
  "error_code": 4004,
  "error_message": "评教未完成，不能查询成绩",
  "data": {
    "evaluationRequired": true,
    "listUrl": "https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_list.do?pj0502id=...&pj01id=&xnxq01id=2025-2026-2"
  }
}
```

前端可以优先使用 `data.listUrl` 弹出满分评教确认框；如果极端情况下 `listUrl` 为 `null`，再调用 `GET /api/evaluations/discover` 重试发现：

```ts
const grades = await getGrades({ refresh: true });

if (!grades.success && grades.error_code === 4004 && grades.data?.evaluationRequired) {
  const listUrl = grades.data.listUrl ?? (await discoverEvaluation()).listUrl;
  // 弹窗询问：是否默认满分评教
}
```

## 3. 满分评教预检

用于用户点击确认前，验证本批目标的评教表单。不会提交评教。`batchSize` 默认 2、上限 3、下限 1；预检与真实提交各自从当前列表选择一次目标。

```http
POST /api/evaluations/submit-full-score
Content-Type: application/json
```

```ts
const res = await fetch(`${API_BASE}/api/evaluations/submit-full-score`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    listUrl,
    comment: '好',
    dryRun: true,
  }),
});

const body = await res.json();
```

成功响应（只有一项可操作任务的例子）：

```json
{
  "success": true,
  "data": {
    "dryRun": true,
    "status": {
      "total": 1,
      "pendingCount": 1,
      "actionableCount": 1,
      "blockedCount": 0,
      "completedCount": 0,
      "items": [
        {
          "index": "1",
          "teacherId": "2431",
          "teacherName": "张华",
          "college": "文史与法学学院",
          "category": "理论课",
          "totalScore": "0",
          "evaluated": "否",
          "submitted": "否",
          "pending": true,
          "actionable": true,
          "blocked": false,
          "state": "pending"
        }
      ]
    },
    "targetCount": 1,
    "attemptedCount": 0,
    "previewedCount": 1,
    "submittedCount": 0,
    "failedCount": 0,
    "batch": {
      "limit": 2,
      "availableCount": 1,
      "selectedCount": 1,
      "remainingCount": 1,
      "hasMore": true,
      "verificationRequests": 0
    },
    "items": [
      {
        "index": "1",
        "teacherId": "2431",
        "teacherName": "张华",
        "college": "文史与法学学院",
        "category": "理论课",
        "totalScore": "0",
        "evaluated": "否",
        "submitted": "否",
        "pending": true,
        "actionable": true,
        "blocked": false,
        "state": "pending",
        "questionCount": 17,
        "fullScore": 100,
        "status": "dry_run"
      }
    ]
  },
  "_meta": {
    "cached": false,
    "source": "jw"
  }
}
```

## 4. 确认满分评教

用户明确选择“满分评教”后调用。后端会按每个评分项实际最高分填写；学生评价为空时默认填 `好`。

```http
POST /api/evaluations/submit-full-score
Content-Type: application/json
```

```ts
const res = await fetch(`${API_BASE}/api/evaluations/submit-full-score`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    listUrl,
    comment: '好',
    dryRun: false,
    confirm: true,
  }),
});

const body = await res.json();
```

成功响应（只有一项可操作任务的例子）：

```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "status": {
      "total": 1,
      "pendingCount": 0,
      "actionableCount": 0,
      "blockedCount": 0,
      "completedCount": 1,
      "items": [
        {
          "index": "1",
          "teacherId": "2431",
          "teacherName": "张华",
          "college": "文史与法学学院",
          "category": "理论课",
          "totalScore": "100",
          "evaluated": "是",
          "submitted": "是",
          "pending": false,
          "actionable": false,
          "blocked": false,
          "state": "completed"
        }
      ]
    },
    "targetCount": 1,
    "attemptedCount": 1,
    "previewedCount": 0,
    "submittedCount": 1,
    "failedCount": 0,
    "batch": {
      "limit": 2,
      "availableCount": 1,
      "selectedCount": 1,
      "remainingCount": 0,
      "hasMore": false,
      "verificationRequests": 1
    },
    "items": [
      {
        "index": "1",
        "teacherId": "2431",
        "teacherName": "张华",
        "college": "文史与法学学院",
        "category": "理论课",
        "totalScore": "0",
        "evaluated": "否",
        "submitted": "否",
        "pending": true,
        "actionable": true,
        "blocked": false,
        "state": "pending",
        "questionCount": 17,
        "fullScore": 100,
        "status": "submitted"
      }
    ]
  },
  "_meta": {
    "cached": false,
    "source": "jw"
  }
}
```

只有同时传入：

```json
{
  "dryRun": false,
  "confirm": true
}
```

才会真实提交。缺少任意一个字段都会按预检处理。

### 批次结果与未确认状态

一次调用只选择最初列表中的 `batch.limit` 项，不会因恢复会话或批末回查重选下一批。初始列表、表单和最终列表读取沿用有界上游重试；每项 POST 最多一次。POST 超时也可能已生效，服务端只通过最终列表的稳定业务身份及已提交增量确认，不重放提交；一个增量不能重复确认两项。

- `targetCount` / `batch.selectedCount` 是本批选中数，`attemptedCount` 是实际尝试 POST 数。
- `previewedCount`、`submittedCount`、`failedCount` 分别是预检完成、确认提交、POST 前准备失败条目数。`items` 保留初始任务字段，以条目 `status` 判断本批结果；最新全量任务状态在 `status.items`。
- `batch.verificationRequests` 表示逻辑批末回查次数（0 或 1），内部有限读取重试不增加此值。
- 批末回查耗尽时，已尝试提交的条目返回 `status: "unknown"`、`message: "SUBMIT_RESULT_UNKNOWN"`，另增加 `unconfirmedCount` 和 `batch.verificationSucceeded: false`。此时 `status`、`remainingCount`、`hasMore` 来自初始快照，不代表提交后的真实剩余量。
- 批末回查成功但未观察到目标身份的完成增量时，已尝试 POST 的条目同样为 `unknown`，计入 `unconfirmedCount`；message 保留提交错误或为 `SUBMIT_NOT_CONFIRMED`。此时 `verificationSucceeded` 不返回 false，`status` 是批末读取的快照，但该快照不能证明学校没有执行或稍后不会完成提交。
- 无未确认条目时省略 `unconfirmedCount`；只有回查失败时才返回 `verificationSucceeded: false`，成功并不显式返回 true。不能仅凭 `failedCount === 0` 提示全部完成。`unknown` 时必须停止自动续批、重新查询状态；不要自动重放提交请求。请求整体断线、客户端超时/取消、无法取得批次响应时也应先查状态；取消客户端等待不表示学校提交被取消。单次回查仍待处理时也不要自动重放 POST。
- 即使本批全部成功，仍需检查 `batch.hasMore`、`status.blockedCount` 和 `status.pendingCount`。阻塞项不进入可提交批次，但仍可能阻止成绩查询。

兼容说明（2026-09-05）：已尝试 POST、批末回查成功但无增量的条目由 `failed` 改为已有枚举 `unknown`；对应计数从 `failedCount` 移到 `unconfirmedCount`。没有新增字段，客户端必须同时消费三类结果；`verificationSucceeded !== false` 不能替代未确认计数检查。

## 5. 错误响应

```json
{
  "success": false,
  "error_code": 4002,
  "error_message": "listUrl 不能为空"
}
```

常见错误：

| HTTP | error_code | 含义 |
| --- | --- | --- |
| 400 | 4002 | `listUrl` 缺失、URL 非教务评教列表、请求体不是 JSON |
| 401 | 3003 | 教务凭证过期，需要重新登录 |
| 504 | 3004 | 教务系统超时 |

## 6. 前端推荐流程

```ts
const discovery = await discoverEvaluation();
const listUrl = discovery.listUrl;

if (!discovery.evaluationRequired || !listUrl) {
  // 当前无可用评教批次
  return;
}

const status = await getEvaluationStatus(listUrl);

if (status.pendingCount === 0) {
  // 直接继续查成绩
  return;
}

// 弹窗：你有未完成评教，是否默认满分评教？
// 用户取消：不调用提交接口
// 用户确认：
const preview = await submitFullScore({ listUrl, dryRun: true });

if (preview.failedCount > 0) {
  // 展示失败信息，不继续提交
  return;
}

const result = await submitFullScore({
  listUrl,
  dryRun: false,
  confirm: true,
});

if (result.batch.verificationSucceeded === false || (result.unconfirmedCount ?? 0) > 0) {
  // 展示“提交结果待确认”，停止自动续批；只回查状态，不重放本次 POST。
  const latest = await getEvaluationStatus(listUrl);
  // 根据 latest 展示实际完成、剩余及阻塞任务，由用户决定后续操作。
  return;
}
if (result.failedCount > 0) {
  // 展示失败条目，停止自动续批。
  return;
}
if (result.batch.hasMore) {
  // 本批已完成；按用户已确认的范围继续下一批，每批都检查未确认和失败状态。
  return;
}
if (result.status.pendingCount === 0) {
  // 全部评教已完成，可以强刷成绩。
} else {
  // 仍有 blocked 任务，展示上游限制，不宣称全部完成。
}
```


[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
