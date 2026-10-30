import { Box, Text, useTheme } from '../theme/restyle.js';
import { Card } from './Card.js';
import { Icon } from './Icon.js';

/** Shared profile summary for the usher's own profile and the client's staff view. */
export function ProfileStats({
  rating,
  jobs,
  reliability,
  compact = false,
  reliabilityFirst = false,
}: Readonly<{
  rating: number;
  jobs: number;
  reliability: number;
  compact?: boolean;
  reliabilityFirst?: boolean;
}>): React.JSX.Element {
  const theme = useTheme();
  const metrics = [
    [String(jobs), 'Jobs done'],
    [`${Math.round(reliability)}%`, 'Reliability'],
  ];
  if (reliabilityFirst) metrics.reverse();
  return (
    <Card padded={false}>
      <Box
        flexDirection="row"
        alignItems="center"
        paddingHorizontal="500"
        paddingVertical={compact ? '250' : '500'}
        gap="500"
      >
        <Box flex={1} alignItems="center" gap="150">
          <Box flexDirection="row" alignItems="center" gap="150">
            <Text variant="metricHero">{rating.toFixed(1)}</Text>
            <Icon name="star" size={theme.spacing['400']} color="inkStrong" />
          </Box>
          <Text variant="bodySm" textAlign="center">
            Client rating
          </Text>
        </Box>
        <Box
          width={1}
          minHeight={theme.spacing['2250']}
          alignSelf="stretch"
          backgroundColor="borderDefault"
        />
        <Box flex={1} gap="400">
          {metrics.map(([value, label]) => (
            <Box key={label} gap="50">
              <Text variant="metricValue">{value}</Text>
              <Text variant="bodySm">{label}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    </Card>
  );
}
