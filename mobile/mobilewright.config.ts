import { defineConfig } from 'mobilewright';

export default defineConfig({
  platform: 'ios',
  bundleId: 'host.exp.Exponent',
  deviceName: /iPhone 17/,
  testDir: 'mw',
  timeout: 180_000,
  autoAppLaunch: false,
});
