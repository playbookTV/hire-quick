// babel-preset-expo includes expo-router and react-native support (SDK 50+).
// react-native-worklets/plugin powers Reanimated 4 worklets and MUST be listed
// last. (In Reanimated 4 the babel plugin moved out of react-native-reanimated.)
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
