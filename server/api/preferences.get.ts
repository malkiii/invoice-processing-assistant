import { getUserPreferences } from '../db/user-preferences'

export default defineEventHandler(async (event) => {
  const { user } = await requireSession(event)
  return getUserPreferences(useDb(), user.id)
})
