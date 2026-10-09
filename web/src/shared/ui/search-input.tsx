import { SearchField } from '@heroui/react/search-field';
import { cn } from '@/shared/lib/cn';

interface SearchInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SearchInput({ label, value, onChange, className }: SearchInputProps) {
  return <SearchField aria-label={label} value={value} onChange={onChange} className={cn('min-w-0', className)}>
    <SearchField.Group className="h-10 min-w-0 md:h-9">
      <SearchField.SearchIcon />
      <SearchField.Input className="min-w-0" placeholder={label} />
      <SearchField.ClearButton />
    </SearchField.Group>
  </SearchField>;
}
