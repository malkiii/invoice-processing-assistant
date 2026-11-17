import { adminClient, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    twoFactorClient({
      async onTwoFactorRedirect() {
        await navigateTo('/auth/two-factor')
      },
    }),
  ],
})
