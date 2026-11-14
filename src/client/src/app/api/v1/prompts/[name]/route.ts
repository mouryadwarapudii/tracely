import { projectFromRequest } from "@/lib/apikey";
import { promptByName, promptVersions } from "@/lib/db";

/** Fetch a prompt for use at runtime. `?version=N` pins a version; the default is the latest. */
export async function GET(request: Request, ctx: { params: Promise<{ name: string }> }) {
  const projectId = projectFromRequest(request);
  if (!projectId) return Response.json({ error: "Missing or invalid API key." }, { status: 401 });
  const { name } = await ctx.params;
  const prompt = promptByName(projectId, decodeURIComponent(name));
  if (!prompt) return Response.json({ error: `No prompt named '${name}'.` }, { status: 404 });
  const versions = promptVersions(prompt.id);
  const wanted = new URL(request.url).searchParams.get("version");
  const version = wanted ? versions.find((v) => v.version === Number(wanted)) : versions[0];
  if (!version) return Response.json({ error: `Prompt '${name}' has no version ${wanted}.` }, { status: 404 });
  const variables = [...new Set([...version.template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))];
  return Response.json({ name: prompt.name, version: version.version, template: version.template, model: version.model, variables });
}
