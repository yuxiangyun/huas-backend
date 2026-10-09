/**
 * [INPUT]: 依赖早起展示设置查询/变更、后台会话与 HeroUI 表单和开关
 * [OUTPUT]: 提供榜单资料入口的显式保存交互，保留未保存选择及服务端成功快照
 * [POS]: pages/admin 的早起页内设置；开关仅控制资料入口，不改变打卡或资料写权限
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { Label } from '@heroui/react/label';
import { Switch } from '@heroui/react/switch';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useToastStore } from '@/app/state/toast-store';
import { useAdminEarlyRisingSettingsQuery, useUpdateAdminEarlyRisingSettingsMutation } from '@/entities/admin/api/admin-queries';
import type { AdminEarlyRisingSettings as EarlySettings } from '@/entities/admin/model/admin-types';
import type { AdminSession } from '@/features/admin-treehole/model/admin-session';
import { isNewerSnapshot, operationError } from '@/pages/admin/operations-fields';
import { AdminState } from '@/shared/ui/admin';

function EarlyRisingForm({ session, settings }: { session: AdminSession; settings: EarlySettings }) {
  const mutation = useUpdateAdminEarlyRisingSettingsMutation(session);
  const pushToast = useToastStore((state) => state.pushToast);
  const [snapshot, setSnapshot] = useState(settings);
  const [profileEntryVisible, setProfileEntryVisible] = useState(settings.profileEntryVisible);
  const [error, setError] = useState<string | null>(null);
  const writeLock = useRef(false);
  const dirty = profileEntryVisible !== snapshot.profileEntryVisible;

  useEffect(() => {
    if (!dirty && !mutation.isPending && isNewerSnapshot(settings.updatedAt, snapshot.updatedAt)) {
      setSnapshot(settings);
      setProfileEntryVisible(settings.profileEntryVisible);
    }
  }, [settings, dirty, mutation.isPending, snapshot.updatedAt]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (writeLock.current || !dirty) return;
    writeLock.current = true;
    setError(null);
    try {
      const updated = await mutation.mutateAsync({ profileEntryVisible });
      setSnapshot(updated);
      setProfileEntryVisible(updated.profileEntryVisible);
      pushToast({ title: '已保存', variant: 'success' });
    } catch (failure) {
      setError(operationError(failure));
    } finally {
      writeLock.current = false;
    }
  }

  return (
    <Form className="flex flex-wrap items-center justify-between gap-4" onSubmit={(event) => { void save(event); }} aria-busy={mutation.isPending}>
      <Switch isSelected={profileEntryVisible} isDisabled={mutation.isPending} onChange={setProfileEntryVisible}>
        <Switch.Content>
          <Switch.Control><Switch.Thumb /></Switch.Control>
          <Label>榜单资料入口</Label>
        </Switch.Content>
      </Switch>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <Button size="sm" type="submit" isDisabled={!dirty || mutation.isPending}>保存</Button>
    </Form>
  );
}

export function EarlyRisingSettings({ session, settingsQuery }: {
  session: AdminSession;
  settingsQuery: ReturnType<typeof useAdminEarlyRisingSettingsQuery>;
}) {
  return (
    <div className="max-w-lg">
      <AdminState loading={settingsQuery.isLoading} error={settingsQuery.error} onRetry={() => { void settingsQuery.refetch(); }} />
      {settingsQuery.data ? <EarlyRisingForm session={session} settings={settingsQuery.data} /> : null}
    </div>
  );
}
