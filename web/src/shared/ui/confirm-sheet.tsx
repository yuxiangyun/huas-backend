/**
 * [INPUT]: 依赖 shared/ui 的 BottomSheet 与 Button 交互原语
 * [OUTPUT]: 对外提供 ConfirmSheet，收敛重要与破坏性动作的二次确认
 * [POS]: shared/ui 的短任务模态容器，由调用方决定业务文案与执行逻辑
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmSheet({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  busy = false,
  tone = 'primary',
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
  return (
    <BottomSheet
      open={open}
      closeLabel="关闭确认弹层"
      contentClassName="space-y-4"
      showHandle={false}
      onClose={onClose}
    >
      <div className="space-y-1">
        <p className="text-base font-semibold text-ink">{title}</p>
        {description ? (
          <p className="text-sm leading-6 text-muted">{description}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          className="w-full sm:w-auto"
          size="sm"
          type="button"
          variant="subtle"
          onClick={onClose}
        >
          {cancelLabel}
        </Button>
        <Button
          className="w-full sm:w-auto sm:min-w-[7rem]"
          disabled={busy}
          size="sm"
          type="button"
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
        >
          {busy ? '处理中…' : confirmLabel}
        </Button>
      </div>
    </BottomSheet>
  );
}
