import { defineConfig } from 'vite';

// Set this non-secret variable to /chat/ for the GitHub Pages project site.
const base = process.env.NORTHSTAR_BASE_PATH ?? '/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) {
  throw new Error('NORTHSTAR_BASE_PATH must be / or a slash-delimited path with a trailing slash, such as /chat/.');
}

export default defineConfig({ base });
