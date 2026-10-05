// Makes existing branch PINs viewable in Admin -> Settings.
//
// PINs set before viewable PINs existed are stored only as hashes. Branch PINs are 4 digits and
// each credential keeps an HMAC lookup (keyed by BRANCH_PIN_LOOKUP_SECRET), so the server can
// recompute the 10,000 possibilities and find the match. Nothing is reset or changed: the PIN
// still works exactly as before, it just also gets an encrypted copy.
//
//   npm run db:recover-pins
import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PinVaultService } from "../src/common/security/pin-vault.service.js";

const connectionString = process.env.DATABASE_URL;
const lookupSecret = process.env.BRANCH_PIN_LOOKUP_SECRET;
if (!connectionString) throw new Error("DATABASE_URL environment variable is not set");
if (!lookupSecret) throw new Error("BRANCH_PIN_LOOKUP_SECRET environment variable is not set");

const pool = new pg.Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const vault = new PinVaultService({ get: (k: string) => process.env[k] } as never);

const byLookup = new Map<string, string>();
for (let i = 0; i < 10_000; i++) {
  const pin = String(i).padStart(4, "0");
  byLookup.set(crypto.createHmac("sha256", lookupSecret).update(pin).digest("hex"), pin);
}

async function main() {
  const creds = await prisma.branchRoleCredential.findMany({
    where: { pinEncrypted: null },
    include: { branch: true, role: true },
  });
  let recovered = 0;
  for (const c of creds) {
    const pin = byLookup.get(c.pinLookup);
    if (!pin) {
      console.warn(`! ${c.branch.name} ${c.role.name}: no 4-digit match (left as is)`);
      continue;
    }
    await prisma.branchRoleCredential.update({
      where: { id: c.id },
      data: { pinEncrypted: vault.encrypt(pin) },
    });
    recovered++;
    console.log(`${c.branch.name} ${c.role.name}: PIN is now viewable`);
  }
  console.log(`Done. ${recovered} of ${creds.length} credentials updated.`);
}

main()
  .catch((e) => {
    console.error("PIN recovery failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
