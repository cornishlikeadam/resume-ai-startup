function plainText(html = "") {
  return require("he")
    .decode(String(html))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createJobSource(
  fetcher = fetch,
  snapshot = require("./job-snapshot.json"),
) {
  let cache;
  let pending;
  async function load() {
    if (
      cache &&
      Date.now() - cache.time < 30 * 60 * 1000 &&
      (!cache.cached ||
        Date.now() - Date.parse(cache.fetchedAt) <= 24 * 60 * 60 * 1000)
    )
      return cache;
    if (pending) return pending;
    pending = (async () => {
      let payload,
        fetchedAt,
        cached = false;
      try {
        const response = await fetcher(
          "https://www.arbeitnow.com/api/job-board-api",
          {
            signal: AbortSignal.timeout(6000),
            headers: { Accept: "application/json" },
          },
        );
        if (!response.ok) throw new Error("Source request failed.");
        payload = await response.json();
        if (!Array.isArray(payload.data))
          throw new Error("Unexpected job-source response.");
        fetchedAt = new Date().toISOString();
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "job_source_unavailable",
            type: error.name,
            code: error.cause?.code || null,
          }),
        );
        const age = Date.now() - Date.parse(snapshot?.captured_at || "");
        if (
          !Number.isFinite(age) ||
          age < 0 ||
          age > 24 * 60 * 60 * 1000 ||
          !Array.isArray(snapshot.data)
        )
          throw Object.assign(
            new Error(
              "The job source is unavailable and the saved source batch has expired. Try again later.",
            ),
            { status: 502 },
          );
        payload = snapshot;
        fetchedAt = snapshot.captured_at;
        cached = true;
      }
      const jobs = payload.data
        .filter(
          (job) =>
            job.slug &&
            job.title &&
            /^https:\/\/www\.arbeitnow\.com\//.test(job.url),
        )
        .map((job) => ({
          id: String(job.slug),
          title: String(job.title),
          company: String(job.company_name || ""),
          location: String(job.location || ""),
          remote: Boolean(job.remote),
          url: job.url,
          description: plainText(job.description).slice(0, 16000),
          tags: Array.isArray(job.tags) ? job.tags : [],
          salary: null,
          source: "Arbeitnow",
          source_url: job.url,
          fetched_at: fetchedAt,
          posted_at: Number.isFinite(Number(job.created_at))
            ? new Date(Number(job.created_at) * 1000).toISOString()
            : null,
          mode: cached ? "cached_source" : "live",
        }));
      cache = { jobs, time: Date.now(), fetchedAt, cached };
      return cache;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  }
  return {
    async search({ query = "", location = "", remote = false } = {}) {
      const { jobs, fetchedAt, cached } = await load();
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const matched = jobs
        .filter((job) => {
          const text =
            `${job.title} ${job.company} ${job.tags.join(" ")} ${job.description}`.toLowerCase();
          return (
            words.every((word) => text.includes(word)) &&
            (!location ||
              job.location.toLowerCase().includes(location.toLowerCase())) &&
            (!remote || job.remote)
          );
        })
        .sort(
          (a, b) =>
            words.filter((word) => b.title.toLowerCase().includes(word))
              .length -
            words.filter((word) => a.title.toLowerCase().includes(word)).length,
        );
      return {
        jobs: matched.slice(0, 50),
        total: matched.length,
        scanned: jobs.length,
        fetched_at: fetchedAt,
        source: "Arbeitnow",
        coverage:
          "Latest Europe-focused provider batch; this is not a global or exhaustive job search.",
        mode: cached ? "cached_source" : "live",
        notice: cached
          ? "The provider could not be reached. Showing a real, dated source batch captured within the last 24 hours. Check availability on the original listing."
          : null,
      };
    },
    async get(id) {
      return (await load()).jobs.find((job) => job.id === id) || null;
    },
  };
}

module.exports = { createJobSource, plainText };
