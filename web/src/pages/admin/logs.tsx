/**
 * [INPUT]: 依赖有界终端日志查询、后台会话、URL 筛选与 HeroUI 表单及表格
 * [OUTPUT]: 提供日志搜索、行数选择、手动刷新和可暂停的十秒轮询，查询失败保持筛选并显示错误
 * [POS]: pages/admin 的终端日志页面，仅呈现服务端返回的 out/error 尾部记录
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { Table } from '@heroui/react/table';
import { type FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminTerminalLogsQuery } from '@/entities/admin/api/admin-queries';
import { SearchInput } from '@/shared/ui/search-input';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { OperationsSelect } from '@/pages/admin/operations-fields';
import { ApiError } from '@/shared/api/http-client';
import { AdminPage, AdminPanel, AdminState } from '@/shared/ui/admin';

function parseLimit(value: string | null) {
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 && limit <= 200 ? limit : 50;
}

export function AdminLogsPage() {
  const { session, onUnauthorized } = useAdminOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const keyword = searchParams.get('keyword') ?? '';
  const limit = parseLimit(searchParams.get('limit'));
  const [keywordInput, setKeywordInput] = useState(keyword);
  const [limitInput, setLimitInput] = useState(String(limit));
  const [paused, setPaused] = useState(false);
  const query = useAdminTerminalLogsQuery(session, { keyword: keyword || undefined, limit }, { refetchInterval: paused ? false : 10_000 });
  const limitOptions = [...new Set([50, 100, 200, limit])].sort((left, right) => left - right).map((value) => ({ value: String(value), label: `${value} 行` }));

  useEffect(() => { setKeywordInput(keyword); }, [keyword]);
  useEffect(() => { setLimitInput(String(limit)); }, [limit]);
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.httpStatus === 401) onUnauthorized('管理员会话已失效，请重新登录');
  }, [query.error, onUnauthorized]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams);
    const nextKeyword = keywordInput.trim();
    if (nextKeyword) params.set('keyword', nextKeyword);
    else params.delete('keyword');
    if (parseLimit(limitInput) !== 50) params.set('limit', String(parseLimit(limitInput)));
    else params.delete('limit');
    setSearchParams(params);
  }

  return (
    <AdminPage title="日志" actions={
      <div className="flex gap-1">
        <Button aria-label={paused ? '恢复自动刷新' : '暂停自动刷新'} variant="ghost" onPress={() => setPaused((value) => !value)}>
          {paused ? '自动刷新' : '暂停刷新'}
        </Button>
        <Button aria-label="刷新日志" variant="ghost" isDisabled={query.isFetching} onPress={() => { void query.refetch(); }}>刷新</Button>
      </div>
    }>
      <AdminPanel>
        <Form className="flex flex-wrap items-center gap-2" onSubmit={search}>
          <SearchInput label="搜索日志" className="w-full sm:w-80" value={keywordInput} onChange={setKeywordInput} />
          <OperationsSelect hideLabel label="行数" className="w-28" value={limitInput} options={limitOptions} onChange={setLimitInput} />
          <Button aria-label="查询日志" variant="secondary" type="submit">搜索</Button>
        </Form>
        <AdminState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch(); }} />
        {query.data ? (
          <Table variant="secondary" className="mt-4">
            <Table.ScrollContainer className="max-h-[70dvh]">
              <Table.Content aria-label="终端日志" className="table-fixed text-xs">
                <Table.Header>
                  <Table.Column id="source" className="w-20">来源</Table.Column>
                  <Table.Column id="line" isRowHeader>内容</Table.Column>
                </Table.Header>
                <Table.Body items={query.data.items.map((item, index) => ({ ...item, id: `${item.source}-${index}` }))} renderEmptyState={() => '暂无匹配日志'}>
                  {(item) => (
                    <Table.Row id={item.id}>
                      <Table.Cell className="align-top font-mono text-muted">{item.source}</Table.Cell>
                      <Table.Cell className={`whitespace-pre-wrap break-all font-mono leading-6 ${item.source === 'error' ? 'text-danger' : ''}`}>{item.line}</Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        ) : null}
      </AdminPanel>
    </AdminPage>
  );
}
