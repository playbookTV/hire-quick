/**
 * StatCard — big value over a label (Figma StatCard). Used on dashboards.
 */
import { Box, Text } from '../theme/restyle.js';

interface StatCardProps {
  value: string;
  label: string;
}

export function StatCard({ value, label }: StatCardProps): React.JSX.Element {
  return (
    <Box
      flex={1}
      backgroundColor="bgSurface"
      borderRadius="lg"
      borderWidth={1}
      borderColor="borderDefault"
      padding="400"
    >
      <Text variant="amount">{value}</Text>
      <Text variant="bodySm" color="inkMuted" marginTop="100">
        {label}
      </Text>
    </Box>
  );
}
