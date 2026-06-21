// babel-preset-expo includes expo-router and react-native support (SDK 50+).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
