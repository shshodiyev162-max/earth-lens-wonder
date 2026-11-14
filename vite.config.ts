import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * The picture shown when a link to TerraScope is shared. Previews need its full address: VITE_SITE_URL,
 * or the URL Netlify sets while it builds; without either, the address is relative.
 */
function sharePreview(): Plugin {
  return {
    name: "share-preview",
    transformIndexHtml(html) {
      const site = (process.env.VITE_SITE_URL || process.env.URL || "").replace(/\/$/, "");
      const image = `${site}/og-image.jpg`;
      const tags = [
        `<meta property="og:image" content="${image}" />`,
        `<meta property="og:image:width" content="1200" />`,
        `<meta property="og:image:height" content="630" />`,
        `<meta property="og:image:alt" content="The Earth from space beside the words: What is changing on Earth, and is it real?" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:image" content="${image}" />`,
      ];
      return html.replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), sharePreview(), mode === "development" && componentTagger()].filter(Boolean),
  optimizeDeps: {
    include: ["react-leaflet", "@react-leaflet/core", "react", "react-dom"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
}));
