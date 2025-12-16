import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    define: {
      // 关键：将 Vercel 的环境变量注入到代码中，使其可以通过 process.env.API_KEY 访问
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  };
});