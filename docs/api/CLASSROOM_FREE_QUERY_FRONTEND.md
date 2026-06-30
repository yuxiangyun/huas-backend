# 空教室查询前端接入文档

> 适用端：微信小程序  
> Base URL：沿用当前小程序后端 API Base  
> 认证方式：所有接口都需要本系统 Bearer Token  
> 数据源：教务系统 JW，由后端统一使用管理员账号查询  

## 1. 功能边界

空教室查询只做只读查询：

- 不提供教室借用申请。
- 不提交任何上游表单。
- 只返回教务系统标记为“完全空闲”的教室。
- 查询结果不缓存，前端每次查询都应按实时结果处理。
- 返回顺序按教务系统原始顺序展示，不需要前端重新排序。

前端需要做的事情：

- 本地保存用户选择的校区 `campusId`。
- 让用户选择教学楼、星期/节次范围。
- 展示教室名称和容量。
- 请求失败时直接提示，不做降级展示。

## 2. 认证

请求头必须携带登录后拿到的 Bearer Token：

```http
Authorization: Bearer <token>
```

微信小程序示例：

```ts
function authHeader() {
  const token = wx.getStorageSync('token');
  return {
    Authorization: `Bearer ${token}`,
  };
}
```

如果返回 `401` 或 `error_code=4001/3003`，前端应引导用户重新登录。

## 3. 校区约定

| campusId | 校区 |
|---|---|
| `A` | 西院 |
| `B` | 东院 |

建议前端首次进入页面时读取本地缓存：

```ts
const savedCampusId = wx.getStorageSync('classroomCampusId') || 'A';
```

用户切换校区后写回本地缓存，并重新拉取教学楼列表：

```ts
wx.setStorageSync('classroomCampusId', campusId);
```

## 4. 页面推荐流程

1. 进入页面，读取本地缓存的 `campusId`，默认 `A`。
2. 调用 `GET /api/classrooms/buildings` 获取普通教学楼列表。
3. 默认选中第一个教学楼，或恢复上次选择的 `buildingId`。
4. 默认查询今天：前端只传 `campusId/buildingId/startSection/endSection`，不传 `week/weekday`。
5. 如果用户选择了指定周和星期，则同时传 `week` 和 `weekday`。
6. 展示 `rooms`，每项显示 `name`、`capacity`，可选展示 `examCapacity`。

## 5. 接口一：获取教学楼列表

```http
GET /api/classrooms/buildings?campusId=A
```

请求参数：

| 参数 | 必填 | 类型 | 说明 |
|---|---:|---|---|
| `campusId` | 是 | `A` 或 `B` | 校区 |

成功响应：

```json
{
  "success": true,
  "data": {
    "term": "2025-2026-2",
    "campusId": "A",
    "campusName": "西院",
    "sectionModeId": "94CA0081978330A1E05320001AAC856E",
    "buildings": [
      {
        "campusId": "A",
        "campusName": "西院",
        "buildingId": "A13",
        "buildingName": "第三教学楼A座"
      }
    ]
  },
  "_meta": {
    "cached": false,
    "source": "jw",
    "upstreamAccount": "admin"
  }
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| `term` | 当前学期，只读展示即可 |
| `sectionModeId` | 教务系统节次模式 ID，前端通常不需要使用 |
| `buildings` | 后端已过滤特殊楼栋，前端直接展示 |
| `_meta.upstreamAccount` | 固定为 `admin`，表示后端使用管理员账号查上游 |

小程序调用示例：

```ts
async function fetchBuildings(campusId: 'A' | 'B') {
  const res = await wx.request({
    url: `${API_BASE}/api/classrooms/buildings`,
    method: 'GET',
    data: { campusId },
    header: authHeader(),
  });

  const body = res.data as BuildingsResponse;
  if (!body.success) throw body;
  return body.data.buildings;
}
```

## 6. 接口二：查询空教室

默认今天：

```http
GET /api/classrooms/free?campusId=A&buildingId=A13&startSection=1&endSection=2
```

指定周和星期：

```http
GET /api/classrooms/free?campusId=A&buildingId=A13&week=16&weekday=3&startSection=1&endSection=2
```

请求参数：

| 参数 | 必填 | 类型 | 说明 |
|---|---:|---|---|
| `campusId` | 是 | `A` 或 `B` | 校区 |
| `buildingId` | 是 | string | 教学楼 ID，来自教学楼列表 |
| `week` | 否 | 1-30 整数 | 指定周次；传了 `week` 就必须传 `weekday` |
| `weekday` | 否 | 1-7 整数 | 星期，`1` 是周一，`7` 是周日 |
| `startSection` | 是 | 1-30 整数 | 起始节次 |
| `endSection` | 是 | 1-30 整数 | 结束节次，必须大于等于 `startSection` |

默认今天时不要传 `week/weekday`。后端会从教务系统解析当前周，并按服务器 `Asia/Shanghai` 日期计算星期。

成功响应：

```json
{
  "success": true,
  "data": {
    "term": "2025-2026-2",
    "campusId": "A",
    "campusName": "西院",
    "buildingId": "A13",
    "buildingName": "第三教学楼A座",
    "week": 16,
    "weekday": 3,
    "startSection": 1,
    "endSection": 2,
    "rooms": [
      {
        "id": "A13A105",
        "name": "第三教学楼A105",
        "capacity": 130,
        "examCapacity": 30
      }
    ],
    "queriedAt": "2026-06-17T10:31:05.000+08:00",
    "sourceNote": "教务系统显示完全空闲"
  },
  "_meta": {
    "cached": false,
    "source": "jw",
    "upstreamAccount": "admin"
  }
}
```

展示建议：

| 字段 | 展示方式 |
|---|---|
| `buildingName` | 页面标题或筛选条件摘要 |
| `week/weekday` | 查询条件摘要，如“第16周 周三” |
| `rooms[].name` | 主标题 |
| `rooms[].capacity` | 显示为“容量 130” |
| `rooms[].examCapacity` | 可选显示为“考试容量 30” |
| `queriedAt` | 可选显示为“查询时间” |
| `sourceNote` | 可选显示在结果说明处 |

小程序调用示例：

```ts
type FreeQueryParams = {
  campusId: 'A' | 'B';
  buildingId: string;
  week?: number;
  weekday?: number;
  startSection: number;
  endSection: number;
};

async function fetchFreeRooms(params: FreeQueryParams) {
  const res = await wx.request({
    url: `${API_BASE}/api/classrooms/free`,
    method: 'GET',
    data: params,
    header: authHeader(),
  });

  const body = res.data as FreeRoomsResponse;
  if (!body.success) throw body;
  return body.data;
}
```

默认今天：

```ts
await fetchFreeRooms({
  campusId,
  buildingId,
  startSection: 1,
  endSection: 2,
});
```

指定周和星期：

```ts
await fetchFreeRooms({
  campusId,
  buildingId,
  week: 16,
  weekday: 3,
  startSection: 1,
  endSection: 2,
});
```

## 7. TypeScript 类型参考

```ts
type ApiMeta = {
  cached: boolean;
  source?: 'jw' | string;
  upstreamAccount?: 'admin' | string;
};

type ApiSuccess<T> = {
  success: true;
  data: T;
  _meta?: ApiMeta;
};

type ApiFailure = {
  success: false;
  error_code: number;
  error_message: string;
  data?: unknown;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type CampusId = 'A' | 'B';

type ClassroomBuilding = {
  campusId: CampusId;
  campusName: string;
  buildingId: string;
  buildingName: string;
};

type BuildingsData = {
  term: string;
  campusId: CampusId;
  campusName: string;
  sectionModeId: string;
  buildings: ClassroomBuilding[];
};

type FreeClassroom = {
  id: string;
  name: string;
  capacity: number;
  examCapacity: number;
};

type FreeRoomsData = {
  term: string;
  campusId: CampusId;
  campusName: string;
  buildingId: string;
  buildingName: string;
  week: number;
  weekday: number;
  startSection: number;
  endSection: number;
  rooms: FreeClassroom[];
  queriedAt: string;
  sourceNote: string;
};

type BuildingsResponse = ApiResponse<BuildingsData>;
type FreeRoomsResponse = ApiResponse<FreeRoomsData>;
```

## 8. 错误处理

常见失败响应：

```json
{
  "success": false,
  "error_code": 4002,
  "error_message": "week 和 weekday 必须同时传入"
}
```

| error_code | 场景 | 前端处理 |
|---:|---|---|
| `4001` | Bearer Token 无效或过期 | 重新登录 |
| `3003` | 后端管理员或用户凭证恢复失败 | 提示稍后重试；如果当前用户登录态失效，引导重新登录 |
| `3004` | 教务系统超时 | Toast：教务系统超时，请稍后再试 |
| `4002` | 参数错误 | 检查选择器状态，提示用户重新选择 |
| `4003` | 请求过于频繁 | Toast：操作太频繁，请稍后再试 |
| `5000` | 后端或上游解析异常 | Toast：查询失败，请稍后再试 |

推荐错误处理函数：

```ts
function handleClassroomError(error: ApiFailure) {
  if (error.error_code === 4001 || error.error_code === 3003) {
    wx.showToast({ title: '请重新登录', icon: 'none' });
    // 跳转登录页
    return;
  }

  wx.showToast({
    title: error.error_message || '查询失败，请稍后再试',
    icon: 'none',
  });
}
```

## 9. 空态与加载态

建议区分三种状态：

| 状态 | 条件 | 文案建议 |
|---|---|---|
| 初始态 | 尚未点击查询 | 请选择教学楼和节次 |
| 空结果 | `rooms.length === 0` | 当前条件下暂无完全空闲教室 |
| 请求失败 | `success=false` 或网络异常 | 使用后端错误消息或“查询失败，请稍后再试” |

查询时禁用按钮，避免重复请求：

```ts
if (loading) return;
setLoading(true);
try {
  const data = await fetchFreeRooms(params);
  setRooms(data.rooms);
} catch (error) {
  handleClassroomError(error as ApiFailure);
} finally {
  setLoading(false);
}
```

## 10. 节次选择建议

后端允许同一天内跨节次查询，例如 `startSection=1&endSection=4`。

前端可以用两个选择器：

- 起始节次：1-10 或按前端课程表配置展示。
- 结束节次：从起始节次开始，只允许选择大于等于起始节次的值。

如果是“今天”，前端可自行置灰已经过去的节次；后端不会根据当前时间过滤过去节次。

## 11. 调试样例

已验证样例：

```txt
campusId=A
buildingId=A13
week=16
weekday=3
startSection=1
endSection=2
```

含义：

```txt
2025-2026-2
第16周
星期三
第1-2节
西院
第三教学楼A座
完全空闲
```

后端真实验证返回 15 间空教室。

