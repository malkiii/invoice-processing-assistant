// Validates configuration at boot (fails fast on a bad env) and logs warnings such as missing SMTP.
export default defineNitroPlugin(() => {
  const config = useServerConfig()
  for (const warning of config.warnings) console.warn(`[config] ${warning}`)
})
