import { redirect } from "next/navigation";
import { userCount } from "@/lib/db";
import { signUp } from "../actions";
import { AuthForm } from "../form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up" };

export default function SignupPage() {
  if (userCount() > 0) redirect("/login");
  return (
    <>
      <h1 className="mb-1 text-[22px] font-bold tracking-tight">Set up your workspace</h1>
      <p className="mb-6 text-ink-2">Create the owner account. It stays on this server.</p>
      <AuthForm
        action={signUp}
        submit="Create account"
        fields={[
          { name: "name", label: "Name", type: "text", autoComplete: "name" },
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 10 characters." },
        ]}
      />
    </>
  );
}
