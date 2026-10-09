import { DatePickerField } from '@/shared/ui/date-picker-field';
/**
 * [INPUT]: 依赖首页弹窗查询/变更、后台会话、公共媒体地址与 HeroUI 表单控件
 * [OUTPUT]: 编辑唯一首页海报的图片、开关、底部动作、频率与北京时间窗口，保留未保存草稿
 * [POS]: pages/admin/operations 的独立首页弹窗页面，以明确保存及服务端返回快照更新草稿基线
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { Switch } from '@heroui/react/switch';
import { TextField } from '@heroui/react/textfield';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useToastStore } from '@/app/state/toast-store';
import {
  useAdminIndexPopupSettingsQuery,
  useUpdateAdminIndexPopupSettingsMutation,
} from '@/entities/admin/api/admin-queries';
import type {
  AdminIndexPopupActionType,
  AdminIndexPopupFrequency,
  AdminIndexPopupSettings as PopupSettings,
} from '@/entities/admin/model/admin-types';
import type { AdminSession } from '@/features/admin-treehole/model/admin-session';
import { beijingDateTime, beijingDateTimeToIso, isNewerSnapshot, operationError, OperationsSelect } from '@/pages/admin/operations-fields';
import { buildMediaUrl } from '@/shared/api/media';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { AdminPage, AdminState } from '@/shared/ui/admin';

const FREQUENCY_OPTIONS = [
  { value: 'once', label: '每份内容一次' },
  { value: 'daily', label: '每天一次' },
  { value: 'startup', label: '每次启动' },
] as const;
const ACTION_OPTIONS = [
  { value: 'public_account', label: '公众号入口' },
  { value: 'text', label: '文字' },
  { value: 'none', label: '无' },
] as const;

type PopupDraft = {
  enabled: boolean;
  actionType: AdminIndexPopupActionType;
  actionText: string;
  frequency: AdminIndexPopupFrequency;
  startsAt: string;
  endsAt: string;
};

function toDraft(settings: PopupSettings): PopupDraft {
  return {
    enabled: settings.enabled,
    actionType: settings.actionType,
    actionText: settings.actionText,
    frequency: settings.frequency,
    startsAt: settings.startsAt ? beijingDateTime(settings.startsAt) : '',
    endsAt: settings.endsAt ? beijingDateTime(settings.endsAt) : '',
  };
}

function PopupForm({ session, settings }: { session: AdminSession; settings: PopupSettings }) {
  const mutation = useUpdateAdminIndexPopupSettingsMutation(session);
  const pushToast = useToastStore((state) => state.pushToast);
  const [snapshot, setSnapshot] = useState(settings);
  const [draft, setDraft] = useState(() => toDraft(settings));
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const writeLock = useRef(false);
  const baseline = toDraft(snapshot);
  const dirty = image !== null || Object.keys(draft).some((key) => draft[key as keyof PopupDraft] !== baseline[key as keyof PopupDraft]);
  const preview = image?.url ?? (snapshot.imageUrl ? buildMediaUrl(snapshot.imageUrl) : null);

  useEffect(() => {
    if (!dirty && !mutation.isPending && isNewerSnapshot(settings.updatedAt, snapshot.updatedAt)) {
      setSnapshot(settings);
      setDraft(toDraft(settings));
    }
  }, [settings, dirty, mutation.isPending, snapshot.updatedAt]);

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

  function selectImage(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('图片不能超过 10 MiB');
      return;
    }
    if (file.type && !file.type.startsWith('image/')) {
      setError('请选择图片');
      return;
    }
    setImage({ file, url: URL.createObjectURL(file) });
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (writeLock.current || !dirty) return;
    setError(null);
    if (draft.enabled && !snapshot.imageUrl && !image) {
      setError('请选择海报图片');
      return;
    }
    const actionText = draft.actionText.trim();
    if (draft.actionType !== 'none' && !actionText) {
      setError('请填写底部文案');
      return;
    }
    if (Array.from(actionText).length > 20 || /[\u0000-\u001f\u007f]/.test(actionText)) {
      setError('底部文案限 20 个字符，不能包含控制字符');
      return;
    }
    try {
      const startsAt = draft.startsAt === baseline.startsAt ? snapshot.startsAt : beijingDateTimeToIso(draft.startsAt);
      const endsAt = draft.endsAt === baseline.endsAt ? snapshot.endsAt : beijingDateTimeToIso(draft.endsAt);
      if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
        setError('结束时间须晚于开始时间');
        return;
      }
      writeLock.current = true;
      const updated = await mutation.mutateAsync({
        ...draft,
        actionText,
        startsAt,
        endsAt,
        image: image?.file,
      });
      setSnapshot(updated);
      setDraft(toDraft(updated));
      setImage(null);
      pushToast({ title: '已保存', variant: 'success' });
    } catch (failure) {
      setError(operationError(failure));
    } finally {
      writeLock.current = false;
    }
  }

  return (
    <Form className="max-w-3xl space-y-7" onSubmit={(event) => { void save(event); }} aria-busy={mutation.isPending}>
      <div className="flex items-center justify-between gap-6">
      <Switch isSelected={draft.enabled} isDisabled={mutation.isPending} onChange={(enabled) => setDraft({ ...draft, enabled })}>
        <Switch.Content>
          <Switch.Control><Switch.Thumb /></Switch.Control>
          <Label>启用</Label>
        </Switch.Content>
      </Switch>
      <Button type="submit" isDisabled={!dirty || mutation.isPending}>保存</Button>
      </div>
      <div className="grid items-start gap-6 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="flex min-h-44 items-center justify-center overflow-hidden rounded-lg bg-surface-secondary">
            {preview ? <img alt="海报预览" className="max-h-80 max-w-full object-contain" src={preview} /> : <span className="text-sm text-muted">未选择图片</span>}
          </div>
          <Input
            ref={imageInput}
            aria-label="海报图片"
            accept="image/*"
            className="hidden"
            type="file"
            disabled={mutation.isPending}
            onChange={(event) => { selectImage(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}
          />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" isDisabled={mutation.isPending} onPress={() => imageInput.current?.click()}>{preview ? '更换图片' : '选择图片'}</Button>
            {image ? <Button aria-label="撤销图片更换" variant="ghost" size="sm" isDisabled={mutation.isPending} onPress={() => setImage(null)}>撤销</Button> : null}
          </div>
        </div>
        <div className="space-y-5">
          <OperationsSelect label="底部内容" value={draft.actionType} options={ACTION_OPTIONS} isDisabled={mutation.isPending} onChange={(actionType) => setDraft({ ...draft, actionType })} />
          {draft.actionType !== 'none' ? (
            <TextField isRequired isDisabled={mutation.isPending} value={draft.actionText} onChange={(actionText) => setDraft({ ...draft, actionText })}>
              <Label>底部文案</Label><Input />
            </TextField>
          ) : null}
          <OperationsSelect label="展示频率" value={draft.frequency} options={FREQUENCY_OPTIONS} isDisabled={mutation.isPending} onChange={(frequency) => setDraft({ ...draft, frequency })} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <DatePickerField label="开始时间（北京时间）" type="datetime-local" value={draft.startsAt} isDisabled={mutation.isPending} onChange={(startsAt) => setDraft({ ...draft, startsAt })} />
        <DatePickerField label="结束时间（北京时间）" type="datetime-local" value={draft.endsAt} isDisabled={mutation.isPending} onChange={(endsAt) => setDraft({ ...draft, endsAt })} />
      </div>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
    </Form>
  );
}

export function IndexPopupSettings({ session, settingsQuery }: {
  session: AdminSession;
  settingsQuery: ReturnType<typeof useAdminIndexPopupSettingsQuery>;
}) {
  return (
    <div>
      <AdminState loading={settingsQuery.isLoading} error={settingsQuery.error} onRetry={() => { void settingsQuery.refetch(); }} />
      {settingsQuery.data ? <PopupForm session={session} settings={settingsQuery.data} /> : null}
    </div>
  );
}

export function AdminIndexPopupPage() {
  const { session } = useAdminOutletContext();
  const query = useAdminIndexPopupSettingsQuery(session);
  return <AdminPage title="首页弹窗"><IndexPopupSettings session={session} settingsQuery={query} /></AdminPage>;
}
