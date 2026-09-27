/** Figma JobCard: earnings and three readable metadata rows. */
import { Pressable } from 'react-native';
import { Box, Text } from '../theme/restyle.js';
import { Button } from './Button.js';
import { Icon } from './Icon.js';
import { MetaRow } from './MetaRow.js';
import { StatusPill } from './StatusPill.js';

type BadgeTone = 'gold' | 'emerald' | 'danger' | 'muted';
interface JobCardProps {
  title: string;
  pay: string;
  date: string;
  distance: string;
  dress?: string;
  rating?: string;
  badge?: string;
  bookingStatus?: string;
  saving?: boolean;
  saveDisabled?: boolean;
  badgeTone?: BadgeTone;
  saved?: boolean;
  onToggleSave?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  onPress?: () => void;
  slots?: string;
}
export function JobCard({
  title,
  pay,
  date,
  distance,
  dress,
  badge,
  bookingStatus,
  saving = false,
  saveDisabled = false,
  badgeTone = 'muted',
  saved,
  onToggleSave,
  actionLabel = 'View',
  onAction,
  onPress,
  slots,
}: JobCardProps): React.JSX.Element {
  return (
    <Box backgroundColor="bgSurface" borderWidth={1} borderColor="borderDefault" borderRadius="lg">
      <Pressable
        onPress={onPress ?? onAction}
        accessibilityRole="button"
        accessibilityLabel={`View ${title}`}
        style={({ pressed }) => ({ padding: 16, opacity: pressed ? 0.75 : 1 })}
      >
        <Box gap="300">
          <Text variant="headingS" style={{ paddingRight: onToggleSave ? 36 : 0 }}>
            {title}
          </Text>
          <Box flexDirection="row" flexWrap="wrap" justifyContent="space-between" gap="200">
            <Text variant="bodySm" color="inkMuted">
              Estimated earnings
            </Text>
            <Text variant="amountM">{pay}</Text>
          </Box>
          <Box>
            <MetaRow icon="calendar" text={date} />
            <MetaRow icon="map-pin" text={distance} />
            {dress ? <MetaRow icon="briefcase" text={dress} /> : null}
          </Box>
          {slots ? (
            <Text variant="label" color="inkMuted">
              {slots}
            </Text>
          ) : null}
          {badge ? (
            <StatusPill
              status={
                bookingStatus ??
                (badgeTone === 'emerald'
                  ? 'CONFIRMED'
                  : badgeTone === 'gold'
                    ? 'PENDING_PAYMENT'
                    : badgeTone === 'danger'
                      ? 'NO_SHOW'
                      : '')
              }
              label={badge}
            />
          ) : null}
        </Box>
      </Pressable>
      {onToggleSave ? (
        <Pressable
          onPress={onToggleSave}
          disabled={saving || saveDisabled}
          accessibilityRole="button"
          accessibilityState={{ selected: !!saved, busy: saving, disabled: saving || saveDisabled }}
          accessibilityLabel={
            saving
              ? `Updating saved status for ${title}`
              : saved
                ? `Unsave ${title}`
                : `Save ${title}`
          }
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={saving ? 'loader' : 'bookmark'}
            size={19}
            color={saved ? 'brandAccentText' : 'inkMuted'}
          />
        </Pressable>
      ) : null}
      {!onPress && onAction ? (
        <Box paddingHorizontal="400" paddingBottom="300">
          <Button label={actionLabel} variant="ghost" size="md" onPress={onAction} />
        </Box>
      ) : null}
    </Box>
  );
}
