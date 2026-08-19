import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SPEC.md §11: "Sin llamadas de red en el camino crítico." El servidor de
// desarrollo y el build son puramente locales; no se añade ningún proxy ni
// integración remota aquí.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Ver src/shims/xmlbuilder2-mock.ts: dependencia transitiva de
      // @cornerstonejs/core (vía @kitware/vtk.js) que rompe al evaluarse
      // en el navegador y que SpineMetrics no usa.
      xmlbuilder2: fileURLToPath(new URL('./src/shims/xmlbuilder2-mock.ts', import.meta.url)),
    },
  },
  worker: {
    // @cornerstonejs/dicom-image-loader decodifica fotogramas en un Web
    // Worker con imports dinámicos (carga de códecs bajo demanda); el
    // formato IIFE por defecto de Vite para workers no admite
    // "code-splitting" y el build falla. 'es' sí lo admite.
    format: 'es',
  },
  server: {
    port: 5173,
  },
});
