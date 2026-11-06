import { HUD as HUD_BALANCE, RACE, SIM } from '../data/balance';
import { TEXTS } from '../data/texts';
import type { World } from '../game/world';
import { el, setText, setVisible } from '../ui/dom';
import { formatDelta, formatLapTime, formatSpeed } from '../ui/format';
import { Minimap } from './minimap';
import { stepsToMs } from '../game/race';

/**
 * HUD en DOM sobre el canvas: vuelta, tiempos, velocidad, cuenta atrás, contramano y aviso de vuelta.
 * Solo lee el estado del juego; nunca lo modifica.
 */
export class Hud {
  readonly root: HTMLElement;
  private readonly lapValue: HTMLElement;
  private readonly timeValue: HTMLElement;
  private readonly lastValue: HTMLElement;
  private readonly bestValue: HTMLElement;
  private readonly ghostRow: HTMLElement;
  private readonly ghostValue: HTMLElement;
  readonly minimap = new Minimap();
  private readonly speedValue: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly wrongWay: HTMLElement;
  private readonly lapMessage: HTMLElement;
  private readonly soundButton: HTMLButtonElement;
  private lapMessageUntilStep = -1;
  private seenLaps = 0;

  constructor(onToggleSound: () => void) {
    const row = (label: string): [HTMLElement, HTMLElement] => {
      const value = el('span', { className: 'hud-value' });
      return [
        el('div', { className: 'hud-row' }, [
          el('span', { className: 'hud-label', text: label }),
          value,
        ]),
        value,
      ];
    };
    const [lapRow, lapValue] = row(TEXTS.hud.lap);
    const [timeRow, timeValue] = row(TEXTS.hud.time);
    const [lastRow, lastValue] = row(TEXTS.hud.last);
    const [bestRow, bestValue] = row(TEXTS.hud.best);
    const [ghostRow, ghostValue] = row(TEXTS.hud.ghost);
    this.ghostRow = ghostRow;
    this.ghostValue = ghostValue;
    this.lapValue = lapValue;
    this.timeValue = timeValue;
    this.lastValue = lastValue;
    this.bestValue = bestValue;

    this.speedValue = el('span', { className: 'hud-speed-value' });
    const speed = el('div', { className: 'hud-panel hud-speed' }, [
      this.speedValue,
      el('span', { className: 'hud-speed-unit', text: TEXTS.hud.speedUnit }),
    ]);

    this.soundButton = el('button', { className: 'btn btn-small', attrs: { type: 'button' } });
    this.soundButton.addEventListener('click', onToggleSound);
    // El botón no debe quedarse con el foco: el espacio lo pulsaría en vez de usar el freno de mano.
    this.soundButton.tabIndex = -1;

    this.countdown = el('div', { className: 'hud-countdown', attrs: { 'aria-live': 'assertive' } });
    this.wrongWay = el('div', {
      className: 'hud-banner hud-warning',
      text: TEXTS.hud.wrongWay,
      attrs: { role: 'alert' },
    });
    this.lapMessage = el('div', { className: 'hud-banner', attrs: { 'aria-live': 'polite' } });

    this.root = el('div', { className: 'hud' }, [
      el('div', { className: 'hud-panel hud-times' }, [
        lapRow,
        timeRow,
        lastRow,
        bestRow,
        ghostRow,
      ]),
      this.minimap.canvas,
      el('div', { className: 'hud-top-right' }, [
        this.soundButton,
        el('div', { className: 'hud-panel hud-hint', text: TEXTS.hud.keysHint }),
      ]),
      speed,
      el('div', { className: 'hud-center' }, [this.countdown, this.wrongWay, this.lapMessage]),
    ]);
    setVisible(this.wrongWay, false);
    setVisible(this.lapMessage, false);
  }

  setMuted(muted: boolean): void {
    setText(this.soundButton, muted ? TEXTS.hud.soundOff : TEXTS.hud.soundOn);
    this.soundButton.setAttribute('aria-pressed', String(muted));
  }

  /** Reinicia los avisos al empezar una carrera nueva. */
  reset(): void {
    this.seenLaps = 0;
    this.lapMessageUntilStep = -1;
    setVisible(this.lapMessage, false);
  }

  /**
   * Actualiza el HUD. `ghostDeltaMs` es la diferencia con el fantasma en el mismo punto de la vuelta
   * (negativa = vas por delante) o null si no hay fantasma o aún no se puede comparar.
   */
  update(world: World, speed: number, ghostDeltaMs: number | null): void {
    const race = world.race;
    setText(this.lapValue, `${race.lap}/${race.totalLaps}`);
    setVisible(this.ghostRow, ghostDeltaMs !== null);
    if (ghostDeltaMs !== null) {
      // Signo y color: el signo basta para entenderlo sin distinguir colores.
      setText(this.ghostValue, formatDelta(ghostDeltaMs));
      this.ghostValue.dataset.trend = ghostDeltaMs < 0 ? 'ahead' : 'behind';
    }
    setText(this.timeValue, formatLapTime(stepsToMs(race.lapSteps)));
    setText(this.lastValue, formatLapTime(race.lastLapMs));
    setText(this.bestValue, formatLapTime(race.bestLapMs));
    setText(this.speedValue, formatSpeed(speed));

    // Cuenta atrás: cambia una vez por segundo, sin destellos.
    let countdownText = '';
    if (race.phase === 'countdown') countdownText = String(Math.ceil(race.countdownSteps / SIM.hz));
    else if (race.raceSteps < RACE.goSeconds * SIM.hz) countdownText = TEXTS.hud.go;
    setText(this.countdown, countdownText);
    setVisible(this.countdown, countdownText.length > 0);

    setVisible(this.wrongWay, race.wrongWay);

    if (race.lapsCompleted > this.seenLaps) {
      this.seenLaps = race.lapsCompleted;
      const message = `${TEXTS.hud.lapDone} ${race.lapsCompleted}: ${formatLapTime(race.lastLapMs)}`;
      setText(this.lapMessage, race.lastLapWasBest ? `${message} — ${TEXTS.hud.newBest}` : message);
      this.lapMessageUntilStep = race.raceSteps + HUD_BALANCE.lapMessageSeconds * SIM.hz;
    }
    setVisible(this.lapMessage, race.raceSteps < this.lapMessageUntilStep);
  }
}
