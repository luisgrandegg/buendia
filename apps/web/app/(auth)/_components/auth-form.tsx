"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/actions/auth";

interface AuthFormProps {
  title: string;
  submitLabel: string;
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  altPrompt: string;
  altHref: string;
  altLabel: string;
  defaultEmail?: string;
  invitationToken?: string;
}

const fieldStyle = {
  display: "block",
  width: "100%",
  padding: "0.5rem 0.75rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  fontSize: "1rem",
};

const labelStyle = {
  display: "block",
  fontSize: "0.875rem",
  marginBottom: "0.375rem",
};

export function AuthForm({
  title,
  submitLabel,
  action,
  altPrompt,
  altHref,
  altLabel,
  defaultEmail,
  invitationToken,
}: AuthFormProps) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, undefined);

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>{title}</h1>

      {invitationToken ? (
        <p
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1e3a8a",
            padding: "0.625rem 0.75rem",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
            marginBottom: "1rem",
          }}
        >
          You've been invited to a Buendia app. Sign in or sign up with the invited email to accept.
        </p>
      ) : null}

      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {invitationToken ? (
          <input type="hidden" name="invitation_token" value={invitationToken} />
        ) : null}
        <div>
          <label htmlFor="email" style={labelStyle}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={defaultEmail ?? ""}
            style={fieldStyle}
          />
        </div>

        <div>
          <label htmlFor="password" style={labelStyle}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
            style={fieldStyle}
          />
        </div>

        {state?.error ? (
          <p style={{ color: "#b91c1c", fontSize: "0.875rem", margin: 0 }}>{state.error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "0.375rem",
            border: "1px solid #111827",
            background: "#111827",
            color: "white",
            fontSize: "1rem",
            cursor: pending ? "not-allowed" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? "…" : submitLabel}
        </button>
      </form>

      <p style={{ marginTop: "1.25rem", fontSize: "0.875rem" }}>
        {altPrompt} <Link href={altHref}>{altLabel}</Link>
      </p>
    </div>
  );
}
