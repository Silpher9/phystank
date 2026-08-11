import { defineConfig } from "vite";

const configuredBasePath = process.env.PHYSTANK_BASE_PATH ?? "/phystank/";
const basePath = configuredBasePath.endsWith("/")
  ? configuredBasePath
  : `${configuredBasePath}/`;

export default defineConfig({
  // Production uses the project site path; PR previews inject their own path.
  base: basePath,
});
