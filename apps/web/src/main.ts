import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { i18n } from './i18n';
import './styles/tailwind.css';
import './styles/variables.css';
import './styles/glass.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.mount('#app');
