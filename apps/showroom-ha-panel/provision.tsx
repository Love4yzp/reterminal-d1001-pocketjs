import { mount } from "@pocketjs/framework/solid";
import { Text, View } from "@pocketjs/framework/solid/components";
import { readLocalHaConfig, serializeLocalHaConfig, writeLocalHaConfig } from "./ha-local";
import { SEED_CONFIG_JSON, SEED_ID } from "./seed";
import { theme } from "./theme";

function Provision() {
  let message = "Verified. Install the normal showroom panel.";
  try {
    if (!SEED_CONFIG_JSON) throw new Error("missing seed");
    const expected = serializeLocalHaConfig(JSON.parse(SEED_CONFIG_JSON));
    const bytes = writeLocalHaConfig(SEED_CONFIG_JSON);
    const verified = readLocalHaConfig();
    if (!verified || verified.configError) throw new Error("readback failed");
    const actual = serializeLocalHaConfig({
      version: 1,
      baseUrl: verified.baseUrl,
      token: verified.token,
      lightEntityId: verified.lightEntityId,
      weatherEntityId: verified.weatherEntityId,
      entityMap: verified.entityMap,
    });
    if (actual !== expected) throw new Error("readback mismatch");
    console.log(`[showroom-ha-panel-provision] verified slot-local readback: ${bytes} bytes id=${SEED_ID}`);
  } catch (error) {
    message = "Write failed. Check the seed and storage.";
    console.error(`[showroom-ha-panel-provision] ${error instanceof Error ? error.message : String(error)}`);
  }
  return (
    <View class="relative" style={{ width: 400, height: 640, bgColor: theme.page }}>
      <Text class="absolute text-2xl font-bold" style={{ insetL: 24, insetT: 48, width: 350, textColor: theme.text }}>HA local setup</Text>
      <Text class="absolute text-sm" style={{ insetL: 24, insetT: 108, width: 350, textColor: theme.secondaryText }}>{message}</Text>
      <Text class="absolute text-xs" style={{ insetL: 24, insetT: 156, width: 350, textColor: theme.disabledText }}>Storage is preserved. Secrets are not shown.</Text>
    </View>
  );
}

mount(() => <Provision />);
