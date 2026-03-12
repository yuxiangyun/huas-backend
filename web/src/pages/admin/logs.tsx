import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminTerminalLogsQuery } from '@/entities/admin/api/admin-queries';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { ApiError } from '@/shared/api/http-client';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

const fieldClassName =
  'h-11 w-full rounded-[1rem] border border-line bg-white/86 px-3 text-sm text-ink outline-none transition focus:border-transparent focus:ring-2 focus:ring-black/10';

function parsePositiveParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function parseLogLine(line: string) {
  const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  const level = /\bERROR\b|\bERR\b/i.test(line)
    ? 'ERROR'
    : /\bWARN\b/i.test(line)
      ? 'WARN'
      : /\bINFO\b/i.test(line)
        ? 'INFO'
        : 'LOG';

  return {
    time: tsMatch?.[1] || '-',
    level,
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function AdminLogsPage() {
  const { session, onUnauthorized } = useAdminOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const keyword = searchParams.get('keyword') ?? '';
  const limit = parsePositiveParam(searchParams.get('limit'), 50, 1, 200);

  const [keywordInput, setKeywordInput] = useState(keyword);
  const [limitInput, setLimitInput] = useState(String(limit));

  useEffect(() => {
    setKeywordInput(keyword);
  }, [keyword]);

  useEffect(() => {
    setLimitInput(String(limit));
  }, [limit]);

  const logsQuery = useAdminTerminalLogsQuery(
    session,
    {
      keyword: keyword || undefined,
      limit,
    },
    {
      refetchInterval: 10_000,
    }
  );

  useEffect(() => {
    if (!(logsQuery.error instanceof ApiError) || logsQuery.error.httpStatus !== 401) return;
    onUnauthorized('管理员会话已失效，请重新登录');
  }, [logsQuery.error, onUnauthorized]);

  function patchSearchParams(patcher: (params: URLSearchParams) => void) {
    const nextParams = new URLSearchParams(searchParams);
    patcher(nextParams);

    if (!nextParams.get('keyword')) {
      nextParams.delete('keyword');
    }

    const nextLimit = parsePositiveParam(nextParams.get('limit'), 50, 1, 200);
    if (nextLimit === 50) {
      nextParams.delete('limit');
    } else {
      nextParams.set('limit', String(nextLimit));
    }

    setSearchParams(nextParams);
  }

  const rows = logsQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <Card className="space-y-4 bg-card-strong">
        <div>
          <p className="text-base font-semibold text-ink">终端日志</p>
          <p className="text-sm leading-6 text-muted">支持关键字过滤，默认每 10 秒自动刷新。</p>
        </div>

        <div className="grid gap-2 lg:grid-cols-[minmax(0,2fr)_7rem_auto_auto]">
          <input
            className={fieldClassName}
            placeholder="输入关键字（如 Treehole / Discover / ERROR）"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              patchSearchParams((params) => {
                const nextKeyword = keywordInput.trim();
                if (nextKeyword) {
                  params.set('keyword', nextKeyword);
                } else {
                  params.delete('keyword');
                }
              });
            }}
          />

          <input
            className={fieldClassName}
            inputMode="numeric"
            placeholder="条数"
            value={limitInput}
            onChange={(event) => setLimitInput(event.target.value.replaceAll(/[^\d]/g, ''))}
          />

          <Button
            size="md"
            type="button"
            variant="secondary"
            onClick={() => {
              patchSearchParams((params) => {
                const nextKeyword = keywordInput.trim();
                if (nextKeyword) {
                  params.set('keyword', nextKeyword);
                } else {
                  params.delete('keyword');
                }

                params.set('limit', limitInput || '50');
              });
            }}
          >
            应用
          </Button>

          <Button
            size="md"
            type="button"
            variant="ghost"
            onClick={() => {
              setKeywordInput('');
              setLimitInput('50');
              patchSearchParams((params) => {
                params.delete('keyword');
                params.delete('limit');
              });
            }}
          >
            重置
          </Button>
        </div>

        {logsQuery.isError ? (
          <div className="rounded-[1rem] bg-[#fde9e5] px-4 py-3 text-sm leading-6 text-[#8a342c] ring-1 ring-[#efc9c0]">
            {getErrorMessage(logsQuery.error, '日志加载失败')}
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden bg-card-strong p-0">
        <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
          <p className="text-base font-semibold text-ink">日志列表</p>
          <p className="text-sm text-muted">
            {logsQuery.isFetching ? '同步中...' : `共 ${rows.length} 条`}
          </p>
        </div>

        <div className="max-h-[40rem] overflow-auto">
          <table className="min-w-full table-fixed text-left text-sm">
            <thead className="bg-white/72 text-muted">
              <tr>
                <th className="w-[9.5rem] px-4 py-3 font-medium">时间</th>
                <th className="w-[4.5rem] px-4 py-3 font-medium">源</th>
                <th className="w-[5rem] px-4 py-3 font-medium">级别</th>
                <th className="px-4 py-3 font-medium">内容</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, index) => {
                const parsed = parseLogLine(item.line);
                const levelClass = parsed.level === 'ERROR'
                  ? 'text-[#a13c34]'
                  : parsed.level === 'WARN'
                    ? 'text-[#9a6b12]'
                    : parsed.level === 'INFO'
                      ? 'text-[#24634a]'
                      : 'text-muted';

                return (
                  <tr key={`${item.source}-${index}-${item.line}`} className="border-t border-line/70 align-top">
                    <td className="px-4 py-3 font-mono text-muted">{parsed.time}</td>
                    <td className="px-4 py-3 font-mono text-ink">{item.source}</td>
                    <td className={`px-4 py-3 font-mono ${levelClass}`}>{parsed.level}</td>
                    <td className="px-4 py-3 font-mono leading-6 whitespace-pre-wrap break-all text-ink">{item.line}</td>
                  </tr>
                );
              })}
              {!logsQuery.isLoading && rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted" colSpan={4}>暂无匹配日志</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
