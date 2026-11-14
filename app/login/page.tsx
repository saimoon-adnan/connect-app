"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
import { createClient } from "../../lib/supabase/client";
import { NUB_UNIVERSITY_ID } from "../../lib/supabase/data";

type Mode = "signin" | "signup" | "confirm" | "reset" | "update";

async function ensureProfile(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (data) return;

  const displayName =
    (typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()) ||
    user.email?.split("@")[0] ||
    "CONNECT member";
  const department = typeof user.user_metadata?.department === "string" ? user.user_metadata.department.trim() : "";
  const studyYear = typeof user.user_metadata?.study_year === "string" ? user.user_metadata.study_year.trim() : "";
  const interests = Array.isArray(user.user_metadata?.interests)
    ? user.user_metadata.interests.filter((item): item is string => typeof item === "string").slice(0, 10)
    : [];
  const usernameBase = (user.email?.split("@")[0] || "connect_member")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 22);
  const { error: insertError } = await supabase.from("profiles").insert({
    auth_user_id: user.id,
    university_id: NUB_UNIVERSITY_ID,
    username: `${usernameBase}_${user.id.slice(0, 6)}`,
    display_name: displayName,
    department,
    study_year: studyYear,
    interests,
  });
  if (insertError) throw insertError;
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [studyYear, setStudyYear] = useState("");
  const [interests, setInterests] = useState("");
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const isRecovery = window.location.search.includes("type=recovery") || window.location.hash.includes("type=recovery");
    if (isRecovery) setMode("update");
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session || isRecovery) return;
      try {
        await ensureProfile(data.session.user);
        if (active) window.location.replace("/");
      } catch {
        if (active) setError("You’re signed in, but we couldn’t finish setting up your profile. Please try again.");
      }
    });
    return () => { active = false; };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    const supabase = createClient();

    try {
      if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
        if (resetError) throw resetError;
        setNotice("If an account exists for that email, a password reset link is on its way.");
        return;
      }

      if (mode === "update") {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        window.location.replace("/");
        return;
      }

      if (mode === "signup") {
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: name.trim(),
              department: department.trim(),
              study_year: studyYear,
              interests: interests.split(",").map(item => item.trim()).filter(Boolean).slice(0, 10),
            },
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });
        if (signupError) throw signupError;
        if (data.user && data.user.identities?.length === 0) {
          setMode("signin");
          setPassword("");
          setError("An account already exists with this email. Sign in or reset your password instead.");
          return;
        }
        if (data.session && data.user) {
          await ensureProfile(data.user);
          window.location.replace("/");
          return;
        }
        setPendingEmail(email);
        setMode("confirm");
        setNotice("");
        return;
      }

      const { data, error: signinError } = await supabase.auth.signInWithPassword({ email, password });
      if (signinError) throw signinError;
      await ensureProfile(data.user);
      window.location.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function resendConfirmation() {
    if (!pendingEmail) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const { error: resendError } = await createClient().auth.resend({
        type: "signup",
        email: pendingEmail,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (resendError) setError(resendError.message);
      else setNotice(`A new confirmation link was sent to ${pendingEmail}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resend the confirmation email.");
    } finally {
      setPending(false);
    }
  }

  const title = mode === "signup" ? "Find your people." : mode === "confirm" ? "Check your inbox." : mode === "reset" ? "Reset your password." : mode === "update" ? "Choose a new password." : "Welcome back.";
  const subtitle = mode === "signup"
    ? "Create your account and connect with your campus."
    : mode === "confirm"
      ? "Confirm your email to finish creating your CONNECT account."
    : mode === "reset"
      ? "We’ll email you a link to get back into your account."
      : mode === "update"
        ? "Set a new password for your CONNECT account."
      : "Sign in to pick up where your community left off.";

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />
      <header className="auth-topbar">
        <Link href="/" className="auth-brand"><img src="/connect-mark-light.svg" alt=""/><span>connect<span>.</span></span></Link>
        <Link href="/" className="auth-back"><ArrowLeft size={15}/> Back to CONNECT</Link>
      </header>
      <section className="auth-card">
        <div className="auth-card-mark"><img src="/connect-mark-light.svg" alt=""/></div>
        <div className="auth-kicker">YOUR CAMPUS. YOUR NETWORK. YOUR FUTURE.</div>
        <h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>

        {(mode === "signin" || mode === "signup") && (
          <div className="auth-mode-switch" role="tablist" aria-label="Account type">
            <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>Create account</button>
          </div>
        )}

        {mode === "confirm" ? (
          <div className="auth-confirm-panel">
            <div className="auth-confirm-icon"><Mail size={22}/></div>
            <h2>We sent a link to</h2>
            <strong>{pendingEmail}</strong>
            <p>Open the confirmation email and click its link. CONNECT will finish signing you in automatically.</p>
            {error && <div className="auth-message auth-error" role="alert">{error}</div>}
            {notice && <div className="auth-message auth-notice" role="status"><CheckCircle2 size={17}/><span>{notice}</span></div>}
            <button className="auth-submit" type="button" disabled={pending} onClick={resendConfirmation}>{pending ? "Sending…" : "Resend confirmation link"}</button>
            <button className="auth-back-signin" type="button" onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>Back to sign in</button>
          </div>
        ) : <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label className="auth-field"><span>Your name</span><div><UserRound size={17}/><input autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Alex Rahman" required minLength={2}/></div></label>
          )}
          {mode === "signup" && <>
            <label className="auth-field"><span>University</span><div><input value="Northern University Bangladesh" readOnly aria-label="University"/></div></label>
            <label className="auth-field"><span>Department</span><div><input autoComplete="organization-title" value={department} onChange={event => setDepartment(event.target.value)} placeholder="e.g. Computer Science and Engineering" required minLength={2}/></div></label>
            <label className="auth-field"><span>Study year</span><div><select value={studyYear} onChange={event => setStudyYear(event.target.value)} required aria-label="Study year"><option value="">Select your current year</option><option>1st year</option><option>2nd year</option><option>3rd year</option><option>4th year</option><option>Graduate</option><option>Alumni</option></select></div></label>
            <label className="auth-field"><span>Interests <small>(comma separated)</small></span><div><input value={interests} onChange={event => setInterests(event.target.value)} placeholder="e.g. AI, design, entrepreneurship" required/></div></label>
          </>}
          <label className="auth-field"><span>Email address</span><div><Mail size={17}/><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@university.edu" required/></div></label>
          {mode !== "reset" && (
            <label className="auth-field"><span>Password</span><div><LockKeyhole size={17}/><input type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
          )}
          {mode === "signin" && <button className="auth-forgot" type="button" onClick={() => { setMode("reset"); setError(""); setNotice(""); }}>Forgot password?</button>}
          {error && <div className="auth-message auth-error" role="alert">{error}</div>}
          {notice && <div className="auth-message auth-notice" role="status"><CheckCircle2 size={17}/><span>{notice}</span></div>}
          <button className="auth-submit" type="submit" disabled={pending}>
            {pending ? <><LoaderCircle className="auth-spinner" size={17}/> Please wait…</> : <>{mode === "signup" ? "Create your account" : mode === "reset" ? "Send reset link" : mode === "update" ? "Update password" : "Sign in"}<KeyRound size={16}/></>}
          </button>
        </form>}
        {mode === "reset" && <button className="auth-back-signin" type="button" onClick={() => { setMode("signin"); setError(""); setNotice(""); }}><ArrowLeft size={14}/> Back to sign in</button>}
        <div className="auth-footnote"><LockKeyhole size={13}/> Your account is secured by CONNECT and Supabase Auth.</div>
      </section>
      <footer className="auth-footer"><span>© CONNECT</span><span>Built around your university community.</span></footer>
    </main>
  );
}
