import { signInAction } from "@/app/actions/auth";
import { AuthForm } from "../_components/auth-form";

export const metadata = { title: "Sign in · Buendia" };

interface PageProps {
  searchParams: Promise<{ invitation?: string; email?: string; next?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const { invitation, email } = await searchParams;
  const altHref = invitation
    ? `/signup?invitation=${encodeURIComponent(invitation)}${email ? `&email=${encodeURIComponent(email)}` : ""}`
    : "/signup";

  return (
    <AuthForm
      title="Sign in to Buendia"
      submitLabel="Sign in"
      action={signInAction}
      altPrompt="No account yet?"
      altHref={altHref}
      altLabel="Create one"
      defaultEmail={email}
      invitationToken={invitation}
    />
  );
}
