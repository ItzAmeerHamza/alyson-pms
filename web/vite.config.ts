
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  
  // Check if we're building for admin-only mode
  const isAdminOnly = env.VITE_ADMIN_ONLY === 'true';

  // Validate required environment variables
  const useCognito = env.VITE_AUTH_PROVIDER === 'cognito';
  const requiredEnvVars = useCognito
    ? ['VITE_COGNITO_REGION', 'VITE_COGNITO_USER_POOL_ID', 'VITE_COGNITO_CLIENT_ID', 'VITE_API_BASE_URL']
    : ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
  const missingVars = requiredEnvVars.filter(varName => !env[varName]);

  if (missingVars.length > 0) {
    console.warn(`Warning: Missing environment variables: ${missingVars.join(', ')}`);
  }

  return {
    server: {
      host: "::",
      port: 8080,
      strictPort: false
    },
    plugins: [
      react(),
      mode === "development" && componentTagger()
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src")
      }
    },
    define: {
      global: "globalThis",
      "process.env": JSON.stringify({}),
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(env.VITE_SUPABASE_URL || ""),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ""),
      "import.meta.env.VITE_AUTH_PROVIDER": JSON.stringify(env.VITE_AUTH_PROVIDER || "supabase"),
      "import.meta.env.VITE_COGNITO_REGION": JSON.stringify(env.VITE_COGNITO_REGION || ""),
      "import.meta.env.VITE_COGNITO_USER_POOL_ID": JSON.stringify(env.VITE_COGNITO_USER_POOL_ID || ""),
      "import.meta.env.VITE_COGNITO_CLIENT_ID": JSON.stringify(env.VITE_COGNITO_CLIENT_ID || ""),
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(env.VITE_API_BASE_URL || "http://localhost:3000"),
      "import.meta.env.VITE_ADMIN_ONLY": JSON.stringify(isAdminOnly ? 'true' : 'false')
    },
    build: {
      sourcemap: true,
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          // Ensure assets are always referenced from root
          assetFileNames: 'assets/[name]-[hash][extname]',
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js'
        }
      }
    },
    base: "/"
  };
});
