import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  modules: ['shadcn-nuxt'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
    // Docker Desktop bind mounts do not forward file events (docker-compose.dev.yml).
    server: { watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' } },
  },
  shadcn: {
    prefix: '',
    componentDir: './app/components/ui',
  },
  app: {
    head: {
      title: 'Invoice Processing Assistant',
      htmlAttrs: { lang: 'en' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  typescript: {
    strict: true,
  },
})
