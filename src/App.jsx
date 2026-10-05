import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FileText,
  Search,
  Smartphone,
  X,
} from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { api } from "./services/api";
import "./App.css";

function AppContent() {
  const { user, login, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [register, setRegister] = useState(false);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState(false);
  const [results, setResults] = useState(null);
  const [resumes, setResumes] = useState([]);
  const [selectedResume, setSelectedResume] = useState("");
  const [applications, setApplications] = useState([]);
  const [draft, setDraft] = useState(null);
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [textDemo, setTextDemo] = useState(false);
  const [message, setMessage] = useState("JOBS engineer");
  const searchController = useRef();
  const dialogRef = useRef();
  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setHealth({ status: "unavailable" }));
  }, []);
  useEffect(() => {
    let active = true;
    if (user)
      Promise.all([api.getResumes(), api.getApplications()])
        .then(([r, a]) => {
          if (active) {
            setResumes(r.resumes);
            setApplications(a.applications);
            setSelectedResume(r.resumes[0]?.id || "");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    else {
      setResumes([]);
      setApplications([]);
      setDraft(null);
    }
    return () => {
      active = false;
    };
  }, [user]);
  useEffect(() => {
    if (!(authOpen || draft || textDemo)) return;
    const previous = document.activeElement;
    dialogRef.current?.focus();
    function key(event) {
      if (event.key === "Escape") {
        setAuthOpen(false);
        setDraft(null);
        setTextDemo(false);
      }
      if (event.key === "Tab") {
        const elements = dialogRef.current?.querySelectorAll(
          "button:not([disabled]),input,select,a[href],textarea",
        );
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [authOpen, draft, textDemo]);
  async function action(name, fn) {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  async function search(event) {
    event?.preventDefault();
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    await action("search", async () => {
      const data = await api.search(
        { query, location, remote },
        controller.signal,
      );
      if (!controller.signal.aborted) setResults(data);
    });
  }
  async function authenticate(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    await action("auth", async () => {
      const data = register
        ? await api.register(fields)
        : await api.login(fields.email, fields.password);
      login(data.user);
      setAuthOpen(false);
    });
  }
  async function upload(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await action("upload", async () => {
      const saved = await api.uploadResume(data);
      const r = await api.getResumes();
      setResumes(r.resumes);
      setSelectedResume(saved.resumeId);
      setNotice("Your resume was saved privately.");
    });
  }
  async function save(job) {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    await action(job.id, async () => {
      await api.logApplication({ jobId: job.id, status: "Saved" });
      setApplications((await api.getApplications()).applications);
      setNotice("Job saved to your tracker.");
    });
  }
  function download() {
    const blob = new Blob([draft.tailored_resume_text], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reviewed-resume-draft.md";
    link.click();
    URL.revokeObjectURL(url);
  }
  const modal = authOpen || draft || textDemo;
  return (
    <>
      <div inert={modal ? true : undefined}>
        <nav className="topbar">
          <a className="wordmark" href="/">
            resume<span>.ai</span>
            <span className="brand-dot" />
          </a>
          <div className="nav-actions">
            <a href="#jobs">Find jobs</a>
            {user ? (
              <button
                className="quiet-button"
                onClick={() => action("logout", logout)}
              >
                Sign out
              </button>
            ) : (
              <button
                className="quiet-button"
                onClick={() => {
                  setAuthOpen(true);
                  setRegister(false);
                }}
              >
                Sign in <ArrowUpRight size={16} />
              </button>
            )}
          </div>
        </nav>
        <main>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="status-dot" /> A clearer next step
              </div>
              <h1>
                Your experience.
                <br />
                Your next <span>opportunity.</span>
              </h1>
              <p>
                Find real openings. Build an application from what you've
                actually done. Keep control of every step.
              </p>
              <div className="hero-actions">
                <a href="#jobs" className="primary-button">
                  Explore jobs <ArrowRight size={18} />
                </a>
                <button
                  className="secondary-button"
                  onClick={() => setTextDemo(true)}
                >
                  <Smartphone size={18} /> Try the text prototype
                </button>
              </div>
              <div className="hero-note">
                <Check size={15} /> Browse without an account <span>·</span>{" "}
                Sources on every result
              </div>
            </div>
            <div className="workflow-card">
              <div className="card-topline">
                <span>YOUR APPLICATION WORKSPACE</span>
                <FileText size={18} />
              </div>
              <h2>
                Make your next move
                <br />a considered one.
              </h2>
              {[
                [
                  "01",
                  "Find a relevant opening",
                  "Real listing. Original source.",
                ],
                [
                  "02",
                  "Select your experience",
                  "Private resume. Traceable evidence.",
                ],
                [
                  "03",
                  "Review, then apply",
                  "You decide what leaves your workspace.",
                ],
              ].map(([n, title, body]) => (
                <div className="workflow-step" key={n}>
                  <span>{n}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{body}</p>
                  </div>
                  <ArrowUpRight size={19} />
                </div>
              ))}
              <div className="card-foot">
                No invented credentials. No automatic applications.
              </div>
            </div>
          </section>
          <div className="feedback" aria-live="polite">
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {notice && <p className="notice">{notice}</p>}
          </div>
          {user && (
            <section className="workspace">
              <div>
                <div className="eyebrow">Private workspace</div>
                <h2>Your resume, ready for review.</h2>
                <p>
                  PDF, DOCX, TXT, or Markdown. Maximum 4 MB. Your original text
                  stays intact.
                </p>
                <form className="upload-form" onSubmit={upload}>
                  <label className="file-label">
                    Choose a resume
                    <input
                      required
                      type="file"
                      name="resumeFile"
                      accept=".pdf,.docx,.txt,.md"
                    />
                  </label>
                  <button className="secondary-button" disabled={Boolean(busy)}>
                    {busy === "upload" ? "Saving…" : "Upload privately"}
                  </button>
                </form>
              </div>
              <div>
                <label htmlFor="resume-choice">Resume for drafting</label>
                <select
                  id="resume-choice"
                  value={selectedResume}
                  onChange={(e) => setSelectedResume(e.target.value)}
                >
                  <option value="">Choose a saved resume</option>
                  {resumes.map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.filename}
                    </option>
                  ))}
                </select>
                {selectedResume && (
                  <button
                    className="text-button"
                    onClick={() =>
                      action("delete", async () => {
                        await api.deleteResume(selectedResume);
                        const r = await api.getResumes();
                        setResumes(r.resumes);
                        setSelectedResume(r.resumes[0]?.id || "");
                      })
                    }
                  >
                    Delete this saved resume
                  </button>
                )}
                <p className="small">
                  Drafts select original resume lines. Review the full context
                  before sending an application.
                </p>
              </div>
            </section>
          )}
          <section id="jobs" className="jobs-section">
            <div className="section-heading">
              <div>
                <div className="eyebrow">The search starts here</div>
                <h2>Openings with a source.</h2>
              </div>
              <span className="source-badge">Arbeitnow · Europe-focused</span>
            </div>
            <p className="section-intro">
              Search the provider's latest batch. Remote roles may still have
              country restrictions. Salary appears only when supplied by the
              source.
            </p>
            <form className="search-form" onSubmit={search}>
              <label>
                Role or keyword
                <div className="input-with-icon">
                  <Search size={18} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Designer, engineer, marketing…"
                    maxLength={80}
                  />
                </div>
              </label>
              <label>
                Location
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Any listed location"
                  maxLength={80}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={remote}
                  onChange={(e) => setRemote(e.target.checked)}
                />{" "}
                Remote only
              </label>
              <button className="primary-button" disabled={busy === "search"}>
                {busy === "search" ? "Searching…" : "Search jobs"}
                <ArrowRight size={17} />
              </button>
            </form>
            {!results ? (
              <div className="empty-state">
                <Search size={28} />
                <h3>Start with a role you're interested in.</h3>
                <p>
                  Live results will appear here. Nothing is seeded or presented
                  as a match before you search.
                </p>
              </div>
            ) : (
              <>
                {results.notice && <p className="notice">{results.notice}</p>}
                <div className="results-info">
                  <strong>
                    {results.total} matching{" "}
                    {results.total === 1 ? "opening" : "openings"} · showing{" "}
                    {results.jobs.length}
                  </strong>
                  <span>
                    Retrieved {new Date(results.fetched_at).toLocaleString()}
                  </span>
                </div>
                {!results.jobs.length && (
                  <div className="empty-state">
                    <h3>No matches in this batch.</h3>
                    <p>Try a broader keyword or remove the location filter.</p>
                  </div>
                )}
                <div className="job-grid">
                  {results.jobs.map((job) => (
                    <article className="job-card" key={job.id}>
                      <div className="job-card-top">
                        <span>{job.company}</span>
                        {job.remote && <span className="tag">Remote</span>}
                      </div>
                      <h3>{job.title}</h3>
                      <p className="job-location">{job.location}</p>
                      <p className="job-description">
                        {job.description.slice(0, 210)}…
                      </p>
                      <div className="job-meta">
                        <span>{job.salary || "Salary not listed"}</span>
                        <span>
                          Posted{" "}
                          {job.posted_at
                            ? new Date(job.posted_at).toLocaleDateString()
                            : "date unavailable"}
                        </span>
                      </div>
                      <div className="job-actions">
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View on Arbeitnow <ArrowUpRight size={15} />
                        </a>
                        <button
                          disabled={Boolean(busy)}
                          onClick={() => save(job)}
                        >
                          Save
                        </button>
                        {user && selectedResume && (
                          <button
                            disabled={Boolean(busy)}
                            onClick={() =>
                              action(job.id, async () =>
                                setDraft(
                                  (await api.tailorJob(job.id, selectedResume))
                                    .data,
                                ),
                              )
                            }
                          >
                            Draft
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                <p className="small">
                  {results.coverage} Visiting a listing does not confirm an
                  application submission.
                </p>
              </>
            )}
          </section>
          {user && (
            <section className="tracker">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">Your progress</div>
                  <h2>A record you can trust.</h2>
                </div>
                <span>{applications.length} tracked jobs</span>
              </div>
              <p className="small">
                These statuses are maintained by you. No employer submission or
                interview probability is inferred.
              </p>
              {!applications.length ? (
                <p className="empty-state">
                  Save an opening to begin tracking.
                </p>
              ) : (
                <div className="tracker-list">
                  {applications.map((a) => (
                    <div className="tracker-row" key={a.id}>
                      <div>
                        <strong>{a.job_title}</strong>
                        <span>{a.company_name}</span>
                      </div>
                      <a
                        href={a.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Source <ArrowUpRight size={14} />
                      </a>
                      <select
                        aria-label={`Status for ${a.job_title}`}
                        value={a.application_status}
                        disabled={Boolean(busy)}
                        onChange={(e) =>
                          action(a.id, async () => {
                            await api.updateApplication(a.id, e.target.value);
                            setApplications(
                              (await api.getApplications()).applications,
                            );
                          })
                        }
                      >
                        {[
                          "Saved",
                          "User-reported applied",
                          "Interview",
                          "Offer",
                          "Closed",
                        ].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          <section className="signup-section">
            <div>
              <div className="eyebrow">Built in the open</div>
              <h2>Follow the next release.</h2>
              <p>
                Get updates about phone access and new job sources. Searching
                jobs never requires an email.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fields = Object.fromEntries(
                  new FormData(e.currentTarget),
                );
                action("lead", async () => {
                  const data = await api.submitLead({
                    email: fields.email,
                    consent: fields.consent === "on",
                  });
                  setNotice(data.message);
                });
              }}
            >
              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="you@example.com"
                />
              </label>
              <label className="check-label">
                <input type="checkbox" name="consent" required /> Email me
                launch updates. I can unsubscribe at any time.
              </label>
              <button className="secondary-button" disabled={Boolean(busy)}>
                Keep me updated <ArrowRight size={16} />
              </button>
            </form>
          </section>
        </main>
        <footer>
          <a className="wordmark" href="/">
            resume<span>.ai</span>
          </a>
          <span>Built by KJ Cornish · 2026</span>
          <span>
            Service: {health?.status || "checking"}
            {health?.checks?.database === false
              ? " · accounts awaiting database connection"
              : ""}
          </span>
        </footer>
      </div>
      {modal && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={
              authOpen
                ? "Account access"
                : draft
                  ? "Review resume draft"
                  : "Text prototype"
            }
            tabIndex={-1}
            ref={dialogRef}
            className={`modal ${draft ? "wide-modal" : ""}`}
          >
            <button
              className="close-button"
              aria-label="Close dialog"
              onClick={() => {
                setAuthOpen(false);
                setDraft(null);
                setTextDemo(false);
              }}
            >
              <X size={22} />
            </button>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {authOpen && (
              <>
                <div className="eyebrow">Your private workspace</div>
                <h2>{register ? "Create your account" : "Welcome back."}</h2>
                <p>Save your resume and track the roles that matter to you.</p>
                <form onSubmit={authenticate}>
                  <label>
                    Email
                    <input
                      type="email"
                      name="email"
                      autoComplete="email"
                      required
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      name="password"
                      minLength={register ? 12 : 1}
                      maxLength={72}
                      autoComplete={
                        register ? "new-password" : "current-password"
                      }
                      required
                    />
                  </label>
                  {register && (
                    <p className="small">
                      Use at least 12 characters. Unicode passwords must fit
                      within 72 bytes.
                    </p>
                  )}
                  <button className="primary-button" disabled={Boolean(busy)}>
                    {busy === "auth"
                      ? "Connecting…"
                      : register
                        ? "Create account"
                        : "Sign in"}
                    <ArrowRight size={17} />
                  </button>
                </form>
                <button
                  className="text-button"
                  onClick={() => {
                    setRegister(!register);
                    setError("");
                  }}
                >
                  {register
                    ? "Already have an account? Sign in"
                    : "New here? Create an account"}
                </button>
              </>
            )}
            {draft && (
              <>
                <div className="eyebrow">Review before applying</div>
                <h2>{draft.job.title}</h2>
                <p>
                  Only exact lines from your original resume were selected. No
                  application or message has been sent.
                </p>
                <div className="draft-columns">
                  <div>
                    <h3>Original resume</h3>
                    <pre>{draft.original_resume_text}</pre>
                  </div>
                  <div>
                    <h3>Selected experience</h3>
                    <pre>{draft.tailored_resume_text}</pre>
                  </div>
                </div>
                <div className="hero-actions">
                  <button className="primary-button" onClick={download}>
                    Download draft
                  </button>
                  <a
                    className="secondary-button"
                    href={draft.job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open application page <ArrowUpRight size={16} />
                  </a>
                </div>
              </>
            )}
            {textDemo && (
              <>
                <div className="eyebrow">Phone workflow prototype</div>
                <h2>Start with a text.</h2>
                <p>
                  This browser prototype searches real listings. It sends no
                  SMS, collects no phone number, and submits no applications. A
                  live carrier number is not connected yet.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const role = message.replace(/^JOBS\s*/i, "").trim();
                    action("text", async () => {
                      const data = await api.search({ query: role });
                      setResults(data);
                      setQuery(role);
                      setTextDemo(false);
                      document
                        .getElementById("jobs")
                        ?.scrollIntoView({ behavior: "smooth" });
                    });
                  }}
                >
                  <label>
                    Your message
                    <input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      maxLength={85}
                      required
                    />
                  </label>
                  <p className="small">
                    Try “JOBS designer” or “JOBS engineer”.
                  </p>
                  <button className="primary-button" disabled={Boolean(busy)}>
                    Find live jobs <ArrowRight size={17} />
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
