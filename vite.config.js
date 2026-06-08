import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite config: React + Tailwind CSS v4 (via the official Vite plugin, no PostCSS config needed)
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
