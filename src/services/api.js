const base = (import.meta.env.VITE_API_URL || "")
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${base}/api${path}`, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
      signal: options.signal || AbortSignal.timeout(55000),
    });
  } catch {
    throw new Error("We could not reach the service. Please try again.");
  }
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("The API route is unavailable. Please try again later.");
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(result.error || `Request failed (${response.status}).`),
      { status: response.status },
    );
  return result;
}
const write = (path, body, method = "POST") =>
  request(path, { method, body: JSON.stringify(body) });
export const api = {
  health: async () => {
    const response = await fetch(`${base}/api/health`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new Error("Service status is unavailable.");
    return response.json();
  },
  search: ({ query = "", location = "", remote = false }, signal) =>
    request(
      `/search?${new URLSearchParams({ q: query, location, remote: String(remote) })}`,
      { signal },
    ),
  login: (email, password) => write("/auth/login", { email, password }),
  register: (data) => write("/auth/register", data),
  logout: () => write("/auth/logout", {}),
  getProfile: () => request("/user/profile"),
  getResumes: () => request("/resumes"),
  uploadResume: (formData) =>
    request("/resume/upload", { method: "POST", body: formData }),
  deleteResume: (id) =>
    request(`/resumes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  tailorJob: (jobId, resumeId) => write("/jobs/tailor", { jobId, resumeId }),
  getApplications: () => request("/applications"),
  logApplication: (data) => write("/applications", data),
  updateApplication: (id, status) =>
    write(`/applications/${encodeURIComponent(id)}`, { status }, "PUT"),
  getMetrics: () => request("/metrics"),
  submitLead: (data) => write("/leads", data),
};
