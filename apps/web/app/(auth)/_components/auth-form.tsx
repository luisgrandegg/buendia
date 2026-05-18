"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/actions/auth";
import { Alert, Button, Card, Heading, Input, Stack, Text, colors, space } from "@/lib/ui";

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
    <Card padding="roomy">
      <Stack gap={6}>
        <Heading level={2}>{title}</Heading>

        {invitationToken ? (
          <Alert tone="info">
            You've been invited to a Buendia app. Sign in or sign up with the invited email to
            accept.
          </Alert>
        ) : null}

        <form action={formAction}>
          <Stack gap={5}>
            {invitationToken ? (
              <input type="hidden" name="invitation_token" value={invitationToken} />
            ) : null}

            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              label="Email"
              defaultValue={defaultEmail ?? ""}
            />

            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
              label="Password"
            />

            {state?.error ? (
              <Text size="sm" tone="danger" style={{ margin: 0 }}>
                {state.error}
              </Text>
            ) : null}

            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "…" : submitLabel}
            </Button>
          </Stack>
        </form>

        <Text size="sm" tone="muted" style={{ marginTop: space[2] }}>
          {altPrompt}{" "}
          <Link href={altHref} style={{ color: colors.textAccent }}>
            {altLabel}
          </Link>
        </Text>
      </Stack>
    </Card>
  );
}
