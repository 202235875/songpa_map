import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/songpa_map/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
