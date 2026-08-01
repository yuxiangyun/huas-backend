/**
 * [INPUT]: 依赖首页弹窗查询/上传 mutation、后台会话、公开媒体地址规范化与基础按钮
 * [OUTPUT]: 提供 IndexPopupSettings，维护唯一首页海报的开关、图片、底部展示三态、文案、频率与可选生效时间
 * [POS]: pages/admin/settings 的单职展示配置区块，以本地表单草稿提交 multipart 并用服务端快照回写缓存
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useEffect, useState } from 'react';
import { useToastStore } from '@/app/state/toast-store';
import {
  useAdminIndexPopupSettingsQuery,
  useUpdateAdminIndexPopupSettingsMutation,
} from '@/entities/admin/api/admin-queries';
import type {
  AdminIndexPopupActionType,
  AdminIndexPopupFrequency,
  AdminIndexPopupSettings as AdminIndexPopupSettingsModel,
} from '@/entities/admin/model/admin-types';
import type { AdminSession } from '@/features/admin-treehole/model/admin-session';
import { buildMediaUrl } from '@/shared/api/media';
import { Button } from '@/shared/ui/button';

const FREQUENCY_OPTIONS: Array<{
  value: AdminIndexPopupFrequency;
  label: string;
  description: string;
}> = [
  { value: 'once', label: '仅一次', description: '当前海报在本机只展示一次' },
  { value: 'daily', label: '每天一次', description: '当前海报在本机每天最多展示一次' },
  { value: 'startup', label: '每次启动', description: '小程序每次冷启动最多展示一次' },
];

const ACTION_TYPE_OPTIONS: Array<{
  value: AdminIndexPopupActionType;
  label: string;
  description: string;
}> = [
  { value: 'public_account', label: '跳转公众号', description: '底部文案作为进入公众号的操作提示' },
  { value: 'text', label: '仅展示文字', description: '显示底部文案，不提供跳转动作' },
  { value: 'none', label: '仅展示海报', description: '不显示底部文案和跳转动作' },
];

function toLocalDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function settingsIdentity(settings: AdminIndexPopupSettingsModel) {
  return [
    settings.updatedAt,
    settings.version,
    settings.enabled,
    settings.imageUrl,
    settings.actionType,
    settings.actionText,
    settings.frequency,
    settings.startsAt,
    settings.endsAt,
  ].join('|');
}

function IndexPopupSettingsForm({
  session,
  settings,
}: {
  session: AdminSession;
  settings: AdminIndexPopupSettingsModel;
}) {
  const pushToast = useToastStore((state) => state.pushToast);
  const mutation = useUpdateAdminIndexPopupSettingsMutation(session);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [actionType, setActionType] = useState(settings.actionType);
  const [actionText, setActionText] = useState(settings.actionText);
  const [frequency, setFrequency] = useState(settings.frequency);
  const [startsAt, setStartsAt] = useState(() => toLocalDateTime(settings.startsAt));
  const [endsAt, setEndsAt] = useState(() => toLocalDateTime(settings.endsAt));
  const [selectedImage, setSelectedImage] = useState<{ file: File; url: string } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => () => {
    if (selectedImage) URL.revokeObjectURL(selectedImage.url);
  }, [selectedImage]);

  const previewUrl = selectedImage?.url ?? (settings.imageUrl ? buildMediaUrl(settings.imageUrl) : '');

  function selectImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setSelectedImage({ file, url: URL.createObjectURL(file) });
    setValidationError(null);
    mutation.reset();
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.reset();
    setValidationError(null);

    if (enabled && !settings.imageUrl && !selectedImage) {
      setValidationError('启用首页弹窗前请先选择海报图片');
      return;
    }
    if (actionType !== 'none' && !actionText.trim()) {
      setValidationError('请填写海报下方文字');
      return;
    }

    const normalizedStartsAt = toIsoDateTime(startsAt);
    const normalizedEndsAt = toIsoDateTime(endsAt);
    if (normalizedStartsAt && normalizedEndsAt && normalizedEndsAt <= normalizedStartsAt) {
      setValidationError('结束时间必须晚于开始时间');
      return;
    }

    try {
      await mutation.mutateAsync({
        enabled,
        actionType,
        actionText: actionText.trim(),
        frequency,
        startsAt: normalizedStartsAt,
        endsAt: normalizedEndsAt,
        image: selectedImage?.file,
      });
      pushToast({
        title: '首页弹窗设置已保存',
        message: '新设置已发布',
        variant: 'success',
      });
    } catch {
      // mutation.error 在当前区块内呈现具体错误。
    }
  }

  return (
    <form className="mt-5 space-y-5" onSubmit={(event) => void saveSettings(event)}>
      <label className="flex items-center justify-between gap-4 rounded-xl border border-black/[0.06] px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-ink">启用首页弹窗</span>
          <span className="mt-1 block text-xs leading-5 text-muted">关闭后小程序不展示海报。</span>
        </span>
        <input
          checked={enabled}
          className="size-4 accent-black"
          disabled={mutation.isPending}
          type="checkbox"
          onChange={(event) => setEnabled(event.currentTarget.checked)}
        />
      </label>

      <div>
        <p className="text-sm font-medium text-ink">海报图片</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-start">
          <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-black/15 bg-black/[0.025] p-2">
            {previewUrl ? (
              <img alt="首页弹窗海报预览" className="max-h-80 max-w-full object-contain" src={previewUrl} />
            ) : (
              <p className="px-4 text-center text-sm text-muted">尚未上传海报</p>
            )}
          </div>
          <div>
            <label className="inline-flex h-[var(--control-height-sm)] cursor-pointer items-center justify-center rounded-[0.625rem] border border-line bg-white px-4 text-sm font-medium text-ink shadow-card transition-colors hover:bg-tint-soft focus-within:ring-2 focus-within:ring-black/45 focus-within:ring-offset-2">
              {settings.imageUrl ? '更换图片' : '选择图片'}
              <input
                accept="image/*"
                className="sr-only"
                disabled={mutation.isPending}
                type="file"
                onChange={selectImage}
              />
            </label>
            <p className="mt-2 text-xs leading-5 text-muted">保持图片原始比例，保存后立即发布。</p>
            {selectedImage ? (
              <p className="mt-2 break-all text-xs text-ink">已选择：{selectedImage.file.name}</p>
            ) : null}
          </div>
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink">底部展示方式</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {ACTION_TYPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-xl border px-3 py-3 transition-colors ${actionType === option.value ? 'border-black/40 bg-black/[0.045]' : 'border-black/[0.06] hover:bg-black/[0.025]'}`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <input
                  checked={actionType === option.value}
                  className="accent-black"
                  disabled={mutation.isPending}
                  name="index-popup-action-type"
                  type="radio"
                  value={option.value}
                  onChange={() => {
                    setActionType(option.value);
                    setValidationError(null);
                  }}
                />
                {option.label}
              </span>
              <span className="mt-1 block pl-5 text-xs leading-5 text-muted">{option.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {actionType !== 'none' ? (
        <label className="block">
          <span className="text-sm font-medium text-ink">海报下方文字</span>
          <input
            className="mt-2 block h-10 w-full rounded-[0.625rem] border border-line bg-white px-3 text-sm text-ink outline-none focus:border-black/35 focus:ring-2 focus:ring-black/10"
            disabled={mutation.isPending}
            maxLength={20}
            placeholder="例如：了解更多"
            type="text"
            value={actionText}
            onChange={(event) => {
              setActionText(event.currentTarget.value);
              setValidationError(null);
            }}
          />
          <span className="mt-1 block text-xs leading-5 text-muted">
            {actionType === 'public_account' ? '显示在海报下方，并作为进入公众号的操作提示。' : '显示在海报下方，不提供跳转动作。'}
          </span>
        </label>
      ) : null}

      <fieldset>
        <legend className="text-sm font-medium text-ink">展示频率</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {FREQUENCY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-xl border px-3 py-3 transition-colors ${frequency === option.value ? 'border-black/40 bg-black/[0.045]' : 'border-black/[0.06] hover:bg-black/[0.025]'}`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <input
                  checked={frequency === option.value}
                  className="accent-black"
                  disabled={mutation.isPending}
                  name="index-popup-frequency"
                  type="radio"
                  value={option.value}
                  onChange={() => setFrequency(option.value)}
                />
                {option.label}
              </span>
              <span className="mt-1 block pl-5 text-xs leading-5 text-muted">{option.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="text-sm font-medium text-ink">展示时间</p>
        <p className="mt-1 text-xs leading-5 text-muted">留空表示不限制，时间按浏览器所在时区填写。</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted">
            开始时间
            <input
              className="mt-1 block h-10 w-full rounded-[0.625rem] border border-line bg-white px-3 text-sm font-normal text-ink outline-none focus:border-black/35 focus:ring-2 focus:ring-black/10"
              disabled={mutation.isPending}
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.currentTarget.value)}
            />
          </label>
          <label className="text-xs font-medium text-muted">
            结束时间
            <input
              className="mt-1 block h-10 w-full rounded-[0.625rem] border border-line bg-white px-3 text-sm font-normal text-ink outline-none focus:border-black/35 focus:ring-2 focus:ring-black/10"
              disabled={mutation.isPending}
              min={startsAt || undefined}
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.currentTarget.value)}
            />
          </label>
        </div>
      </div>

      {validationError ? <p className="text-sm text-error" role="alert">{validationError}</p> : null}
      {mutation.isError ? (
        <p className="text-sm text-error" role="alert">
          {getErrorMessage(mutation.error, '保存失败，请重试')}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button disabled={mutation.isPending} size="sm" type="submit">
          {mutation.isPending ? '保存中…' : '保存并发布'}
        </Button>
      </div>
    </form>
  );
}

export function IndexPopupSettings({
  session,
  settingsQuery,
}: {
  session: AdminSession;
  settingsQuery: ReturnType<typeof useAdminIndexPopupSettingsQuery>;
}) {
  const settings = settingsQuery.data;

  return (
    <section className="rounded-[0.75rem] border border-line bg-white p-5" aria-busy={settingsQuery.isFetching}>
      <div>
        <h2 className="text-base font-semibold text-ink">首页弹窗</h2>
        <p className="mt-1 text-sm leading-6 text-muted">配置小程序首页海报及其底部展示方式。</p>
      </div>

      {settingsQuery.isLoading && !settings ? (
        <div className="mt-5 space-y-3" aria-label="正在加载首页弹窗设置">
          <div className="h-16 animate-pulse rounded-xl bg-black/[0.05]" />
          <div className="h-48 animate-pulse rounded-xl bg-black/[0.035]" />
          <div className="h-24 animate-pulse rounded-xl bg-black/[0.035]" />
        </div>
      ) : settings ? (
        <>
          <IndexPopupSettingsForm
            key={settingsIdentity(settings)}
            session={session}
            settings={settings}
          />
          {settingsQuery.isError ? (
            <div className="mt-4 flex flex-col gap-2 rounded-[0.625rem] bg-tint-soft px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-muted">刷新失败，当前显示上次数据。</p>
              <Button
                size="xs"
                type="button"
                variant="subtle"
                disabled={settingsQuery.isFetching}
                onClick={() => void settingsQuery.refetch()}
              >
                {settingsQuery.isFetching ? '重试中…' : '重试'}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-5 rounded-[0.625rem] bg-error-soft px-4 py-4" role="alert">
          <p className="text-sm text-error">加载失败，请重试</p>
          <Button
            className="mt-3"
            size="sm"
            type="button"
            variant="subtle"
            disabled={settingsQuery.isFetching}
            onClick={() => void settingsQuery.refetch()}
          >
            {settingsQuery.isFetching ? '重试中…' : '重试'}
          </Button>
        </div>
      )}
    </section>
  );
}
