import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Unit tests only: the reducer, the error mapping, the hash parser and the
  // resize arithmetic. No DOM and no network, so no jsdom is needed (D114).
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
