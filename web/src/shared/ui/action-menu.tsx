/**
 * [INPUT]: 依赖 Radix DropdownMenu、Lucide 更多图标与 shared Button 交互规范
 * [OUTPUT]: 对外提供 ActionMenu，将次级和危险动作收纳到可访问菜单
 * [POS]: shared/ui 的动作降级原语，避免删除等低频行为占据页面主视觉
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Ellipsis } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/shared/lib/cn';
import { IconButton } from '@/shared/ui/icon-button';

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  label?: string;
  className?: string;
}

export function ActionMenu({ items, label = '更多操作', className }: ActionMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          className={className}
          icon={<Ellipsis aria-hidden="true" className="size-4" />}
          label={label}
          size="sm"
          variant="ghost"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-[90] min-w-36 rounded-[0.625rem] border border-line bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.14)]"
          sideOffset={6}
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              className={cn(
                'flex h-9 cursor-default select-none items-center rounded-[0.45rem] px-3 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-tint-soft',
                item.tone === 'danger' ? 'text-error' : 'text-ink'
              )}
              disabled={item.disabled}
              onSelect={item.onSelect}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
