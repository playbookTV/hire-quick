/**
 * BottomNav — matches Figma `BottomNav` (9:2 / 9:31): white bar with a 1.5px top
 * border, five flex tabs (24px icon + Overline/S bold label), emerald when
 * active, ink/muted otherwise. Used as the expo-router Tabs `tabBar`.
 */
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { AnimatedPressable } from './Pressable.js';

export function BottomNav({ state, descriptors, navigation }: BottomTabBarProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Box
      flexDirection="row"
      backgroundColor="bgSurface"
      style={{
        borderTopWidth: 1.5,
        borderTopColor: theme.colors.borderDefault,
        paddingTop: 10,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 8,
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const color = focused ? theme.colors.brandEmerald : theme.colors.inkMuted;
        const label = typeof options.title === 'string' ? options.title : route.name;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <AnimatedPressable
            key={route.key}
            onPress={onPress}
            scaleTo={0.9}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            {options.tabBarIcon?.({ focused, color, size: 24 })}
            <Text
              style={{
                fontFamily: 'PlusJakartaSans_700Bold',
                fontSize: 11,
                lineHeight: 14,
                letterSpacing: 1.2,
                color,
              }}
            >
              {label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </Box>
  );
}
