import { CloseButton } from '@heroui/react/close-button';
import { Calendar } from '@heroui/react/calendar';
import { DateField } from '@heroui/react/date-field';
import { DatePicker } from '@heroui/react/date-picker';
import { Label } from '@heroui/react/label';
import { parseDate, parseDateTime, today, toCalendarDateTime } from '@internationalized/date';

export function DatePickerField({
  label,
  value,
  onChange,
  type = 'date',
  isDisabled,
  isRequired,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'date' | 'datetime-local';
  isDisabled?: boolean;
  isRequired?: boolean;
}) {
  const withTime = type === 'datetime-local';
  const dateValue = value ? (withTime ? parseDateTime(value) : parseDate(value)) : null;
  return (
    <DatePicker
      className="min-w-0 w-full"
      value={dateValue}
      placeholderValue={withTime ? toCalendarDateTime(today('Asia/Shanghai')) : today('Asia/Shanghai')}
      onChange={(next) => onChange(next ? next.toString().slice(0, withTime ? 16 : 10) : '')}
      granularity={withTime ? 'minute' : 'day'}
      hourCycle={24}
      isDisabled={isDisabled}
      isRequired={isRequired}
    >
      <Label>{label}</Label>
      <DateField.Group className="min-w-0 w-full">
        <DateField.Input className="min-w-0">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
        <DateField.Suffix>
          {value && !isRequired ? <CloseButton slot={null} aria-label={`清除${label}`} isDisabled={isDisabled} onPress={() => onChange('')} /> : null}
          <DatePicker.Trigger><DatePicker.TriggerIndicator /></DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      <DatePicker.Popover>
        <Calendar aria-label={label}>
          <Calendar.Header>
            <Calendar.NavButton slot="previous" />
            <Calendar.Heading />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
            <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
          </Calendar.Grid>
        </Calendar>
      </DatePicker.Popover>
    </DatePicker>
  );
}
