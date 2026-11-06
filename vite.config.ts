import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { META } from './src/data/meta.ts';

/**
 * Inyecta el título y la descripción del juego en index.html desde src/data/meta.ts,
 * para que el título exista en un único lugar del código.
 */
function gameMetaPlugin(): Plugin {
  return {
    name: 'game-meta',
    transformIndexHtml(html) {
      return html
        .replaceAll('%GAME_TITLE%', META.title)
        .replaceAll('%GAME_DESCRIPTION%', META.description);
    },
  };
}

/** Aviso de licencia de Three.js, que el minificador elimina del código empaquetado. */
const THREE_LICENSE_BANNER =
  '/*! three.js | Copyright 2010-2026 three.js authors | MIT License (texto completo en THIRD-PARTY-LICENSES.md) */\n';

/** Vuelve a poner el aviso de licencia de Three.js al principio de cada archivo JS empaquetado. */
function licenseBannerPlugin(): Plugin {
  return {
    name: 'license-banner',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk' && output.fileName.endsWith('.js')) {
          output.code = THREE_LICENSE_BANNER + output.code;
        }
      }
    },
  };
}

export default defineConfig({
  // Rutas relativas: el juego funciona bajo cualquier subruta de GitHub Pages.
  base: './',
  plugins: [gameMetaPlugin(), licenseBannerPlugin()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    // Genera dist/THIRD-PARTY-LICENSES.md con la licencia completa de las dependencias empaquetadas.
    license: { fileName: 'THIRD-PARTY-LICENSES.md' },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
