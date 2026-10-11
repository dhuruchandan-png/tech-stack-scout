import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createProperties } from "../src/lib/hubspot";

/** One-time: creates the "tech_stack_scout" property group and the tss_* company properties. Same as Settings → Create HubSpot properties. */
createProperties().then((r) => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.errors.length ? 1 : 0);
});
