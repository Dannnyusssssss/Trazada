import './style.css';
import { App } from './app';
import { META } from './data/meta';

// Arranque: el título sale de meta.ts y la aplicación se monta en #app.
document.title = META.title;
const root = document.getElementById('app');
if (root) new App(root).start();
