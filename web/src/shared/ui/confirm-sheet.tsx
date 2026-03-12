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
          {busy ? '处理中...' : confirmLabel}
        </Button>
      </div>
    </BottomSheet>
  );
}
