# Development Decisions

1. Existing API failures were being replaced with simulated successes. The release candidate removes automatic fallback and returns explicit errors.
2. A disconnected public frontend called localhost. The candidate uses same-origin /api routes with an actual server function.
3. Private resumes stay in server-accessed persistent storage; no public download URL is manufactured.
4. Session IDs are stored in the database and signed into HttpOnly cookies. Logout revokes the stored session.
5. Application records snapshot company and title rather than relying on job refresh survival.
6. AI is constrained to selecting exact original resume lines. The server rejects unsupported lines rather than presenting them as facts.
7. Work is isolated from the other agent's checkout and original Vercel site. Existing customer data is not imported or altered.
8. The AI 101 process informs documentation: intent, context, iterations, decisions, evidence, disclosure. The class example is not treated as a resume UI template.
