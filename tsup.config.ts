import { defineConfig } from 'tsup';

export default defineConfig({
    entry: [
        'src/index.ts',
        'src/cron/index.ts',
        'src/tz/index.ts',
        'src/describe/index.ts',
        'src/schedule/index.ts',
    ],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    treeshake: true,
});
