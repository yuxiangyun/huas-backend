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

用于用户点击确认前，先验证当前账号是否能正常解析所有评教表单。不会提交评教。

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

成功响应：

```json
{
  "success": true,
  "data": {
    "dryRun": true,
    "total": 12,
    "pendingCount": 12,
    "successCount": 12,
    "failedCount": 0,
    "items": [
      {
        "teacherName": "张华",
        "teacherId": "2431",
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

成功响应：

```json
{
  "success": true,
  "data": {
    "dryRun": false,
    "total": 12,
    "pendingCount": 12,
    "successCount": 12,
    "failedCount": 0,
    "items": [
      {
        "teacherName": "张华",
        "teacherId": "2431",
        "questionCount": 17,
        "fullScore": 100,
        "status": "submitted",
        "message": "status=200"
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

if (status.pendingCount <= 0) {
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

if (result.failedCount === 0) {
  // 提示完成，然后重新拉取成绩
}
```
