import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env variables based on the current mode from the project root directory
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      // Optionally use an environment variable to configure the server
      port: env.PORT ? parseInt(env.PORT, 10) : 3000
    },
    // Use environment variables to set global constants which will be replaced during build
    define: {
      APP_URL: JSON.stringify(env.APP_URL) // Use this in your application to access `APP_ENV`
    }
  }
})
