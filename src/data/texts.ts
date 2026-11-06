/** Textos visibles para el jugador. Todos en español y en un único lugar. */
export const TEXTS = {
  loading: 'Cargando…',
  start: {
    subtitle: 'Carreras arcade contrarreloj. Encuentra la trazada perfecta y bate tu mejor vuelta.',
    play: 'Jugar',
    settings: 'Ajustes',
    controlsTitle: 'Controles',
    controls: [
      ['W / ↑', 'Acelerar'],
      ['S / ↓', 'Frenar y marcha atrás'],
      ['A D / ← →', 'Girar'],
      ['Espacio', 'Freno de mano (derrape)'],
      ['R', 'Reaparecer en el último control'],
      ['Esc / P', 'Pausa'],
      ['M', 'Silenciar'],
    ] as const,
    rulesTitle: 'Cómo se juega',
    rules:
      'Da vueltas al circuito lo más rápido que puedas. La vuelta solo cuenta si pasas por todos los puntos de control en orden.',
    warningTitle: 'Aviso',
    warning:
      'Este juego tiene movimiento de cámara y efectos de luz. Si te molestan, activa «Reducir movimiento». No contiene violencia.',
    playHint: 'Haz clic en «Jugar» o pulsa Intro para empezar.',
  },
  pause: {
    title: 'Pausa',
    resume: 'Continuar',
    restart: 'Reiniciar carrera',
    settings: 'Ajustes',
    menu: 'Menú principal',
    hint: 'Pulsa Esc o P para continuar.',
    focusLost:
      'El juego se pausó porque salió de la ventana. Haz clic en «Continuar» para seguir jugando.',
  },
  settings: {
    title: 'Ajustes',
    mute: 'Silenciar sonido',
    muteHint: 'Por ahora el juego no tiene sonido; este ajuste se guarda para más adelante.',
    reducedMotion: 'Reducir movimiento',
    reducedMotionHint:
      'La cámara sigue al coche más de cerca, con menos balanceo y sin efectos de destello.',
    fov: 'Campo de visión',
    fovUnit: '°',
    back: 'Volver',
  },
  hud: {
    lap: 'Vuelta',
    time: 'Tiempo',
    last: 'Última',
    best: 'Mejor',
    speedUnit: 'km/h',
    emptyTime: '-:--.---',
    go: '¡YA!',
    wrongWay: '⚠ ¡Contramano! Da la vuelta',
    lapDone: 'Vuelta',
    newBest: '★ ¡Nueva mejor vuelta!',
    soundOn: 'Sonido: sí (M)',
    soundOff: 'Sonido: no (M)',
    keysHint: 'Esc: pausa · R: reaparecer',
  },
  surfaces: {
    asphalt: 'asfalto',
    curb: 'piano',
    grass: 'césped',
  },
  errors: {
    webglTitle: 'No se puede mostrar el juego',
    webgl:
      'Este navegador o este equipo no permite usar WebGL, que el juego necesita para dibujar en 3D. Prueba con otro navegador o activa la aceleración por hardware en sus ajustes.',
    contextLostTitle: 'Gráficos en pausa',
    contextLost:
      'El navegador detuvo los gráficos un momento. El juego volverá en pausa en cuanto se recuperen.',
  },
  debug: {
    title: 'Depuración',
    reset: 'Restablecer',
    show: 'Mostrar valores',
    physics: 'Física',
  },
} as const;
