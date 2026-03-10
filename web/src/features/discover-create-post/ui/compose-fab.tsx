import { Button } from '@/shared/ui/button';

interface ComposeFabProps {
  onClick: () => void;
}

export function ComposeFab({ onClick }: ComposeFabProps) {
  return (
    <Button
      className="rounded-[1.2rem] px-4 shadow-card sm:rounded-[1.35rem] sm:px-5"
      size="md"
      type="button"
      onClick={onClick}
    >
      <span className="text-base leading-none">+</span>
      <span className="sm:hidden">发布</span>
      <span className="hidden sm:inline">发布好饭</span>
    </Button>
  );
}
