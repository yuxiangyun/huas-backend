import { Button } from '@/shared/ui/button';

interface DeletePostButtonProps {
  busy?: boolean;
  onDelete?: () => void;
  visible: boolean;
}

export function DeletePostButton({ busy = false, onDelete, visible }: DeletePostButtonProps) {
  if (!visible) return null;

  return (
    <Button fullWidth type="button" variant="danger" disabled={busy} onClick={onDelete}>
      {busy ? '删除中...' : '删除帖子'}
    </Button>
  );
}
