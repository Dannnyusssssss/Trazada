import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

// La lógica del juego (core, game, audio lógico, datos y guardado) no puede depender
// de Three.js, del render ni de la interfaz: así se puede probar sin navegador.
const pureLogicFiles = [
  'src/core/**/*.ts',
  'src/game/**/*.ts',
  'src/data/**/*.ts',
  'src/audio/**/*.ts',
];

export default defineConfig(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-properties': [
        'error',
        { object: 'document', property: 'write', message: 'No se usa document.write.' },
      ],
    },
  },
  {
    files: pureLogicFiles,
    // El adaptador WebAudio es la única parte del audio que usa la API del navegador.
    ignores: ['src/audio/web/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'La lógica no importa Three.js.' },
            {
              group: ['**/render/**', '**/ui/**'],
              message: 'La lógica no depende del render ni de la UI.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'La lógica no toca el DOM.' },
        { name: 'document', message: 'La lógica no toca el DOM.' },
        { name: 'localStorage', message: 'El guardado vive en src/save.' },
        { name: 'requestAnimationFrame', message: 'El bucle de frames vive fuera de la lógica.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Usa core/rng.ts con semilla.' },
        { object: 'Date', property: 'now', message: 'El tiempo de juego se mide en pasos fijos.' },
        {
          object: 'performance',
          property: 'now',
          message: 'El tiempo de juego se mide en pasos fijos.',
        },
      ],
    },
  },
);
