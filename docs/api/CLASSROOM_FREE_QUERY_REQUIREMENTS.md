# 空教室查询 API 需求备忘

## 已确认偏好

- 业务目标：只做空教室查询，不做教室借用提交。
- 上游查询账号：所有用户统一使用管理员账号 `喻祥云 / 202412040130` 查询教务系统。
- 认证策略：管理员账号 JW session 优先复用，过期后允许自动重建认证。
- 访问控制：小程序用户必须有本系统 Bearer Token 才能使用空教室查询功能。
- 空闲语义：只返回 `完全空闲`，即上游参数 `jszt=8`。
- 当前学期：只查询当前学期。
- 默认时间：默认今天。
- 默认周次来源：后端从 `/jsxsd/framework/xsMain_new.jsp` 解析当前周。
- 时间选择：前端展示“节次/时间段”，允许同一天内跨节次范围查询。
- 过去时间段：前端置灰今天已经过去的时间段。
- 校区选择：前端本地缓存 `campusId=A/B`，首次选择后固定，可手动修改。
- 人数筛选：不需要。
- 容量显示：解析并显示容量。
- 排序：按上游返回顺序，不额外排序。
- 缓存：不缓存查询结果，也不做失败降级。
- 查询失败：直接返回错误。
- 特殊场地：隐藏特殊房间/场馆，优先给同学查普通可自习教室。

## 上游接口

入口页：

```http
GET /jsxsd/kbxx/jsjy_query
```

空教室查询：

```http
POST /jsxsd/kbxx/jsjy_query2
Content-Type: application/x-www-form-urlencoded
Referer: https://xyjw.huas.edu.cn/jsxsd/kbxx/jsjy_query
```

固定参数：

```txt
typewhere=jszq
gnq_mh=
jsmc_mh=
syjs0601id=
jxqbh=
jslx=
jsbh=
bjfh=>=
rnrs=0
jszt=8
kbjcmsid=94CA0081978330A1E05320001AAC856E
```

动态参数：

```txt
xnxqh=当前学期
xqbh=校区ID，A=西院，B=东院
jxlbh=教学楼ID
zc=周次
zc2=周次
xq=星期，1-7
xq2=星期，1-7
jc=起始节次，两位字符串，如 01
jc2=结束节次，两位字符串，如 02
```

获取最大节次：

```http
GET /jsxsd/kbxx/initJc?xnxq=<term>&kbjcmsid=94CA0081978330A1E05320001AAC856E
```

返回：

```json
{ "mtdjs": 10, "success": true }
```

获取教学楼：

```http
GET /jsxsd/kbxx/jsjy_processAjax?xqid=A&requestType=jxl
GET /jsxsd/kbxx/jsjy_processAjax?xqid=B&requestType=jxl
```

获取教学楼下教室：

```http
GET /jsxsd/kbxx/jsjy_processAjax?xqid=A&jxlid=A13&requestType=newjs
```

## 结果解析

查询结果页解析：

```css
#dataList tr[jsbh]
```

示例：

```html
<tr jsbh="A13A105">
  <td>
    <input type="checkbox" value="A13A105" name="jsids">
    第三教学楼A105(130/30)
  </td>
</tr>
```

返回给前端：

```json
{
  "id": "A13A105",
  "name": "第三教学楼A105",
  "capacity": 130,
  "examCapacity": 30
}
```

解析容量时匹配末尾容量括号，避免误伤 `P-D804(1)(40/0)` 这类教室名：

```ts
const match = raw.match(/^(.+?)\((\d+)\/(\d+)\)$/);
```

## 特殊场地过滤

### 推荐策略

后端返回教学楼列表时隐藏特殊场地。建议先用 denylist 过滤，而不是让前端处理。

过滤关键字：

```txt
艺术
体育
图书馆
办公
食堂
化学
化工
物理
音乐
琴
舞蹈
美术
画
球
场
馆
附楼
田径
武术
练功
游泳
跆拳道
健身
乒乓
羽毛
保卫
宿舍
浴
```

建议实现：

```ts
const SPECIAL_BUILDING_RE =
  /(艺术|体育|图书馆|办公|食堂|化学|化工|物理|音乐|琴|舞蹈|美术|画|球|场|馆|附楼|田径|武术|练功|游泳|跆拳道|健身|乒乓|羽毛|保卫|宿舍|浴)/;
```

查询结果中的教室也做同样过滤，避免普通教学楼里混入特殊教室。

### 建议保留教学楼

西院/全量接口中建议保留：

```txt
A01 第一教学楼
A02 第二教学楼B座
A03 第二教学楼A座
A07 第二教学楼东楼
A13 第三教学楼A座
A14 第三教学楼B座
A15 第三教学楼C座
A20 第三教学楼D座
A24 第二教学楼西楼
90F9139476334CF9A1730EC8E61DE077 东校区第一教学楼
9FD94516BD7E41528D5A3D4960AED887 精粹楼-管理学院
7261115200F84F11A9268849701AF399 精进楼-教育学院
32BCDC2D8E8B4F66B066773521769169 精慧楼-信息学院
30C35E00BC92478E9FD6E3AC64ABBC0D 精粹楼-药学院
48FA820911554F41A5061D2B59CED387 精工楼-智能制造学院
```

东院建议保留：

```txt
B01 东一教学楼
```

### 建议隐藏示例

```txt
艺术楼A座
综合实验楼
船型教学楼
体育楼A座
红楼
艺术楼(美术楼)
化学化工楼
西院物理实验楼
第三实验楼A座
第三实验楼B座
第二实验楼A座
第二实验楼B座
第一实验楼
艺术楼D座
艺术楼B座
艺术楼（C楼）
体育楼B座
第四实验楼A座
第四实验楼B座
逸夫楼东附楼
逸夫楼西附楼
第二办公楼
四食堂
田径场
东院图书馆
东院第一实验楼
东院第二实验楼
```

## API 建议

获取教学楼：

```http
GET /api/classrooms/buildings?campusId=A
```

查询今天空教室：

```http
GET /api/classrooms/free?campusId=A&buildingId=A13&startSection=1&endSection=2
```

查询指定周/星期：

```http
GET /api/classrooms/free?campusId=A&buildingId=A13&week=16&weekday=3&startSection=1&endSection=2
```

返回：

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
    "queriedAt": "2026-06-17T10:31:05+08:00",
    "sourceNote": "教务系统显示完全空闲"
  },
  "_meta": {
    "cached": false,
    "source": "jw",
    "upstreamAccount": "admin"
  }
}
```

## 日志要求

所有上游空教室查询日志必须明确这是管理员账号：

```txt
ClassroomFreeQuery admin sid=202412040130 actor=<当前用户学号> campus=A building=A13 week=16 weekday=3 sections=1-2
```

含义：

- `admin sid=202412040130`：实际访问教务系统的账号。
- `actor=<当前用户学号>`：发起查询的小程序用户。

## 下个会话开发重点

1. 实现固定管理员账号上游查询，不使用当前用户 JW session。
2. 保留当前用户 Bearer Token 鉴权。
3. 实现当前学期与当前周解析。
4. 实现教学楼列表过滤。
5. 实现空教室查询与 HTML 解析。
6. 不缓存查询结果。
7. 不实现任何借用提交。
