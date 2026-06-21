/**
 * ReviewCard — matches Figma `ReviewCard` (93:35): name (Label/L) + date
 * (Body/S, ink/faint) with a 5-star row, then the comment (Body/M, ink/default).
 */
import { Box, Text } from '../theme/restyle.js';
import { Card } from './Card.js';
import { Icon } from './Icon.js';

interface ReviewCardProps {
  name: string;
  date: string;
  comment: string;
  rating?: number;
}

export function ReviewCard({ name, date, comment, rating = 5 }: ReviewCardProps): React.JSX.Element {
  return (
    <Card>
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom="200">
        <Box>
          <Text variant="label" style={{ fontSize: 15, lineHeight: 20 }} color="inkStrong">
            {name}
          </Text>
          <Text variant="bodySm" color="inkFaint" marginTop="50">
            {date}
          </Text>
        </Box>
        <Box flexDirection="row" style={{ gap: 1 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Icon key={i} name="star" size={14} color={i < rating ? 'accentGold' : 'borderStrong'} />
          ))}
        </Box>
      </Box>
      <Text variant="body" color="inkDefault">
        {comment}
      </Text>
    </Card>
  );
}
