import type { ReactNode } from 'react';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import { Spinner } from '@heroui/react/spinner';
import { cn } from '@/shared/lib/cn';

interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  children?: ReactNode;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
}

export function ConfirmDialog({ isOpen, onOpenChange, title, children, busy = false, onConfirm, confirmLabel = '删除', confirmVariant = 'danger' }: ConfirmDialogProps) {
  return (
    <AlertDialog isOpen={isOpen} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <AlertDialog.Backdrop isKeyboardDismissDisabled={busy}>
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="min-w-0 [overflow-wrap:anywhere]">
            <AlertDialog.Header><AlertDialog.Heading>{title}</AlertDialog.Heading></AlertDialog.Header>
            {children ? <AlertDialog.Body>{children}</AlertDialog.Body> : null}
            <AlertDialog.Footer className="flex-wrap">
              <Button autoFocus isDisabled={busy} variant="tertiary" onPress={() => onOpenChange(false)}>取消</Button>
              <Button isDisabled={busy} variant={confirmVariant} onPress={() => { void onConfirm(); }}>{busy ? <Spinner size="sm" color="current" /> : null}{confirmLabel}</Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

interface ContentDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  busy?: boolean;
}

export function ContentDialog({ isOpen, onOpenChange, title, children, footer, className, busy = false }: ContentDialogProps) {
  return (
    <Modal isOpen={isOpen} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <Modal.Backdrop isDismissable={!busy} isKeyboardDismissDisabled={busy}>
        <Modal.Container className="sm:w-full sm:p-4" placement="center" scroll="inside" size="lg">
          <Modal.Dialog className={cn('w-full max-w-[42rem] min-w-0 [overflow-wrap:anywhere]', className)}>
            <Modal.CloseTrigger aria-label="关闭" isDisabled={busy} />
            <Modal.Header className="pr-8"><Modal.Heading>{title}</Modal.Heading></Modal.Header>
            <Modal.Body className="min-w-0 text-foreground">{children}</Modal.Body>
            {footer ? <Modal.Footer className="shrink-0 flex-wrap">{footer}</Modal.Footer> : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
