const { test, after, before } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createApp } = require("../server/app.cjs");
const { createJobSource } = require("../server/jobs.cjs");
function testRepository() {
  const collections = new Map();
  function rows(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  }
  return {
    configured: true,
    health: async () => true,
    list: async (name, filters = {}) =>
      [...rows(name).values()].filter((row) =>
        Object.entries(filters).every(([key, value]) => row[key] === value),
      ),
    get: async (name, id) => rows(name).get(id) || null,
    put: async (name, payload, id = crypto.randomUUID()) => {
      const row = { ...payload, id };
      rows(name).set(id, row);
      return row;
    },
    remove: async (name, id) => {
      rows(name).delete(id);
    },
  };
}
const job = {
  id: "real-source-id",
  title: "Engineer",
  company: "Test employer",
  url: "https://www.arbeitnow.com/jobs/test",
  description: "Build applications with JavaScript.",
  source: "Arbeitnow",
  location: "Berlin",
  mode: "live",
};
const jobSource = {
  search: async () => ({
    jobs: [job],
    total: 1,
    scanned: 1,
    source: "Arbeitnow",
    mode: "live",
  }),
  get: async (id) => (id === job.id ? job : null),
};
let server, base;
before(async () => {
  server = createApp({
    env: { JWT_SECRET: "a".repeat(48), APP_URL: "https://resume.example" },
    repository: testRepository(),
    jobSource,
    draftGenerator: async (raw) => ({
      selected_lines: [
        raw.includes("INJECT_UNSUPPORTED")
          ? "Graduated Yale in 2020."
          : "Built applications using JavaScript.",
      ],
    }),
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
async function request(
  path,
  { cookie, body, method = "GET", headers = {} } = {},
) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function account(email) {
  const response = await request("/auth/register", {
    method: "POST",
    body: { email, password: "correct horse battery" },
  });
  assert.equal(response.status, 201);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(response.headers.get("set-cookie"), /SameSite=Lax/i);
  const result = await response.json();
  assert.equal(result.token, undefined);
  assert.equal(result.user.password_hash, undefined);
  return {
    cookie: response.headers.get("set-cookie").split(";")[0],
    user: result.user,
  };
}
test("anonymous real search works and protected profile rejects anonymous requests", async () => {
  const response = await request("/search");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).jobs[0].mode, "live");
  assert.equal((await request("/user/profile")).status, 401);
});
test("invalid credentials never become a demo login", async () => {
  await account("bad-login@example.test");
  const response = await request("/auth/login", {
    method: "POST",
    body: { email: "bad-login@example.test", password: "wrong password" },
  });
  assert.equal(response.status, 401);
  const result = await response.json();
  assert.equal(result.user, undefined);
  assert.equal(result.token, undefined);
});
test("profile editing cannot change account identity or create privileges", async () => {
  const a = await account("profile@example.test");
  await request("/user/profile", {
    cookie: a.cookie,
    method: "PUT",
    body: { name: "Candidate", email: "admin@example.test", role: "admin" },
  });
  const result = await (
    await request("/user/profile", { cookie: a.cookie })
  ).json();
  assert.equal(result.email, "profile@example.test");
  assert.equal(result.role, undefined);
});
test("resume is private, parsed from supplied text, and isolated between accounts", async () => {
  const a = await account("resume-a@example.test"),
    b = await account("resume-b@example.test");
  const data = new FormData();
  data.append(
    "resumeFile",
    new Blob([
      "Candidate\nBuilt applications using JavaScript.\nDesigned accessible interfaces.",
    ]),
    "resume.txt",
  );
  const response = await fetch(`${base}/api/resume/upload`, {
    method: "POST",
    headers: { Cookie: a.cookie },
    body: data,
  });
  assert.equal(response.status, 201);
  const { resumeId } = await response.json();
  const own = await (await request("/resumes", { cookie: a.cookie })).json();
  assert.equal(own.resumes.length, 1);
  assert.equal(own.resumes[0].raw_text, undefined);
  assert.equal(
    (await (await request("/resumes", { cookie: b.cookie })).json()).resumes
      .length,
    0,
  );
  assert.equal(
    (
      await request(`/resumes/${resumeId}`, {
        cookie: b.cookie,
        method: "DELETE",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/jobs/tailor", {
        cookie: b.cookie,
        method: "POST",
        body: { jobId: job.id, resumeId },
      })
    ).status,
    404,
  );
  const draft = await (
    await request("/jobs/tailor", {
      cookie: a.cookie,
      method: "POST",
      body: { jobId: job.id, resumeId },
    })
  ).json();
  assert.equal(
    draft.data.tailored_resume_text,
    "Built applications using JavaScript.",
  );
  assert.equal(draft.data.requires_review, true);
  assert.equal(
    (
      await request(`/resumes/${resumeId}`, {
        cookie: a.cookie,
        method: "DELETE",
      })
    ).status,
    200,
  );
});
test("invalid files and oversize uploads fail without claimed success", async () => {
  const a = await account("files@example.test");
  for (const [name, contents, status] of [
    ["not-a-pdf.pdf", "not a PDF", 400],
    ["code.exe", "arbitrary text", 400],
    ["huge.txt", "x".repeat(4 * 1024 * 1024 + 1), 413],
  ]) {
    const body = new FormData();
    body.append("resumeFile", new Blob([contents]), name);
    assert.equal(
      (
        await fetch(`${base}/api/resume/upload`, {
          method: "POST",
          headers: { Cookie: a.cookie },
          body,
        })
      ).status,
      status,
    );
  }
});
test("DOCX parsing uses the uploaded document rather than fabricated experience", async () => {
  const a = await account("docx@example.test");
  const body = new FormData();
  body.append(
    "resumeFile",
    new Blob([
      require("node:fs").readFileSync(
        require("node:path").join(__dirname, "fixtures/sample-resume.docx"),
      ),
    ]),
    "sample.docx",
  );
  const response = await fetch(`${base}/api/resume/upload`, {
    method: "POST",
    headers: { Cookie: a.cookie },
    body,
  });
  assert.equal(response.status, 201);
  const { resumeId } = await response.json();
  const draft = await (
    await request("/jobs/tailor", {
      cookie: a.cookie,
      method: "POST",
      body: { jobId: job.id, resumeId },
    })
  ).json();
  assert.match(
    draft.data.original_resume_text,
    /Designed accessible interfaces/,
  );
});
test("unsupported model-generated qualifications are rejected", async () => {
  const a = await account("guardrail@example.test");
  const body = new FormData();
  body.append(
    "resumeFile",
    new Blob([
      "Test candidate\nBuilt applications using JavaScript.\nINJECT_UNSUPPORTED",
    ]),
    "sample.txt",
  );
  const uploaded = await (
    await fetch(`${base}/api/resume/upload`, {
      method: "POST",
      headers: { Cookie: a.cookie },
      body,
    })
  ).json();
  const response = await request("/jobs/tailor", {
    cookie: a.cookie,
    method: "POST",
    body: { jobId: job.id, resumeId: uploaded.resumeId },
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).data, undefined);
});
test("tracking uses candidate-reported states and does not pretend an email was sent", async () => {
  const a = await account("tracker@example.test");
  await request("/applications", {
    cookie: a.cookie,
    method: "POST",
    body: { jobId: job.id, status: "Applied", emailSent: true },
  });
  await request("/applications", {
    cookie: a.cookie,
    method: "POST",
    body: { jobId: job.id, status: "Interview" },
  });
  const result = await (
    await request("/applications", { cookie: a.cookie })
  ).json();
  assert.equal(result.applications.length, 1);
  assert.equal(result.applications[0].email_sent, false);
  assert.equal(result.applications[0].job_title, job.title);
  const metrics = await (
    await request("/metrics", { cookie: a.cookie })
  ).json();
  assert.equal(metrics.interview_probability, null);
  assert.equal(metrics.confirmed_submissions, 0);
});
test("cross-origin writes fail and logout revokes the stored session", async () => {
  const a = await account("logout@example.test");
  assert.equal(
    (
      await request("/user/profile", {
        cookie: a.cookie,
        method: "PUT",
        body: { name: "Changed" },
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/auth/logout", {
        cookie: a.cookie,
        method: "POST",
        body: {},
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/user/profile", { cookie: a.cookie })).status,
    401,
  );
});
test("lead collection requires explicit consent", async () => {
  assert.equal(
    (
      await request("/leads", {
        method: "POST",
        body: { email: "lead@example.test" },
      })
    ).status,
    400,
  );
  const response = await request("/leads", {
    method: "POST",
    body: { email: "lead@example.test", consent: true },
  });
  assert.equal(response.status, 201);
  assert.match((await response.json()).message, /No job applications/);
});
test("missing infrastructure fails closed while public search remains available", async () => {
  const isolated = createApp({ env: {}, jobSource }).listen(0, "127.0.0.1");
  await new Promise((resolve) => isolated.once("listening", resolve));
  const url = `http://127.0.0.1:${isolated.address().port}`;
  try {
    assert.equal((await fetch(`${url}/api/health`)).status, 503);
    assert.equal((await fetch(`${url}/api/search`)).status, 200);
    const response = await fetch(`${url}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "never@example.test",
        password: "long enough password",
      }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).user, undefined);
  } finally {
    await new Promise((resolve) => isolated.close(resolve));
  }
});
test("source normalization retains provenance, strips HTML, and caches source fetches", async () => {
  let calls = 0;
  const source = createJobSource(async () => {
    calls++;
    return {
      ok: true,
      json: async () => ({
        data: [
          {
            slug: "one",
            title: "Engineer",
            company_name: "Test",
            url: "https://www.arbeitnow.com/jobs/one",
            description: "<script>bad</script><p>JavaScript engineer</p>",
            tags: [],
            location: "Berlin",
            remote: true,
            created_at: 1700000000,
          },
        ],
      }),
    };
  });
  const result = await source.search({ query: "JavaScript", remote: true });
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].salary, null);
  assert.equal(result.jobs[0].description, "JavaScript engineer");
  assert.equal(result.jobs[0].source, "Arbeitnow");
  await source.search({ query: "other" });
  assert.equal(calls, 1);
});
test("provider outage exposes a dated real-source cache and rejects an expired cache", async () => {
  const record = {
    slug: "captured-id",
    title: "Captured posting",
    company_name: "Source employer",
    url: "https://www.arbeitnow.com/jobs/captured-id",
    description: "Original description",
    tags: [],
    location: "Berlin",
    created_at: 1700000000,
  };
  const snapshot = { captured_at: new Date().toISOString(), data: [record] };
  const source = createJobSource(async () => {
    throw new Error("offline");
  }, snapshot);
  const result = await source.search();
  assert.equal(result.mode, "cached_source");
  assert.match(result.notice, /provider could not be reached/);
  assert.equal(result.jobs[0].title, record.title);
  assert.equal(result.fetched_at, snapshot.captured_at);
  const expired = createJobSource(
    async () => {
      throw new Error("offline");
    },
    { captured_at: "2000-01-01T00:00:00Z", data: [record] },
  );
  await assert.rejects(
    () => expired.search(),
    (error) => error.status === 502,
  );
});
