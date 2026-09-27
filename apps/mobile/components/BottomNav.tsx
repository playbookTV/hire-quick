/** Figma navigation: equal slots, selected container and adaptive large-text rows. */
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Box, Text } from '../theme/restyle.js';
import { AnimatedPressable } from './Pressable.js';
import { NavigationIcon } from './NavigationIcon.js';

export function BottomNav({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const expanded = fontScale > 1.3 || width / fontScale < 320;
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [pressKey, setPressKey] = useState<string | null>(null);
  const tabs = state.routes.flatMap((route, index) => {
    const { options } = descriptors[route.key];
    // Expo Router marks href:null routes with display:none. Keep them routable, off the bar.
    if (StyleSheet.flatten(options.tabBarItemStyle)?.display === 'none') return [];
    const selected = state.index === index;
    const color = selected ? theme.colors.inkStrong : theme.colors.inkMuted;
    const label = typeof options.title === 'string' ? options.title : route.name;
    return [
      <AnimatedPressable
        key={route.key}
        scaleTo={1}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        onFocus={() => setFocusKey(route.key)}
        onBlur={() => setFocusKey(null)}
        onPressIn={() => setPressKey(route.key)}
        onPressOut={() => setPressKey(null)}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        aria-selected={selected}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
        style={{
          flex: expanded ? undefined : 1,
          minWidth: 0,
          minHeight: expanded ? 56 : 52,
          flexDirection: expanded ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing[expanded ? '300' : '100'],
          padding: expanded ? theme.spacing['300'] : 0,
          borderRadius: theme.borderRadii.sm,
          backgroundColor:
            pressKey === route.key
              ? theme.colors.bgSurfaceAlt
              : selected
                ? theme.colors.brandAccentSubtle
                : 'transparent',
          outlineWidth: focusKey === route.key ? 3 : 0,
          outlineColor: theme.colors.borderFocus,
          outlineOffset: 0,
        }}
      >
        <NavigationIcon name={route.name} color={color} />
        <Text
          variant="navigation"
          style={{
            color,
            textAlign: expanded ? 'left' : 'center',
            flex: expanded ? 1 : undefined,
            flexShrink: 1,
          }}
        >
          {label}
        </Text>
        <Box
          style={{
            width: expanded ? 2 : 20,
            height: expanded ? 20 : 2,
            backgroundColor: selected ? color : 'transparent',
          }}
        />
      </AnimatedPressable>,
    ];
  });
  const content = (
    <Box flexDirection={expanded ? 'column' : 'row'} gap={expanded ? '200' : 'none'}>
      {tabs}
    </Box>
  );
  return (
    <Box
      backgroundColor="bgSurface"
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.colors.borderDefault,
        paddingTop: theme.spacing['300'],
        paddingHorizontal: theme.spacing['200'],
        paddingBottom: Math.max(insets.bottom, theme.spacing['300']),
        maxHeight: expanded ? height * 0.45 : undefined,
      }}
    >
      {expanded ? <ScrollView showsVerticalScrollIndicator>{content}</ScrollView> : content}
    </Box>
  );
}
