import { Show, createSignal, type JSX } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { Image, Text, View } from "@pocketjs/framework/solid/components";
import { createGesture } from "@pocketjs/framework/gesture";
import { BTN } from "@pocketjs/framework/input";
import { onButtonPress } from "@pocketjs/framework/lifecycle";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import {
  LANDSCAPE_BUTTON,
  LANDSCAPE_HEIGHT,
  LANDSCAPE_WIDTH,
  PORTRAIT_HEIGHT,
  PORTRAIT_WIDTH,
  isLandscape,
  landscapePlacement,
  nextOrientation,
  orientationLabel,
  rotationDegrees,
  type Orientation,
} from "./orientation";

/** PocketJS colors are 0xAABBGGRR. */
function color(hex: string): number {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return (0xff000000 | (blue << 16) | (green << 8) | red) >>> 0;
}

function translucent(hex: string, alpha: number): number {
  return ((alpha << 24) | (color(hex) & 0x00ffffff)) >>> 0;
}

const palette = {
  page: color("#071012"),
  card: color("#0d191b"),
  cardRaised: color("#112124"),
  line: color("#1c3033"),
  text: color("#e9f4f3"),
  muted: color("#8ba4a7"),
  dim: color("#5f797c"),
  green: color("#39d98a"),
  greenPressed: color("#2fbf76"),
  greenDeep: color("#0a3a25"),
  cyan: color("#54c8e8"),
  amber: color("#ffb454"),
  red: color("#ff7a7a"),
  white: color("#ffffff"),
} as const;

interface PressableProps {
  left: number;
  top: number;
  width: number;
  height: number;
  background: number;
  pressedBackground?: number;
  radius?: number;
  onTap(): void;
  children?: JSX.Element;
}

function Pressable(props: PressableProps) {
  let node: NodeMirror | undefined;
  const [down, setDown] = createSignal(false);
  createGesture({
    region: { node: () => node },
    onDown: () => setDown(true),
    onUp: () => setDown(false),
    onCancel: () => setDown(false),
    onTap: () => props.onTap(),
  });
  return (
    <View
      ref={(mirror) => { node = mirror; }}
      class="absolute"
      style={{
        insetL: props.left,
        insetT: props.top,
        width: props.width,
        height: props.height,
        radius: props.radius ?? 12,
        bgColor: down() && props.pressedBackground !== undefined ? props.pressedBackground : props.background,
      }}
    >
      {props.children}
    </View>
  );
}

function SpecCard(props: {
  left: number;
  top: number;
  accent: number;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <View
      class="absolute"
      style={{
        insetL: props.left,
        insetT: props.top,
        width: 174,
        height: 92,
        radius: 12,
        bgColor: palette.card,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    >
      <View class="absolute" style={{ insetL: 14, insetT: 14, width: 22, height: 3, radius: 2, bgColor: props.accent }} />
      <Text class="absolute text-2xs font-bold" style={{ insetL: 14, insetT: 24, width: 146, textColor: palette.dim }}>
        {props.label}
      </Text>
      <Text class="absolute text-2xl font-bold" style={{ insetL: 14, insetT: 38, width: 146, textColor: palette.text }}>
        {props.value}
      </Text>
      <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 66, width: 146, textColor: palette.muted }}>
        {props.detail}
      </Text>
    </View>
  );
}

function StatusChip(props: { left: number; label: string; value: string; accent: number }) {
  return (
    <View
      class="absolute"
      style={{
        insetL: props.left,
        insetT: 456,
        width: 112,
        height: 48,
        radius: 10,
        bgColor: palette.card,
        borderWidth: 1,
        borderColor: palette.line,
      }}
    >
      <Text class="absolute text-2xs font-bold" style={{ insetL: 10, insetT: 9, width: 92, textColor: palette.dim }}>
        {props.label}
      </Text>
      <Text class="absolute text-sm font-bold" style={{ insetL: 10, insetT: 25, width: 92, textColor: props.accent }}>
        {props.value}
      </Text>
    </View>
  );
}

function RotateButton(props: { onTap(): void }) {
  return (
    <Pressable
      left={20}
      top={520}
      width={360}
      height={60}
      radius={14}
      background={palette.green}
      pressedBackground={palette.greenPressed}
      onTap={props.onTap}
    >
      <Text class="absolute text-2xl font-bold" style={{ insetL: 18, insetT: 11, width: 250, textColor: palette.greenDeep }}>
        旋转屏幕  ROTATE
      </Text>
      <Text class="absolute text-2xs font-bold" style={{ insetL: 18, insetT: 35, width: 300, textColor: palette.greenDeep }}>
        绿色按键 / GPIO3 也可切换
      </Text>
      <View class="absolute" style={{ insetL: 310, insetT: 17, width: 26, height: 26, radius: 13, bgColor: translucent("#04110b", 0x30) }} />
      <View class="absolute" style={{ insetL: 318, insetT: 23, width: 10, height: 10, radius: 2, bgColor: palette.greenDeep }} />
    </Pressable>
  );
}

function PortraitScreen(props: { orientation: Orientation; onRotate(): void }) {
  return (
    <View class="absolute overflow-hidden" style={{ width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT, bgColor: palette.page }}>
      <View class="absolute" style={{ insetL: 0, insetT: 0, width: 4, height: PORTRAIT_HEIGHT, bgColor: palette.green }} />
      <View class="absolute" style={{ insetL: 20, insetT: 0, width: 360, height: 1, bgColor: palette.line }} />

      <Text class="absolute text-2xs font-bold" style={{ insetL: 20, insetT: 18, width: 220, textColor: palette.dim }}>
        FACTORY DEMO / 出厂演示
      </Text>
      <Text class="absolute text-2xl font-bold" style={{ insetL: 20, insetT: 34, width: 280, textColor: palette.text }}>
        reTerminal D1001
      </Text>
      <View class="absolute" style={{ insetL: 300, insetT: 18, width: 80, height: 22, radius: 11, bgColor: palette.cardRaised, borderWidth: 1, borderColor: palette.line }}>
        <Text class="absolute text-2xs font-bold text-center" style={{ insetL: 0, insetT: 6, width: 80, textColor: palette.muted }}>
          {orientationLabel(props.orientation)}
        </Text>
      </View>

      <View
        class="absolute"
        style={{ insetL: 20, insetT: 86, width: 360, height: 128, radius: 14, bgColor: palette.card, borderWidth: 1, borderColor: palette.line }}
      >
        <Text class="absolute text-2xs font-bold" style={{ insetL: 18, insetT: 14, width: 180, textColor: palette.dim }}>
          reTERMINAL · FACTORY MODE
        </Text>
        <Text class="absolute text-2xl font-bold" style={{ insetL: 18, insetT: 30, width: 220, textColor: palette.text }}>
          D1001
        </Text>
        <Text class="absolute text-2xs" style={{ insetL: 18, insetT: 82, width: 220, textColor: palette.muted }}>
          10.1" · 800 × 1280 · ESP32-P4
        </Text>
        <View class="absolute" style={{ insetL: 246, insetT: 28, width: 92, height: 72, radius: 8, bgColor: palette.page, borderWidth: 1, borderColor: palette.line }}>
          <View class="absolute" style={{ insetL: 8, insetT: 8, width: 76, height: 4, radius: 2, bgColor: palette.green }} />
          <View class="absolute" style={{ insetL: 8, insetT: 18, width: 62, height: 3, radius: 1, bgColor: palette.line }} />
          <View class="absolute" style={{ insetL: 8, insetT: 26, width: 70, height: 3, radius: 1, bgColor: palette.line }} />
          <View class="absolute" style={{ insetL: 8, insetT: 34, width: 48, height: 3, radius: 1, bgColor: palette.line }} />
          <View class="absolute" style={{ insetL: 8, insetT: 48, width: 12, height: 12, radius: 6, bgColor: palette.cyan }} />
          <View class="absolute" style={{ insetL: 26, insetT: 50, width: 38, height: 3, radius: 1, bgColor: palette.line }} />
        </View>
      </View>

      <SpecCard left={20} top={228} accent={palette.green} label="DISPLAY" value="800 × 1280" detail="10.1 inch · MIPI-DSI" />
      <SpecCard left={206} top={228} accent={palette.cyan} label="MEMORY" value="32 MB" detail="PSRAM · 128 KB L2" />
      <SpecCard left={20} top={332} accent={palette.amber} label="WIRELESS" value="Wi-Fi 6" detail="BT 5.0 · ESP32-C6" />
      <SpecCard left={206} top={332} accent={palette.red} label="SENSOR" value="6-axis" detail="IMU · RTC · touch" />

      <Text class="absolute text-2xs font-bold" style={{ insetL: 20, insetT: 438, width: 360, textColor: palette.dim }}>
        SYSTEM
      </Text>
      <StatusChip left={20} label="POWER" value="OK" accent={palette.green} />
      <StatusChip left={144} label="DISPLAY" value="OK" accent={palette.green} />
      <StatusChip left={268} label="INPUT" value="READY" accent={palette.cyan} />

      <RotateButton onTap={props.onRotate} />

      <Text class="absolute text-2xs" style={{ insetL: 20, insetT: 596, width: 180, textColor: palette.dim }}>
        PORTRAIT 400×640
      </Text>
      <Text class="absolute text-2xs text-right" style={{ insetL: 220, insetT: 596, width: 160, textColor: palette.dim }}>
        绿色按键切换方向
      </Text>
      <Text class="absolute text-2xs" style={{ insetL: 20, insetT: 612, width: 300, textColor: palette.dim }}>
        POCKETJS · FACTORY DEMO · v1.0
      </Text>
    </View>
  );
}

function LandscapeScreen(props: { orientation: Orientation; onRotate(): void }) {
  const placement = () => landscapePlacement(props.orientation);
  const [pressed, setPressed] = createSignal(false);
  let node: NodeMirror | undefined;
  createGesture({
    region: { node: () => node },
    onDown: () => setPressed(true),
    onUp: () => setPressed(false),
    onCancel: () => setPressed(false),
    onTap: () => props.onRotate(),
  });
  return (
    <View class="absolute overflow-hidden" style={{ width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT, bgColor: palette.page }}>
      <View
        class="absolute overflow-hidden"
        style={{
          insetL: placement().left,
          insetT: placement().top,
          width: LANDSCAPE_WIDTH,
          height: LANDSCAPE_HEIGHT,
          rotate: rotationDegrees(props.orientation),
          originX: -0.5,
          originY: -0.5,
        }}
      >
        <Image class="absolute" style={{ insetL: 0, insetT: 0, width: LANDSCAPE_WIDTH, height: LANDSCAPE_HEIGHT }} src="art/landscape.png" />
        <View
          ref={(mirror) => { node = mirror; }}
          class="absolute"
          style={{
            insetL: LANDSCAPE_BUTTON.left,
            insetT: LANDSCAPE_BUTTON.top,
            width: LANDSCAPE_BUTTON.width,
            height: LANDSCAPE_BUTTON.height,
            radius: 10,
            bgColor: pressed() ? translucent("#ffffff", 0x24) : translucent("#000000", 0x01),
          }}
        />
      </View>
    </View>
  );
}

function FactoryDemo() {
  const [orientation, setOrientation] = createSignal<Orientation>("portrait");
  const rotate = () => {
    const next = nextOrientation(orientation());
    setOrientation(next);
    console.log("[factory-d1001] orientation=" + next + " landscape=" + isLandscape(next));
  };
  onButtonPress(BTN.CIRCLE, () => rotate());
  console.log("[factory-d1001] ready; green button cycles portrait / landscape");
  return (
    <Show when={isLandscape(orientation())} fallback={<PortraitScreen orientation={orientation()} onRotate={rotate} />}>
      <LandscapeScreen orientation={orientation()} onRotate={rotate} />
    </Show>
  );
}

mount(() => <FactoryDemo />);
