import { resolve } from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['cjs'],
      fileName: () => 'app4event.cjs',
    },
    rollupOptions: {
      external: ['node', /node_modules/],
      input: 'src/index.ts',
      output: {
        exports: 'named'
      }
    },
  },
  plugins: [
    dts({
      rollupTypes: true,
    }),
  ],
})
