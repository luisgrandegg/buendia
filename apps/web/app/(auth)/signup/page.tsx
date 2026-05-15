import { signUpAction } from "@/app/actions/auth";
import { AuthForm } from "../_components/auth-form";

export const metadata = { title: "Sign up · Buendia" };

export default function SignUpPage() {
  return (
    <AuthForm
      title="Create a Buendia account"
      submitLabel="Sign up"
      action={signUpAction}
      altPrompt="Already have an account?"
      altHref="/signin"
      altLabel="Sign in"
    />
  );
}
