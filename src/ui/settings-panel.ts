import { TOUCH_OPACITY, type TouchSettings, type TouchSize } from '../core/touch';
import { CAMERA, type Quality } from '../data/balance';
import { TEXTS } from '../data/texts';
import type { AssistSettings } from '../game/assists';
import type { Settings } from '../save/storage';
import { ControlsTab } from './controls-tab';
import { button, el, setText, setVisible, toggle } from './dom';
import { radioGroup, rangeRow } from './form-controls';
import { Tabs } from './tabs';

type TabId = keyof typeof TEXTS.settings.tabs;

/** Volumen: barras de 0 a 100 en pasos de 5. */
const VOLUME_RANGE = { min: 0, max: 100, step: 5, unit: TEXTS.settings.volumeUnit } as const;

/**
 * Ventana de ajustes con pestañas: Pantalla, Sonido, Controles, Conducción y Táctil (esta solo con pantalla
 * táctil). Los cambios se aplican al momento; cada pestaña puede volver a sus valores de fábrica.
 */
export class SettingsPanel {
  readonly root: HTMLElement;
  private readonly tabs: Tabs;
  private readonly controls: ControlsTab;
  /** Avisos de la ventana (restaurar valores), anunciados por los lectores de pantalla. */
  private readonly status = el('p', { className: 'hint window-status', attrs: { role: 'status' } });
  /** Ajustes que muestra la ventana (se actualizan con cada cambio). */
  private current: Settings;
  /** Actualiza cada control a partir de `current`. */
  private readonly syncers: ((settings: Settings) => void)[] = [];

  constructor(
    onChange: (patch: Partial<Settings>) => void,
    onBack: () => void,
    private readonly defaults: () => Settings,
  ) {
    this.current = defaults();
    const change = (patch: Partial<Settings>): void => {
      this.current = { ...this.current, ...patch };
      onChange(patch);
    };
    const check = (
      label: string,
      hint: string,
      get: (s: Settings) => boolean,
      patch: (on: boolean) => Partial<Settings>,
    ): HTMLElement => {
      const t = toggle(label, false, (on) => change(patch(on)), hint);
      this.syncers.push((s) => (t.input.checked = get(s)));
      return t.root;
    };
    const radios = <T extends string>(
      legend: string,
      name: string,
      options: Readonly<Record<T, string>>,
      hint: string,
      get: (s: Settings) => T,
      patch: (value: T) => Partial<Settings>,
    ): HTMLElement => {
      const g = radioGroup(legend, name, options, (value) => change(patch(value)), hint);
      this.syncers.push((s) => g.set(get(s)));
      return g.root;
    };
    const range = (
      options: Parameters<typeof rangeRow>[0],
      get: (s: Settings) => number,
      patch: (value: number) => Partial<Settings>,
    ): HTMLElement => {
      const r = rangeRow(options, (value) => change(patch(value)));
      this.syncers.push((s) => r.set(get(s)));
      return r.root;
    };
    const assist = (key: keyof AssistSettings, label: string, hint: string): HTMLElement =>
      check(
        label,
        hint,
        (s) => s.assists[key],
        (on) => ({ assists: { ...this.current.assists, [key]: on } }),
      );
    const touch = (patch: Partial<TouchSettings>): Partial<Settings> => ({
      touch: { ...this.current.touch, ...patch },
    });

    const display = this.panel('display', [
      check(
        TEXTS.settings.reducedMotion,
        TEXTS.settings.reducedMotionHint,
        (s) => s.reducedMotion,
        (reducedMotion) => ({ reducedMotion }),
      ),
      range(
        {
          id: 'fov-input',
          label: TEXTS.settings.fov,
          min: CAMERA.fovMin,
          max: CAMERA.fovMax,
          step: 1,
          unit: TEXTS.settings.fovUnit,
        },
        (s) => s.fov,
        (fov) => ({ fov }),
      ),
      radios<Quality>(
        TEXTS.settings.quality,
        'quality',
        TEXTS.settings.qualityOptions,
        TEXTS.settings.qualityHint,
        (s) => s.quality,
        (quality) => ({ quality }),
      ),
      check(
        TEXTS.settings.dynamicResolution,
        TEXTS.settings.dynamicResolutionHint,
        (s) => s.dynamicResolution,
        (dynamicResolution) => ({ dynamicResolution }),
      ),
      radios<Settings['camera']>(
        TEXTS.settings.camera,
        'camera',
        TEXTS.settings.cameraOptions,
        TEXTS.settings.cameraHint,
        (s) => s.camera,
        (camera) => ({ camera }),
      ),
      check(
        TEXTS.settings.showMetrics,
        TEXTS.settings.showMetricsHint,
        (s) => s.showMetrics,
        (showMetrics) => ({ showMetrics }),
      ),
    ]);
    const sound = this.panel('sound', [
      check(
        TEXTS.settings.mute,
        TEXTS.settings.muteHint,
        (s) => s.muted,
        (muted) => ({ muted }),
      ),
      range(
        { id: 'volume-input', label: TEXTS.settings.volume, ...VOLUME_RANGE },
        (s) => s.volume,
        (volume) => ({ volume }),
      ),
      check(
        TEXTS.settings.music,
        TEXTS.settings.musicHint,
        (s) => s.music,
        (music) => ({ music }),
      ),
      range(
        { id: 'music-volume-input', label: TEXTS.settings.musicVolume, ...VOLUME_RANGE },
        (s) => s.musicVolume,
        (musicVolume) => ({ musicVolume }),
      ),
      range(
        {
          id: 'sfx-volume-input',
          label: TEXTS.settings.sfxVolume,
          hint: TEXTS.settings.sfxVolumeHint,
          ...VOLUME_RANGE,
        },
        (s) => s.sfxVolume,
        (sfxVolume) => ({ sfxVolume }),
      ),
    ]);
    this.controls = new ControlsTab((controls) => change({ controls }));
    this.syncers.push((s) => this.controls.sync(s.controls));
    const controls = this.panel('controls', [this.controls.root]);
    const driving = this.panel('driving', [
      el('h3', { text: TEXTS.settings.assistsTitle }),
      assist('steering', TEXTS.settings.steeringAssist, TEXTS.settings.steeringAssistHint),
      assist('braking', TEXTS.settings.brakingAssist, TEXTS.settings.brakingAssistHint),
      assist('autoRespawn', TEXTS.settings.autoRespawn, TEXTS.settings.autoRespawnHint),
    ]);
    const touchPanel = this.panel('touch', [
      check(
        TEXTS.settings.touchAutoThrottle,
        TEXTS.settings.touchAutoThrottleHint,
        (s) => s.touch.autoThrottle,
        (autoThrottle) => touch({ autoThrottle }),
      ),
      check(
        TEXTS.settings.touchLeftHanded,
        TEXTS.settings.touchLeftHandedHint,
        (s) => s.touch.leftHanded,
        (leftHanded) => touch({ leftHanded }),
      ),
      radios<TouchSize>(
        TEXTS.settings.touchSize,
        'touch-size',
        TEXTS.settings.touchSizes,
        TEXTS.settings.touchSizeHint,
        (s) => s.touch.size,
        (size) => touch({ size }),
      ),
      range(
        {
          id: 'touch-opacity-input',
          label: TEXTS.settings.touchOpacity,
          hint: TEXTS.settings.touchOpacityHint,
          min: TOUCH_OPACITY.min,
          max: TOUCH_OPACITY.max,
          step: TOUCH_OPACITY.step,
          unit: TEXTS.settings.touchOpacityUnit,
        },
        (s) => s.touch.opacity,
        (opacity) => touch({ opacity }),
      ),
    ]);

    this.tabs = new Tabs('settings', TEXTS.settings.tabsLabel, [
      { id: 'display', label: TEXTS.settings.tabs.display, panel: display },
      { id: 'sound', label: TEXTS.settings.tabs.sound, panel: sound },
      { id: 'controls', label: TEXTS.settings.tabs.controls, panel: controls },
      { id: 'driving', label: TEXTS.settings.tabs.driving, panel: driving },
      { id: 'touch', label: TEXTS.settings.tabs.touch, panel: touchPanel, className: 'only-touch' },
    ]);
    // Cada pestaña puede volver a sus valores de fábrica sin tocar las demás.
    for (const [id, panel] of [
      ['display', display],
      ['sound', sound],
      ['controls', controls],
      ['driving', driving],
      ['touch', touchPanel],
    ] as const) {
      panel.appendChild(
        el('div', { className: 'tab-reset' }, [
          button(TEXTS.settings.resetTab, () => this.resetTab(id, change), 'btn btn-small'),
          el('small', { className: 'hint', text: TEXTS.settings.resetTabHint }),
        ]),
      );
    }

    const close = button('✕', onBack, 'btn btn-icon window-close');
    close.setAttribute('aria-label', TEXTS.settings.close);
    this.root = el(
      'section',
      {
        className: 'screen panel window settings-panel',
        attrs: { 'aria-labelledby': 'settings-title' },
      },
      [
        el('header', { className: 'window-header' }, [
          el('h2', { text: TEXTS.settings.title, attrs: { id: 'settings-title' } }),
          close,
        ]),
        el('div', { className: 'window-body' }, [this.tabs.root]),
        el('footer', { className: 'window-footer' }, [
          this.status,
          el('small', { className: 'hint only-keys', text: TEXTS.settings.tabsHint }),
          button(TEXTS.settings.back, onBack, 'btn btn-primary'),
        ]),
      ],
    );
  }

  /** Contenedor de una pestaña (lo que se desplaza dentro de la ventana). */
  private panel(_id: TabId, children: readonly Node[]): HTMLElement {
    return el('div', {}, children);
  }

  /** Vuelve a los valores de fábrica los ajustes de una pestaña. */
  private resetTab(id: TabId, change: (patch: Partial<Settings>) => void): void {
    const d = this.defaults();
    const patches: Record<TabId, Partial<Settings>> = {
      display: {
        reducedMotion: d.reducedMotion,
        fov: d.fov,
        quality: d.quality,
        dynamicResolution: d.dynamicResolution,
        camera: d.camera,
        showMetrics: d.showMetrics,
      },
      sound: {
        muted: d.muted,
        volume: d.volume,
        music: d.music,
        musicVolume: d.musicVolume,
        sfxVolume: d.sfxVolume,
      },
      controls: { controls: d.controls },
      driving: { assists: { ...d.assists } },
      touch: { touch: { ...d.touch } },
    };
    change(patches[id]);
    this.sync();
    setText(this.status, TEXTS.settings.resetDone);
  }

  private sync(): void {
    for (const syncer of this.syncers) syncer(this.current);
  }

  /** Pestaña siguiente o anterior (LB/RB del mando). */
  stepTab(delta: 1 | -1): void {
    this.tabs.step(delta, true);
  }

  show(settings: Settings): void {
    this.current = settings;
    setText(this.status, '');
    this.sync();
    setVisible(this.root, true);
    this.tabs.ensureVisibleSelection();
    this.tabs.select(this.tabs.selected, true);
  }

  hide(): void {
    this.controls.close();
    setVisible(this.root, false);
  }
}
