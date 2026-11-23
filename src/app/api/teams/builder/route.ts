import { NextRequest } from "next/server";
import { buildTeamRecommendation } from "@/lib/matching/builder";
import { fail, ok, requireUser } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    const anonRl = rateLimit(req, { key: "team-builder-anonymous", limit: 20, windowMs: 60_000 });
    if (!anonRl.ok) return tooManyRequests(anonRl.retryAfterSec);
    return fail("Unauthorized", 401);
  }
  const rl = rateLimit(req, {
    key: "team-builder-user",
    identifier: user.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  const slug = req.nextUrl.searchParams.get("hackathon")?.trim();
  if (!slug) return fail("hackathon is required");
  const [hackathon] = await db
    .select({ id: schema.hackathons.id, status: schema.hackathons.status })
    .from(schema.hackathons)
    .where(eq(schema.hackathons.slug, slug))
    .limit(1);
  if (!hackathon) return fail("Hackathon not found", 404);
  if (hackathon.status === "completed") return fail("Hackathon has ended", 409);

  const result = await buildTeamRecommendation(user.id, slug);
  if (!result) return fail("You need an active profile, must be open to opportunities, and cannot already be on a team for this hackathon.", 409);
  return ok(result);
}
