/**
 * Smoke test: creates a completed job in a workspace/project so it appears in /documents.
 * Usage:
 *   SMOKE_EMAIL="test@voxdrop.live" npx tsx scripts/smoke-workspace-documents.ts
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createJob, updateJob } from "../server/queue";
import { getUserByEmail, getOrCreateDefaultWorkspaceForUser, createWorkspaceProject } from "../server/db/queries";

const email = (process.env.SMOKE_EMAIL || "test@voxdrop.live").trim().toLowerCase();

const user = getUserByEmail(email);
if (!user) {
  console.error(`❌ Nutzer ${email} nicht gefunden. Bitte zuerst einen Account anlegen.`);
  process.exit(1);
}

const workspace = getOrCreateDefaultWorkspaceForUser(user);
const project = createWorkspaceProject(
  workspace.id,
  `Smoke Test ${new Date().toLocaleDateString("de-DE")}`,
  user.id
);

const jobId = crypto.randomUUID();
const outputDir = path.join(process.cwd(), "uploads", "smoke-tests");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `${jobId}.txt`);
fs.writeFileSync(outputPath, "VoxDrop Smoke Test", "utf-8");

createJob({
  id: jobId,
  queue: "smoke-test",
  userId: user.id,
  workspaceId: workspace.id,
  projectId: project.id,
  storageScope: "workspace",
  inputData: {
    originalName: "smoke-test.txt",
  },
  expiresInHours: 1,
});

updateJob(jobId, {
  status: "completed",
  resultFilePath: outputPath,
  completedAt: new Date(),
});

console.log("✅ Smoke-Test erstellt.");
console.log(`Workspace: ${workspace.name} (${workspace.id})`);
console.log(`Projekt: ${project.name} (${project.id})`);
console.log(`Job: ${jobId}`);
console.log("Öffne /documents und wähle den Workspace + Projekt, um das Ergebnis zu sehen.");
