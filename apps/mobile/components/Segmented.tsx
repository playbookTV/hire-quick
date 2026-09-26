import { Box } from '../theme/restyle.js';
import { Chip } from './Chip.js';

/** Figma uses individually outlined chips for list views; wrap at large text sizes. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}): React.JSX.Element {
  return (
    <Box flexDirection="row" flexWrap="wrap" gap="200">
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </Box>
  );
}
