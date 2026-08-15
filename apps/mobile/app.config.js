const appJson = require('./app.json')

/** Vercel Hobby hosts a static SPA; keep `server` locally for TTS / Hub API routes. */
const webOutput = process.env.VERCEL ? 'single' : appJson.expo.web.output

module.exports = {
  expo: {
    ...appJson.expo,
    web: {
      ...appJson.expo.web,
      output: webOutput,
    },
  },
}
