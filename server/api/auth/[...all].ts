// Better Auth handles every route under /api/auth/**.
export default defineEventHandler((event) => useAuth().handler(toWebRequest(event)))
