import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { escapeHtml } from './src/core/html.ts';
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
        .replaceAll('%GAME_TITLE%', escapeHtml(META.title))
        .replaceAll('%GAME_DESCRIPTION%', escapeHtml(META.description));
    },
  };
}

/**
 * Política de seguridad de contenido del juego publicado: solo recursos del propio origen, sin scripts ni
 * estilos en línea, sin plugins y sin formularios. GitHub Pages no permite cabeceras propias, así que va
 * como <meta>; eso no cubre frame-ancestors, HSTS, nosniff ni Permissions-Policy. Solo se aplica al build:
 * el servidor de desarrollo necesita scripts en línea y una conexión de recarga en caliente.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/** Añade la política de seguridad y la de referencia justo después de <meta charset> en el build. */
function securityMetaPlugin(): Plugin {
  return {
    name: 'security-meta',
    apply: 'build',
    transformIndexHtml(html) {
      const charset = '<meta charset="UTF-8" />';
      if (!html.includes(charset))
        throw new Error('index.html debe empezar con <meta charset="UTF-8" />');
      const tags = [
        charset,
        `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`,
        '<meta name="referrer" content="strict-origin-when-cross-origin" />',
      ];
      return html.replace(charset, tags.join('\n    '));
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
  plugins: [gameMetaPlugin(), securityMetaPlugin(), licenseBannerPlugin()],
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
