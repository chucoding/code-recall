import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const functionsUrl = mode === 'production'
    ? env.VITE_FUNCTIONS_URL_PROD : env.VITE_FUNCTIONS_URL_LOCAL;

  const plugins = [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'CodeRecall',
        short_name: 'CodeRecall',
        description: 'Review GitHub commits as flashcards',
        start_url: '/app',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#121212',
        icons: [
          {
            src: 'favicon.ico',
            sizes: '64x64 32x32 24x24 16x16',
            type: 'image/x-icon'
          },
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,gif}'],
        navigateFallback: '/app.html'
      }
    }),
  ];

  return {
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    plugins,
    build: {
      rollupOptions: {
        input: {
          landing: resolve(__dirname, 'index.html'),
          app: resolve(__dirname, 'app.html'),
          terms: resolve(__dirname, 'terms.html'),
          'terms-en': resolve(__dirname, 'terms-en.html'),
          privacy: resolve(__dirname, 'privacy.html'),
          'privacy-en': resolve(__dirname, 'privacy-en.html'),
        },
      },
    },
    server: {
      open: true,
      proxy: {
        '/api': {
          target: functionsUrl,
          changeOrigin: true,
          secure: false, // 로컬 개발 시 false
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    }
  };
});
