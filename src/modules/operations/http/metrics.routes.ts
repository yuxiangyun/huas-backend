/**
 * [INPUT]: 依赖 Hono 与 runtimeMetrics 的 Prometheus 文本序列化
 * [OUTPUT]: 默认导出 `/metrics` 轻量进程指标 Hono 路由
 * [POS]: operations/http 的只读观测适配器，不查询业务表或校园上游
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { runtimeMetrics } from '../../../runtime/runtime-metrics';

const metrics = new Hono();

metrics.get('/', (c) => c.text(
  runtimeMetrics.renderPrometheus(),
  200,
  { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
));

export default metrics;
