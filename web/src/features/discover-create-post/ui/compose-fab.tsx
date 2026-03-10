import { Button } from '@/shared/ui/button';

interface ComposeFabProps {
  onClick: () => void;
}

function ComposeIcon() {
  return (
    <svg aria-hidden="true" className="h-[1.05rem] w-[1.05rem]" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 4.25V15.75M4.25 10H15.75"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function ComposeFab({ onClick }: ComposeFabProps) {
  return (
    <Button
      aria-label="发布好饭"
      className="h-11 w-11 rounded-full px-0 shadow-[0_18px_38px_rgba(15,23,42,0.18)] ring-1 ring-black/8 lg:h-[var(--control-height-md)] lg:w-auto lg:px-4"
      size="md"
      type="button"
      onClick={onClick}
    >
      <ComposeIcon />
      <span className="hidden text-sm lg:inline">发布好饭</span>
    </Button>
  );
}
