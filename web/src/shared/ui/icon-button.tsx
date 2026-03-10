import type { ReactNode } from 'react';
import { Button, type ButtonProps } from '@/shared/ui/button';

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'iconOnly'> {
  icon: ReactNode;
  label: string;
}

export function IconButton({
  icon,
  label,
  size = 'sm',
  type = 'button',
  variant = 'ghost',
  ...props
}: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      iconOnly
      size={size}
      type={type}
      variant={variant}
      {...props}
    >
      {icon}
    </Button>
  );
}
