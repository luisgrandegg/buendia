import { signInAction } from "@/app/actions/auth";
import { AuthForm } from "../_components/auth-form";

export const metadata = { title: "Sign in · Buendia" };

export default function SignInPage() {
  return (
    <AuthForm
      title="Sign in to Buendia"
      submitLabel="Sign in"
      action={signInAction}
      altPrompt="No account yet?"
      altHref="/signup"
      altLabel="Create one"
    />
  );
}
