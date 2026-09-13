// Vercel runs each file in api/ as a function. This one is the whole Express
// backend: vercel.json rewrites every /api/* request here, and Express still
// sees the original path, so its routes match unchanged.
export { default } from '../server/index.js'
