import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

function pagesBase(): string {
  const fromEnv = process.env.BASE_PATH?.trim();
  if (fromEnv) return fromEnv.endsWith('/') ? fromEnv : `${fromEnv}/`;

  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (process.env.GITHUB_PAGES === 'true' && repoName) {
    return `/${repoName}/`;
  }
  return '/';
}

export default defineConfig(() => {
  return {
    base: pagesBase(),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : { ignored: ['**/.jdk/**'] },
    },
  };
});
