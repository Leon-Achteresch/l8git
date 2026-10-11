import base from './vite.ui-test.config';
import { fileURLToPath } from 'node:url';

export default {
  ...base,
  build: { ...base.build, outDir: fileURLToPath(new URL('./dist-ui-profile', import.meta.url)), minify: false, sourcemap: true },
};
