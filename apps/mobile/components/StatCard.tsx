/**
 * StatCard — matches Figma `StatCard` (89:16): bordered surface (radius md, no
 * shadow), label (Body/S, ink/muted) ABOVE value (Amount/M, ink/strong).
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
      borderRadius="md"
      borderWidth={1}
      borderColor="borderDefault"
      padding="400"
      style={{ gap: 4 }}
    >
      <Text variant="bodySm" color="inkMuted">
        {label}
      </Text>
      <Text variant="amountM">{value}</Text>
    </Box>
  );
}
