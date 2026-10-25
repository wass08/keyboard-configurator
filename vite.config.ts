import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_REVISION__: JSON.stringify(loadEnv('production', '.', 'VERCEL_GIT_COMMIT_SHA').VERCEL_GIT_COMMIT_SHA ?? 'local') },
  build: {
    rolldownOptions: {
      output: {
        // WebKit rejects an unparenthesized `in` inside an arrow body when
        // Oxc joins the declaration into a for initializer (Leva/Stitches).
        // Disable compression until Oxc fixes that transform. Identifier and
        // whitespace minification, tree shaking and code splitting remain.
        minify: { compress: false },
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules\/three\//, priority: 30 },
            { name: 'react', test: /node_modules\/(react|react-dom|scheduler)\//, priority: 20 },
            { name: 'scene', test: /node_modules\//, priority: 10, maxSize: 350000 },
          ],
        },
      },
    },
  },
});
