import { Button } from '@/shared/ui/button';

interface ComposeFabProps {
  onClick: () => void;
}

export function ComposeFab({ onClick }: ComposeFabProps) {
  return (
    <Button
      className="h-14 rounded-[1.4rem] px-5 shadow-card"
      size="lg"
      type="button"
      onClick={onClick}
    >
      <span className="mr-2 text-lg leading-none">+</span>
      发布好饭
    </Button>
  );
}
