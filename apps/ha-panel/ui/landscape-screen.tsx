import { For } from "solid-js";
import { createGesture } from "@pocketjs/framework/gesture";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import { Text, View } from "@pocketjs/framework/solid/components";
import { formatChineseDate, formatClock, timezoneLabel } from "../clock";
import { abgr, hsvToRgb } from "../color";
import { brightnessFromPercent, COLOR_PRESETS, percentFromBrightness, swipeDirection } from "../dimmer";
import { LIGHT_INFO, lightStatusText, lightTone } from "../lights";
import {
  availableLights,
  isLightAvailable,
  LIGHT_IDS,
  type LightId,
  type PanelAction,
  type PanelState,
} from "../model";
import type { NetworkInfo } from "../native";
import { activeTab, rowIntent, tileIntent, TABS, type NavEvent, type Route, type Tab } from "../navigation";
import { SCENES, sceneAction } from "../scenes";
import { SCREEN_OFF_OPTIONS, type SettingsAction, type SettingsState } from "../settings";
import { haStatus } from "../status";
import { theme } from "../theme";
import { weatherIcon, weatherLabel, weatherTemperature } from "../weather";
import { BacklightSlider, VerticalSlider } from "./controls";
import { BulbChip, bulbIcon, Divider, Icon, Numerals, Pressable, Switch } from "./primitives";

interface LandscapeProps {
  state: PanelState;
  route: Route;
  settings: SettingsState;
  network: NetworkInfo;
  utcOffsetMinutes: number;
  firmwareVersion: string;
  onAction(action: PanelAction): void;
  onSettings(action: SettingsAction): void;
  onNav(event: NavEvent): void;
  onRotate(landscape: boolean): void;
}

function LandscapeNav(props: { active: Tab; onNav(event: NavEvent): void }) {
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 88, height: 400, bgColor: theme.page }}>
      <View class="absolute" style={{ insetL: 87, insetT: 0, width: 1, height: 400, bgColor: theme.divider }} />
      <For each={TABS}>{(tab, index) => {
        const active = () => props.active === tab.id;
        return (
          <Pressable box={{ left: 0, top: 70 + index() * 100, width: 88, height: 90 }} onTap={() => props.onNav({ type: "tab", tab: tab.id })}>
            <Icon name={`${tab.id === "home" ? "home" : tab.id === "lights" ? "bulb" : "cog"}-${active() ? "primary" : "secondary"}`} left={32} top={12} size={24} />
            <Text class="absolute text-xs text-center" style={{ insetL: 0, insetT: 46, width: 88, textColor: active() ? theme.primary : theme.secondaryText }}>
              {tab.label}
            </Text>
          </Pressable>
        );
      }}</For>
    </View>
  );
}

function StatusLine(props: LandscapeProps) {
  const ha = () => haStatus(props.state);
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 552, height: 30 }}>
      <Icon name="wifi-secondary" left={16} top={12} size={16} />
      <Text class="absolute text-2xs" style={{ insetL: 38, insetT: 13, width: 180, textColor: theme.secondaryText }}>{props.network.ssid}</Text>
      <Text class="absolute text-2xs text-right" style={{ insetL: 300, insetT: 13, width: 236, textColor: theme.secondaryText }}>
        {`Home Assistant ${ha().label}`}
      </Text>
    </View>
  );
}

function Home(props: LandscapeProps) {
  const weather = () => props.state.haConnected ? props.state.weather : null;
  return (
    <View class="absolute" style={{ insetL: 88, insetT: 0, width: 552, height: 400 }}>
      <StatusLine {...props} />
      {props.state.clockEpochSeconds === null ? (
        <Text class="absolute text-2xl font-bold" style={{ insetL: 16, insetT: 48, width: 220, textColor: theme.text }}>--:--</Text>
      ) : (
        <Numerals text={formatClock(props.state.clockEpochSeconds, props.utcOffsetMinutes)} size={44} left={16} top={38} />
      )}
      <Text class="absolute text-xs" style={{ insetL: 16, insetT: 102, width: 220, textColor: theme.secondaryText }}>
        {formatChineseDate(props.state.clockEpochSeconds, props.utcOffsetMinutes)}
      </Text>
      {weather() ? (
        <View class="absolute" style={{ insetL: 440, insetT: 38, width: 80, height: 82 }}>
          <Icon name={weatherIcon(weather()!)} left={20} top={0} size={36} />
          <Text class="absolute text-xl font-bold text-right" style={{ insetL: 0, insetT: 38, width: 80, textColor: theme.text }}>{weatherTemperature(weather()!)}</Text>
          <Text class="absolute text-2xs text-right" style={{ insetL: 0, insetT: 66, width: 80, textColor: theme.secondaryText }}>{weatherLabel(weather()!)}</Text>
        </View>
      ) : null}
      <For each={LIGHT_IDS}>{(lightId, index) => {
        const light = () => props.state.lights[lightId];
        const enabled = () => isLightAvailable(props.state, lightId);
        const intent = (gesture: "tap" | "long-press") => {
          const next = tileIntent(gesture, lightId, availableLights(props.state));
          if (next.action) props.onAction(next.action);
          if (next.nav) props.onNav(next.nav);
        };
        return (
          <Pressable
            box={{ left: 16 + index() * 130, top: 140, width: 122, height: 116 }}
            style={{ radius: 12, bgColor: enabled() && light().on ? theme.tileOn : theme.card }}
            onTap={() => intent("tap")}
            onLongPress={() => intent("long-press")}
          >
            <BulbChip tone={lightTone(props.state, lightId)} left={12} top={12} size={36} />
            <Text class="absolute text-xs font-bold" style={{ insetL: 12, insetT: 54, width: 100, textColor: enabled() ? theme.text : theme.secondaryText }}>
              {LIGHT_INFO[lightId].name}
            </Text>
            <Text class="absolute text-2xs" style={{ insetL: 12, insetT: 76, width: 100, textColor: enabled() ? theme.secondaryText : theme.disabledText }}>
              {lightStatusText(props.state, lightId)}
            </Text>
          </Pressable>
        );
      }}</For>
      <Text class="absolute text-xs" style={{ insetL: 16, insetT: 282, width: 100, textColor: theme.secondaryText }}>场景</Text>
      <For each={SCENES}>{(scene, index) => (
        <Pressable
          box={{ left: 16 + index() * 176, top: 308, width: 166, height: 52 }}
          style={{ radius: 12, bgColor: theme.card }}
          onTap={() => props.onAction(sceneAction(props.state, scene.id))}
        >
          <Text class="absolute text-sm text-center" style={{ insetL: 0, insetT: 16, width: 166, textColor: theme.text }}>{scene.label}</Text>
        </Pressable>
      )}</For>
    </View>
  );
}

function Lights(props: LandscapeProps) {
  return (
    <View class="absolute" style={{ insetL: 88, insetT: 0, width: 552, height: 400 }}>
      <StatusLine {...props} />
      <Text class="absolute text-xl font-bold" style={{ insetL: 16, insetT: 40, width: 200, textColor: theme.text }}>灯光</Text>
      <Text class="absolute text-xs" style={{ insetL: 16, insetT: 82, width: 240, textColor: theme.secondaryText }}>
        {`${availableLights(props.state).length} / ${LIGHT_IDS.length} 盏可用`}
      </Text>
      <For each={LIGHT_IDS}>{(lightId, index) => {
        const light = () => props.state.lights[lightId];
        const enabled = () => isLightAvailable(props.state, lightId);
        const column = index() % 2;
        const row = Math.floor(index() / 2);
        const intent = (target: "row" | "switch") => {
          const next = rowIntent(target, lightId, availableLights(props.state));
          if (next.action) props.onAction(next.action);
          if (next.nav) props.onNav(next.nav);
        };
        return (
          <Pressable
            box={{ left: 16 + column * 268, top: 122 + row * 116, width: 252, height: 104 }}
            style={{ radius: 12, bgColor: theme.card }}
            onTap={() => intent("row")}
          >
            <BulbChip tone={lightTone(props.state, lightId)} left={12} top={14} size={36} />
            <Text class="absolute text-xs font-bold" style={{ insetL: 58, insetT: 16, width: 110, textColor: enabled() ? theme.text : theme.secondaryText }}>
              {LIGHT_INFO[lightId].name}
            </Text>
            <Text class="absolute text-2xs" style={{ insetL: 58, insetT: 40, width: 110, textColor: enabled() ? theme.secondaryText : theme.disabledText }}>
              {lightStatusText(props.state, lightId)}
            </Text>
            <Pressable box={{ left: 174, top: 44, width: 66, height: 48 }} onTap={() => intent("switch")}>
              <Switch on={light().on} enabled={enabled()} left={8} top={10} />
            </Pressable>
          </Pressable>
        );
      }}</For>
      <Text class="absolute text-2xs text-center" style={{ insetL: 16, insetT: 362, width: 520, textColor: theme.secondaryText }}>
        点击灯名调节亮度，点击开关切换电源
      </Text>
    </View>
  );
}

function Settings(props: LandscapeProps) {
  const ha = () => haStatus(props.state);
  return (
    <View class="absolute" style={{ insetL: 88, insetT: 0, width: 552, height: 400 }}>
      <Text class="absolute text-lg font-bold" style={{ insetL: 16, insetT: 14, width: 200, textColor: theme.text }}>设置</Text>
      <View class="absolute" style={{ insetL: 16, insetT: 60, width: 256, height: 252, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-sm" style={{ insetL: 14, insetT: 16, width: 60, textColor: theme.text }}>亮度</Text>
        <BacklightSlider left={74} top={10} screenLeft={178} width={166} value={props.settings.backlight ?? 5} onChange={percent => props.onSettings({ type: "backlight", percent })} />
        <Divider left={14} top={52} width={228} />
        <Text class="absolute text-sm" style={{ insetL: 14, insetT: 68, width: 120, textColor: theme.text }}>自动息屏</Text>
        <For each={SCREEN_OFF_OPTIONS}>{(option, index) => {
          const selected = () => props.settings.screenOffSeconds === option.seconds;
          return (
            <Pressable
              box={{ left: 14 + (index() % 2) * 116, top: 104 + Math.floor(index() / 2) * 54, width: 108, height: 44 }}
              style={{ radius: 9, bgColor: selected() ? theme.primary : theme.secondaryBackground }}
              onTap={() => props.onSettings({ type: "screen-off", seconds: option.seconds })}
            >
              <Text class="absolute text-xs text-center" style={{ insetL: 0, insetT: 13, width: 108, textColor: selected() ? theme.white : theme.secondaryText }}>
                {option.label}
              </Text>
            </Pressable>
          );
        }}</For>
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 222, width: 220, textColor: theme.secondaryText }}>触摸或按键活动会重新计时</Text>
      </View>

      <View class="absolute" style={{ insetL: 288, insetT: 60, width: 248, height: 104, radius: 12, bgColor: theme.card }}>
        <Pressable box={{ left: 0, top: 0, width: 248, height: 52 }} onTap={() => props.onNav({ type: "open-provision", topic: "wifi" })}>
          <Icon name="wifi-secondary" left={12} top={16} size={20} />
          <Text class="absolute text-xs" style={{ insetL: 42, insetT: 18, width: 60, textColor: theme.text }}>Wi-Fi</Text>
          <Text class="absolute text-2xs text-right" style={{ insetL: 102, insetT: 20, width: 132, textColor: theme.secondaryText }}>{props.network.ssid}</Text>
        </Pressable>
        <Divider left={12} top={52} width={224} />
        <Pressable box={{ left: 0, top: 52, width: 248, height: 52 }} onTap={() => props.onNav({ type: "open-provision", topic: "ha" })}>
          <Icon name="home-secondary" left={12} top={14} size={22} />
          <Text class="absolute text-2xs" style={{ insetL: 42, insetT: 19, width: 106, textColor: theme.text }}>Home Assistant</Text>
          <Text class="absolute text-2xs text-right" style={{ insetL: 154, insetT: 20, width: 80, textColor: theme.secondaryText }}>{ha().label}</Text>
        </Pressable>
      </View>
      <View class="absolute" style={{ insetL: 288, insetT: 180, width: 248, height: 52, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 18, width: 60, textColor: theme.text }}>时区</Text>
        <Text class="absolute text-2xs text-right" style={{ insetL: 80, insetT: 20, width: 154, textColor: theme.secondaryText }}>{timezoneLabel(props.utcOffsetMinutes)}</Text>
      </View>
      <View class="absolute" style={{ insetL: 288, insetT: 248, width: 248, height: 52, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 12, width: 80, textColor: theme.text }}>设备地址</Text>
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 30, width: 220, textColor: theme.secondaryText }}>{props.network.address}</Text>
        <Text class="absolute text-2xs text-right" style={{ insetL: 94, insetT: 12, width: 140, textColor: theme.secondaryText }}>{`固件 ${props.firmwareVersion}`}</Text>
      </View>
      <Pressable
        box={{ left: 288, top: 316, width: 248, height: 56 }}
        style={{ radius: 12, bgColor: theme.primary }}
        onTap={() => props.onRotate(false)}
      >
        <Icon name="back-page" left={16} top={16} size={24} />
        <Text class="absolute text-sm font-bold text-center" style={{ insetL: 46, insetT: 17, width: 186, textColor: theme.white }}>返回竖屏</Text>
      </Pressable>
    </View>
  );
}

function Dimmer(props: LandscapeProps & { lightId: LightId }) {
  let surface: NodeMirror | undefined;
  const light = () => props.state.lights[props.lightId];
  const enabled = () => isLightAvailable(props.state, props.lightId);
  const percent = () => percentFromBrightness(light().brightness);
  createGesture({
    region: { node: () => surface },
    axis: "x",
    onPanEnd: contact => {
      const direction = swipeDirection(contact.dx, contact.dy);
      if (direction !== 0) props.onNav({ type: "cycle-light", direction, available: availableLights(props.state) });
    },
  });
  return (
    <View ref={node => { surface = node; }} class="absolute" style={{ insetL: 0, insetT: 0, width: 640, height: 400, bgColor: theme.page }}>
      <Pressable box={{ left: 0, top: 0, width: 238, height: 44 }} onTap={() => props.onNav({ type: "back" })}>
        <Icon name="back-text" left={16} top={8} size={24} />
        <Text class="absolute text-lg font-bold" style={{ insetL: 48, insetT: 10, width: 180, textColor: theme.text }}>{LIGHT_INFO[props.lightId].name}</Text>
      </Pressable>
      <Text class="absolute text-xs text-right" style={{ insetL: 480, insetT: 13, width: 144, textColor: theme.disabledText }}>
        {enabled() ? LIGHT_INFO[props.lightId].tag : "未连接 HA"}
      </Text>
      <View class="absolute" style={{ insetL: 104, insetT: 44, width: 416, height: 64 }}>
        <For each={LIGHT_IDS}>{(lightId, index) => {
          const selected = () => props.lightId === lightId;
          const available = () => isLightAvailable(props.state, lightId);
          return (
            <Pressable
              box={{ left: index() * 104, top: 0, width: 96, height: 64 }}
              style={{ radius: 12, bgColor: selected() ? theme.secondaryBackground : theme.card, borderWidth: selected() ? 2 : 0, borderColor: theme.primary }}
              onTap={() => props.onNav({ type: "select-light", lightId, available: availableLights(props.state) })}
            >
              <Icon name={bulbIcon(lightTone(props.state, lightId))} left={36} top={8} size={24} />
              <Text class="absolute text-2xs text-center" style={{ insetL: 0, insetT: 39, width: 96, textColor: selected() ? theme.text : available() ? theme.secondaryText : theme.disabledText }}>
                {LIGHT_INFO[lightId].chip}
              </Text>
            </Pressable>
          );
        }}</For>
      </View>
      <VerticalSlider left={176} top={116} screenTop={116} value={percent()} enabled={enabled()} onChange={value => props.onAction({ type: "set-brightness", lightId: props.lightId, brightness: brightnessFromPercent(value) })} />
      <Numerals text={`${percent()}%`} size={44} left={480} top={126} center />
      <Pressable
        box={{ left: 452, top: 202, width: 56, height: 56 }}
        style={{ radius: 28, bgColor: light().on && enabled() ? theme.on : theme.secondaryBackground }}
        onTap={() => props.onAction({ type: "toggle-light", lightId: props.lightId })}
      >
        <Icon name={light().on && enabled() ? "power-page" : "power-secondary"} left={14} top={14} size={28} />
      </Pressable>
      <For each={COLOR_PRESETS}>{(preset, index) => (
        <Pressable
          box={{ left: 360 + index() * 56, top: 320, width: 44, height: 44 }}
          style={{ radius: 22, bgColor: abgr(hsvToRgb(preset.hue, preset.saturation / 100)) }}
          onTap={() => props.onAction({ type: "set-color", lightId: props.lightId, hue: preset.hue, saturation: preset.saturation })}
        />
      )}</For>
      <Text class="absolute text-2xs text-center" style={{ insetL: 330, insetT: 376, width: 290, textColor: theme.disabledText }}>上下拖动调亮度，左右滑动切换灯</Text>
    </View>
  );
}

function Provision(props: LandscapeProps & { topic: "wifi" | "ha" }) {
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 640, height: 400, bgColor: theme.page }}>
      <Pressable box={{ left: 0, top: 0, width: 250, height: 52 }} onTap={() => props.onNav({ type: "back" })}>
        <Icon name="back-text" left={16} top={14} size={24} />
        <Text class="absolute text-lg font-bold" style={{ insetL: 48, insetT: 15, width: 180, textColor: theme.text }}>用手机配置</Text>
      </Pressable>
      <View class="absolute" style={{ insetL: 80, insetT: 92, width: 196, height: 196, radius: 12, bgColor: theme.white }}>
        <Icon name="qr-placeholder" left={16} top={16} size={164} />
      </View>
      <Text class="absolute text-2xs text-center" style={{ insetL: 48, insetT: 302, width: 260, textColor: theme.disabledText }}>二维码与热点名均为占位，请勿扫码</Text>
      <Text class="absolute text-sm" style={{ insetL: 332, insetT: 88, width: 280, textColor: theme.text }}>
        {props.topic === "wifi" ? "手机连接 Wi-Fi D1001-3F2A" : "在手机上填写 HA 地址和令牌"}
      </Text>
      <Text class="absolute text-xs" style={{ insetL: 332, insetT: 126, width: 280, height: 66, lineHeight: 22, textColor: theme.secondaryText }}>
        {"浏览器打开配置页，保存后设备自动连网。\n配置网页将在后续版本提供，当前页面不会发起配网。"}
      </Text>
      <Pressable box={{ left: 332, top: 288, width: 280, height: 48 }} style={{ radius: 24, bgColor: theme.secondaryBackground }} onTap={() => props.onNav({ type: "back" })}>
        <Text class="absolute text-sm font-bold text-center" style={{ insetL: 0, insetT: 14, width: 280, textColor: theme.text }}>稍后设置</Text>
      </Pressable>
    </View>
  );
}

export function LandscapeScreen(props: LandscapeProps) {
  const screen = () => {
    const route = props.route;
    if (route.kind === "dimmer") return <Dimmer {...props} lightId={route.lightId} />;
    if (route.kind === "provision") return <Provision {...props} topic={route.topic} />;
    if (route.tab === "lights") return <Lights {...props} />;
    if (route.tab === "settings") return <Settings {...props} />;
    return <Home {...props} />;
  };
  return (
    <View class="relative overflow-hidden" style={{ width: 640, height: 400, bgColor: theme.page }}>
      {screen()}
      {props.route.kind === "tab" ? <LandscapeNav active={activeTab(props.route)} onNav={props.onNav} /> : null}
    </View>
  );
}
