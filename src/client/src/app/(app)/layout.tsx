import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { environments } from "@/lib/queries";
import { Shell } from "@/components/shell";
import { signOut } from "../(auth)/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, project } = await requireSession();
  const envs = await environments(project.id).catch(() => [] as string[]);
  return (
    <Suspense>
      <Shell user={{ name: user.name, email: user.email }} environments={envs} signOut={signOut}>
        {children}
      </Shell>
    </Suspense>
  );
}
