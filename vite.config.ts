import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// index.html carries the production CSP. Only the dev server additionally needs the
// React Fast Refresh inline preamble and the HMR websocket, so loosen it there alone.
function devServerCsp(): Plugin {
  return {
    name: 'orbit-dev-server-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
        .replace("connect-src 'self';", "connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173;");
    }
  };
}

export default defineConfig({ plugins: [react(), devServerCsp()], base: './', server: { port: 5173, strictPort: true } });
