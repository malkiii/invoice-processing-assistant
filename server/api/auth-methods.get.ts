// Tells the auth pages which sign-in methods this instance has configured.
export default defineEventHandler(() => {
  const config = useServerConfig()
  return {
    google: Boolean(config.oauth.google),
    github: Boolean(config.oauth.github),
    emailVerification: config.requireEmailVerification,
    passwordReset: config.smtp !== null,
  }
})
