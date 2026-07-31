const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withTamagui } = require('@tamagui/metro-plugin');

const config = getSentryExpoConfig(__dirname, { isCSSEnabled: true });

module.exports = withTamagui(config, {
  components: ['tamagui'],
  config: './tamagui.config.ts',
  outputCSS: './tamagui.generated.css',
});
