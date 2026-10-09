import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Select } from '@heroui/react/select';
import { cn } from '@/shared/lib/cn';

export function OperationsSelect<Value extends string>({
  label,
  value,
  options,
  onChange,
  isDisabled,
  className,
  hideLabel = false,
}: {
  label: string;
  value: Value;
  options: ReadonlyArray<{ value: Value; label: string }>;
  onChange: (value: Value) => void;
  isDisabled?: boolean;
  className?: string;
  hideLabel?: boolean;
}) {
  return (
    <Select
      className={cn('min-w-0', hideLabel && 'shrink-0', className)}
      aria-label={hideLabel ? label : undefined}
      isDisabled={isDisabled}
      value={value}
      onChange={(next) => {
        const option = options.find((item) => item.value === next);
        if (option) onChange(option.value);
      }}
    >
      {!hideLabel ? <Label>{label}</Label> : null}
      <Select.Trigger className={hideLabel ? 'h-10 items-center md:h-9' : undefined}>
        <Select.Value className="min-w-0" />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item id={option.value} key={option.value} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}


export function beijingDateTime(value: string | Date = new Date()) {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function beijingDateTimeToIso(value: string) {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  const date = new Date(`${value}+08:00`);
  if (!match || Number.isNaN(date.getTime()) || beijingDateTime(date) !== value) {
    throw new Error('请填写有效的北京时间');
  }
  return date.toISOString();
}

export function operationError(error: unknown, fallback = '保存失败，请重试') {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function isNewerSnapshot(next: string | null, current: string | null) {
  return Date.parse(next ?? '') >= Date.parse(current ?? '') || current === null;
}
