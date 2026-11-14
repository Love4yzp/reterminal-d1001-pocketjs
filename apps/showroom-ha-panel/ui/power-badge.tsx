import { Text, View } from "@pocketjs/framework/solid/components";
import type { LayoutBox } from "../home-layout";
import { pick, type Language } from "../i18n";
import {
  formatBatteryPercent,
  powerShortLabel,
  powerStatusLabel,
  type PowerInfo,
} from "../native";
import { theme } from "../theme";

function powerAccent(power: PowerInfo): number {
  if (!power.available) return theme.disabledText;
  if (power.chargeState === "charging") return theme.green;
  if (power.chargeState === "inconsistent") return theme.danger;
  if (power.chargeState === "usb_idle") return theme.primary;
  if (power.batteryPercent !== null && power.batteryPercent <= 20) return theme.danger;
  return theme.text;
}

function BatteryGlyph(props: { power: PowerInfo; left: number; top: number }) {
  const bodyWidth = 18;
  const bodyHeight = 10;
  const innerMax = 14;
  const percent = () => props.power.batteryPercent ?? 0;
  const fillWidth = () => (props.power.available ? Math.max(2, Math.round((innerMax * percent()) / 100)) : 0);
  const accent = () => powerAccent(props.power);
  return (
    <View class="absolute" style={{ insetL: props.left, insetT: props.top, width: bodyWidth + 3, height: bodyHeight }}>
      <View
        class="absolute"
        style={{
          insetL: 0,
          insetT: 0,
          width: bodyWidth,
          height: bodyHeight,
          radius: 2,
          bgColor: theme.secondaryBackground,
          borderWidth: 1,
          borderColor: accent(),
        }}
      >
        {fillWidth() > 0 ? (
          <View
            class="absolute"
            style={{
              insetL: 2,
              insetT: 2,
              width: fillWidth(),
              height: bodyHeight - 4,
              radius: 1,
              bgColor: accent(),
            }}
          />
        ) : null}
      </View>
      <View
        class="absolute"
        style={{
          insetL: bodyWidth + 1,
          insetT: 3,
          width: 2,
          height: 4,
          radius: 1,
          bgColor: accent(),
        }}
      />
    </View>
  );
}

/** Compact battery and USB status badge for portrait and landscape home screens. */
export function PowerBadge(props: {
  power: PowerInfo;
  language: Language;
  box: LayoutBox;
  compact?: boolean;
}) {
  if (!props.power.available) return null;
  const accent = () => powerAccent(props.power);
  if (props.compact) {
    return (
      <View
        class="absolute"
        style={{
          insetL: props.box.left,
          insetT: props.box.top,
          width: props.box.width,
          height: props.box.height,
          radius: theme.tileRadius,
          bgColor: theme.card,
        }}
      >
        <BatteryGlyph power={props.power} left={8} top={7} />
        <Text
          class="absolute text-xs font-bold text-right"
          style={{ insetL: 31, insetT: 4, width: props.box.width - 37, textColor: theme.text }}
        >
          {formatBatteryPercent(props.power)}
        </Text>
        <Text
          class="absolute text-2xs text-center"
          style={{ insetL: 4, insetT: 22, width: props.box.width - 8, textColor: accent() === theme.text ? theme.secondaryText : accent() }}
        >
          {powerShortLabel(props.power, props.language)}
        </Text>
      </View>
    );
  }
  return (
    <View
      class="absolute"
      style={{
        insetL: props.box.left,
        insetT: props.box.top,
        width: props.box.width,
        height: props.box.height,
        radius: theme.cardRadius,
        bgColor: theme.card,
      }}
    >
      <BatteryGlyph power={props.power} left={14} top={14} />
      <Text
        class="absolute text-sm font-bold"
        style={{ insetL: 42, insetT: 10, width: 64, textColor: theme.text }}
      >
        {formatBatteryPercent(props.power)}
      </Text>
      <Text
        class="absolute text-2xs text-right"
        style={{ insetL: 106, insetT: 12, width: props.box.width - 120, textColor: props.power.usbPresent ? accent() : theme.secondaryText }}
      >
        {props.power.usbPresent ? "USB 5V" : pick(props.language, "电池", "Battery")}
      </Text>
      <Text
        class="absolute text-2xs"
        style={{ insetL: 14, insetT: 36, width: props.box.width - 28, textColor: theme.secondaryText }}
      >
        {powerStatusLabel(props.power, props.language)}
      </Text>
    </View>
  );
}
