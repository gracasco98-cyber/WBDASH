// seed-admin.ts — Bootstrap the initial MASTER account.
// Run automatically by entrypoint.sh on every start (idempotent).
// Can also be run manually: npm run seed:admin
import { prisma } from "./db";
import bcrypt from "bcryptjs";

async function seedAdmin(): Promise<void> {
  const email    = process.env.MASTER_EMAIL?.toLowerCase().trim();
  const password = process.env.MASTER_PASSWORD;

  if (!email || !password) {
    console.warn(
      "[seed-admin] MASTER_EMAIL or MASTER_PASSWORD not set — skipping master account creation."
    );
    await prisma.$disconnect();
    return;
  }

  if (password.length < 8) {
    console.error("[seed-admin] MASTER_PASSWORD must be at least 8 characters.");
    await prisma.$disconnect();
    process.exit(1);
  }

  // Check if any master already exists with this email
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Ensure the existing account has master role (in case it was downgraded accidentally)
    if (existing.role !== "master") {
      await prisma.user.update({ where: { email }, data: { role: "master", isActive: true } });
      console.log(`[seed-admin] Promoted existing user "${email}" to master.`);
    } else {
      console.log(`[seed-admin] Master account "${email}" already exists — skipping.`);
    }
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: { email, passwordHash, role: "master", isActive: true },
  });

  console.log(`[seed-admin] Master account created: ${email}`);
  await prisma.$disconnect();
}

seedAdmin().catch((err) => {
  console.error("[seed-admin] Fatal error:", err);
  process.exit(1);
});
