import './style.css';
import { App } from './app';
import { META } from './data/meta';
import { TEXTS } from './data/texts';

// Arranque: el título sale de meta.ts y la aplicación se monta en #app.
document.title = META.title;
const root = document.getElementById('app');
if (root) {
  let app: App | null = null;
  try {
    app = new App(root);
    app.start();
  } catch (error) {
    // Si el arranque falla, se explica con un mensaje en lugar de dejar la página en blanco.
    if (app) {
      app.fail(error);
    } else {
      console.error(error);
      const box = document.createElement('section');
      box.className = 'screen panel message-screen';
      box.setAttribute('role', 'alert');
      const title = document.createElement('h2');
      title.textContent = TEXTS.errors.unexpectedTitle;
      const text = document.createElement('p');
      text.textContent = TEXTS.errors.unexpected;
      box.append(title, text);
      root.replaceChildren(box);
    }
  }
}
