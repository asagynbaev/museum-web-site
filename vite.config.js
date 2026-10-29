import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    open: true,
    // Билетный API в разработке живёт отдельным процессом (см. server/).
    // В проде сайт и /api стоят за одним nginx, поэтому пути относительные.
    proxy: {
      // Голосовой гид (/bars): токен Gemini Live и тулы — сервер консьержа
      // (репозиторий ai-concierge, :8090). Раньше общего '/api': правила
      // проверяются по порядку.
      '/api/live': { target: process.env.VITE_CONCIERGE_PROXY || 'http://127.0.0.1:8090' },
      '/api/tools': { target: process.env.VITE_CONCIERGE_PROXY || 'http://127.0.0.1:8090' },
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
