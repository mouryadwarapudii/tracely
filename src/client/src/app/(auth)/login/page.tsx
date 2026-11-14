import Link from "next/link";
import { redirect } from "next/navigation";
import { userCount } from "@/lib/db";
import { signIn } from "../actions";
import { AuthForm } from "../form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default function LoginPage() {
  if (userCount() === 0) redirect("/signup");
  return (
    <>
      <h1 className="mb-1 text-[22px] font-bold tracking-tight">Sign in</h1>
      <p className="mb-6 text-ink-2">Use the account that set up this workspace.</p>
      <AuthForm
        action={signIn}
        submit="Sign in"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
      />
      <p className="mt-6 text-[13px] text-ink-3">First time here? <Link href="/signup" className="text-accent hover:underline">Create the owner account</Link></p>
    </>
  );
}
