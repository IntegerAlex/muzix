module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|tamagui|@tamagui/.*|react-native-reanimated|react-native-gesture-handler|@react-native-community/slider)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
  collectCoverageFrom: [
    'store/**/*.ts',
    'services/**/*.ts',
    'components/**/*.tsx',
    'lib/**/*.ts',
    '!**/*.d.ts',
  ],
};
