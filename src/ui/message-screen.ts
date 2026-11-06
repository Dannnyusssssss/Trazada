import { el, setText, setVisible } from './dom';

/** Mensaje a pantalla completa para errores (sin WebGL, contexto gráfico perdido). Sin enlaces externos. */
export class MessageScreen {
  readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;

  constructor() {
    this.title = el('h2');
    this.text = el('p');
    this.root = el(
      'section',
      { className: 'screen panel message-screen', attrs: { role: 'alert' } },
      [this.title, this.text],
    );
    setVisible(this.root, false);
  }

  show(title: string, text: string): void {
    setText(this.title, title);
    setText(this.text, text);
    setVisible(this.root, true);
  }

  hide(): void {
    setVisible(this.root, false);
  }
}
