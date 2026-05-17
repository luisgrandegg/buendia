import { signUpAction } from "@/app/actions/auth";
import { AuthForm } from "../_components/auth-form";

export const metadata = { title: "Sign up · Buendia" };

interface PageProps {
  searchParams: Promise<{ invitation?: string; email?: string }>;
}

export default async function SignUpPage({ searchParams }: PageProps) {
  const { invitation, email } = await searchParams;
  const altHref = invitation
    ? `/signin?invitation=${encodeURIComponent(invitation)}${email ? `&email=${encodeURIComponent(email)}` : ""}`
    : "/signin";

  return (
    <AuthForm
      title="Create a Buendia account"
      submitLabel="Sign up"
      action={signUpAction}
      altPrompt="Already have an account?"
      altHref={altHref}
      altLabel="Sign in"
      defaultEmail={email}
      invitationToken={invitation}
    />
  );
}
