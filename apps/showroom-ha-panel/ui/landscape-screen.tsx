import { createSignal, For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { formatClock, formatLocalizedDate, timezoneLabel } from "../clock";
import { brightnessFromPercent, percentFromBrightness, type DimmerMode } from "../dimmer";
import { languageToggleLabel, pick, type Language } from "../i18n";
import { lightColor, lightInfo, lightStatusText } from "../lights";
import { isLightAvailable, type LightId, type PanelAction, type PanelState } from "../model";
import { canSwitchNetwork, formatRssi, requestNextPreset, type NetworkInfo } from "../native";
import { activeTab, TABS, tabLabel, type NavEvent, type Route, type Tab } from "../navigation";
import { pageWindow, SHOWROOM } from "../showroom";
import { screenOffLabel, SCREEN_OFF_OPTIONS, type SettingsAction, type SettingsState } from "../settings";
import { haStatus } from "../status";
import { LoadingDots } from "./loading-dots";
import { theme } from "../theme";
import { weatherIcon, weatherLabel, weatherTemperature } from "../weather";
import { ActionButton, MainLightControl } from "./console-controls";
import { HomeArmActions } from "./home-arm-actions";
import { BacklightSlider, ColorWheel, ModeButton, VerticalSlider } from "./controls";
import { Divider, Icon, Numerals, Pressable } from "./primitives";
import { SensorDetailScreen } from "./sensors-screen";
import { Pager, SensorCard } from "./showroom-cards";

interface LandscapeProps {
  state: PanelState;
  route: Route;
  settings: SettingsState;
  network: NetworkInfo;
  language: Language;
  lightPage: number;
  sensorPage: number;
  utcOffsetMinutes: number;
  firmwareVersion: string;
  onAction(action: PanelAction): void;
  onSettings(action: SettingsAction): void;
  onNav(event: NavEvent): void;
  onHaAction(actionId: string, confirmed: boolean): void;
  actionConfigured(actionId: string): boolean;
  onRotate: (landscape: boolean) => void;
  onLanguageToggle(): void;
  dimmerMode: DimmerMode;
  onDimmerMode(mode: DimmerMode): void;
}

function LandscapeNav(props: { active: Tab; language: Language; onNav(event: NavEvent): void }) {
  const icon = (tab: Tab, active: boolean) => {
    if (tab === "home") return active ? "home-primary" as const : "home-secondary" as const;
    if (tab === "lights") return active ? "bulb-primary" as const : "bulb-secondary" as const;
    if (tab === "sensors") return "weather-partly" as const;
    return active ? "cog-primary" as const : "cog-secondary" as const;
  };
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 88, height: 400, bgColor: theme.page }}>
      <View class="absolute" style={{ insetL: 87, insetT: 0, width: 1, height: 400, bgColor: theme.divider }} />
      <For each={TABS}>{(tab, index) => {
        const active = () => props.active === tab.id;
        return (
          <Pressable box={{ left: 0, top: 44 + index() * 76, width: 88, height: 70 }} onTap={() => props.onNav({ type: "tab", tab: tab.id })}>
            <Icon name={icon(tab.id, active())} left={32} top={7} size={24} />
            <Text class="absolute text-xs text-center" style={{ insetL: 0, insetT: 40, width: 88, textColor: active() ? theme.primary : theme.secondaryText }}>
              {tabLabel(tab, props.language)}
            </Text>
          </Pressable>
        );
      }}</For>
    </View>
  );
}

function StatusLine(props: LandscapeProps) {
  const ha = () => haStatus(props.state, props.language);
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 552, height: 30 }}>
      <Icon name="wifi-secondary" left={16} top={12} size={16} />
      <Text class="absolute text-2xs" style={{ insetL: 38, insetT: 13, width: 180, textColor: theme.secondaryText }}>{props.network.ssid}</Text>
      <Text class="absolute text-2xs text-right" style={{ insetL: 254, insetT: 13, width: 176, textColor: theme.secondaryText }}>
        {ha().tone === "connected" ? `Home Assistant ${ha().label}` : "Home Assistant"}
      </Text>
      {ha().tone === "connected" ? null : <LoadingDots centerX={456} centerY={20} />}
      <Pressable
        box={{ left: 482, top: 0, width: 64, height: 32 }}
        style={{ radius: 16, bgColor: theme.secondaryBackground }}
        onTap={props.onLanguageToggle}
      >
        <Text class="absolute text-2xs font-bold text-center" style={{ insetL: 0, insetT: 9, width: 64, textColor: theme.text }}>
          {languageToggleLabel(props.language)}
        </Text>
      </Pressable>
    </View>
  );
}

function Home(props: LandscapeProps) {
  const weather = () => props.state.haConnected ? props.state.weather : null;
  return (
    <View class="absolute" style={{ insetL: 88, insetT: 0, width: 552, height: 400 }}>
      <StatusLine {...props} />
      {props.state.clockEpochSeconds === null ? (
        <Text class="absolute text-2xl font-bold" style={{ insetL: 16, insetT: 48, width: 140, textColor: theme.text }}>--:--</Text>
      ) : (
        <Numerals text={formatClock(props.state.clockEpochSeconds, props.utcOffsetMinutes)} size={44} left={16} top={38} />
      )}
      <Text class="absolute text-xs" style={{ insetL: 16, insetT: 94, width: 180, textColor: theme.secondaryText }}>
        {formatLocalizedDate(props.state.clockEpochSeconds, props.utcOffsetMinutes, props.language)}
      </Text>
      {weather() ? (
        <View class="absolute" style={{ insetL: 200, insetT: 38, width: 120, height: 68 }}>
          <Icon name={weatherIcon(weather()!)} left={0} top={2} size={32} />
          <Text class="absolute text-lg font-bold text-right" style={{ insetL: 38, insetT: 0, width: 82, textColor: theme.text }}>{weatherTemperature(weather()!)}</Text>
          <Text class="absolute text-2xs text-right" style={{ insetL: 38, insetT: 28, width: 82, textColor: theme.secondaryText }}>{weatherLabel(weather()!, props.language)}</Text>
        </View>
      ) : null}
      <MainLightControl
        {...props}
        lightId={SHOWROOM.home.lights[0]!}
        box={{ left: 16, top: 112, width: 520, height: 78 }}
      />
      <For each={SHOWROOM.home.sensors}>{(sensorId, index) => (
        <SensorCard
          state={props.state}
          language={props.language}
          sensorId={sensorId}
          box={{ left: 16 + index() * 148, top: 198, width: 140 + (index() === 1 ? 4 : 0), height: 74 }}
          compact
          onNav={props.onNav}
        />
      )}</For>
      <Text class="absolute text-sm font-bold" style={{ insetL: 16, insetT: 280, width: 180, textColor: theme.text }}>
        {pick(props.language, "快捷指令", "Quick Actions")}
      </Text>
      <Text class="absolute text-2xs text-right" style={{ insetL: 196, insetT: 284, width: 112, textColor: theme.secondaryText }}>
        {pick(props.language, "由 HA 执行", "Runs on HA")}
      </Text>
      <For each={SHOWROOM.home.actions}>{(actionId, index) => (
        <ActionButton
          state={props.state}
          language={props.language}
          actionId={actionId}
          box={{ left: 16 + (index() % 3) * 100, top: 304 + Math.floor(index() / 3) * 46, width: 92, height: 42 }}
          configured={props.actionConfigured(actionId)}
          onHaAction={props.onHaAction}
        />
      )}</For>
      <HomeArmActions
        state={props.state}
        language={props.language}
        box={{ left: 320, top: 198, width: 216, height: 192 }}
        landscape
        actionConfigured={props.actionConfigured}
        onHaAction={props.onHaAction}
      />
    </View>
  );
}

function Sensors(props: LandscapeProps) {
  const window = () => pageWindow(props.state.sensorOrder, props.sensorPage, 4);
  return (
    <View class="absolute" style={{ insetL: 88, insetT: 0, width: 552, height: 400 }}>
      <StatusLine {...props} />
      <Text class="absolute text-lg font-bold" style={{ insetL: 16, insetT: 38, width: 240, textColor: theme.text }}>
        {pick(props.language, "环境", "Environment")}
      </Text>
      <Text class="absolute text-xs" style={{ insetL: 16, insetT: 72, width: 280, textColor: theme.secondaryText }}>
        {pick(props.language, "只读状态", "Read-only status")}
      </Text>
      <For each={window().items}>{(sensorId, index) => (
        <SensorCard
          state={props.state}
          language={props.language}
          sensorId={sensorId}
          box={{ left: 16 + (index() % 2) * 268, top: 100 + Math.floor(index() / 2) * 108, width: 252, height: 96 }}
          onNav={props.onNav}
        />
      )}</For>
      <Pager left={16} top={330} width={520} language={props.language} page={window().page} pageCount={window().pageCount} target="sensors" onNav={props.onNav} />
    </View>
  );
}

function Settings(props: LandscapeProps) {
  const ha = () => haStatus(props.state, props.language);
  return (
    <View class="absolute" style={{ insetL: 88, insetT: 0, width: 552, height: 400 }}>
      <Text class="absolute text-lg font-bold" style={{ insetL: 16, insetT: 14, width: 220, textColor: theme.text }}>
        {pick(props.language, "设置", "Settings")}
      </Text>
      <Pressable
        box={{ left: 448, top: 12, width: 88, height: 36 }}
        style={{ radius: 18, bgColor: theme.secondaryBackground }}
        onTap={props.onLanguageToggle}
      >
        <Text class="absolute text-xs font-bold text-center" style={{ insetL: 0, insetT: 11, width: 88, textColor: theme.text }}>
          {languageToggleLabel(props.language)}
        </Text>
      </Pressable>
      <View class="absolute" style={{ insetL: 16, insetT: 60, width: 256, height: 252, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-sm" style={{ insetL: 14, insetT: 18, width: 78, textColor: theme.text }}>
          {pick(props.language, "亮度", "Brightness")}
        </Text>
        <BacklightSlider left={96} top={11} screenLeft={200} width={136} value={props.settings.backlight ?? 5} onChange={percent => props.onSettings({ type: "backlight", percent })} />
        <Divider left={14} top={52} width={228} />
        <Text class="absolute text-sm" style={{ insetL: 14, insetT: 68, width: 140, textColor: theme.text }}>
          {pick(props.language, "自动息屏", "Auto sleep")}
        </Text>
        <For each={SCREEN_OFF_OPTIONS}>{(option, index) => {
          const selected = () => props.settings.screenOffSeconds === option.seconds;
          return (
            <Pressable
              box={{ left: 14 + (index() % 2) * 116, top: 104 + Math.floor(index() / 2) * 54, width: 108, height: 44 }}
              style={{ radius: 9, bgColor: selected() ? theme.primary : theme.secondaryBackground }}
              onTap={() => props.onSettings({ type: "screen-off", seconds: option.seconds })}
            >
              <Text class="absolute text-xs text-center" style={{ insetL: 0, insetT: 13, width: 108, textColor: selected() ? theme.white : theme.text }}>
                {screenOffLabel(option, props.language)}
              </Text>
            </Pressable>
          );
        }}</For>
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 222, width: 228, textColor: theme.secondaryText }}>
          {pick(props.language, "触摸或按键活动会重新计时", "Touch or key activity restarts the timer")}
        </Text>
      </View>

      <View class="absolute" style={{ insetL: 288, insetT: 60, width: 248, height: 104, radius: 12, bgColor: theme.card }}>
        <Pressable box={{ left: 0, top: 0, width: 248, height: 52 }} onTap={() => props.onNav({ type: "open-provision", topic: "wifi" })}>
          <Icon name="wifi-secondary" left={12} top={16} size={20} />
          <Text class="absolute text-xs" style={{ insetL: 42, insetT: 18, width: 60, textColor: theme.text }}>Wi-Fi</Text>
          <Text class="absolute text-2xs text-right" style={{ insetL: 102, insetT: 20, width: 132, textColor: theme.secondaryText }}>{props.network.ssid}</Text>
        </Pressable>
        <Divider left={12} top={52} width={224} />
        <Pressable box={{ left: 0, top: 52, width: 248, height: 52 }} onTap={() => props.onNav({ type: "open-provision", topic: "ha" })}>
          <Icon name="home-secondary" left={12} top={14} size={24} />
          <Text class="absolute text-2xs" style={{ insetL: 42, insetT: 19, width: 106, textColor: theme.text }}>Home Assistant</Text>
          <Text class="absolute text-2xs text-right" style={{ insetL: 154, insetT: 20, width: 80, textColor: theme.secondaryText }}>{ha().label}</Text>
        </Pressable>
      </View>
      <View class="absolute" style={{ insetL: 288, insetT: 180, width: 248, height: 52, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 17, width: 70, textColor: theme.text }}>
          {pick(props.language, "时区", "Time zone")}
        </Text>
        <Text class="absolute text-2xs text-right" style={{ insetL: 84, insetT: 19, width: 150, textColor: theme.secondaryText }}>
          {timezoneLabel(props.utcOffsetMinutes, props.language)}
        </Text>
      </View>
      <View class="absolute" style={{ insetL: 288, insetT: 240, width: 248, height: 52, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 10, width: 100, textColor: theme.text }}>
          {pick(props.language, "设备地址", "Device address")}
        </Text>
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 27, width: 220, textColor: theme.secondaryText }}>{props.network.address}</Text>
        <Text class="absolute text-2xs text-right" style={{ insetL: 114, insetT: 10, width: 120, textColor: theme.secondaryText }}>
          {`${pick(props.language, "固件", "Firmware")} ${props.firmwareVersion}`}
        </Text>
      </View>
      <Pressable
        box={{ left: 288, top: 316, width: 248, height: 56 }}
        style={{ radius: 24, bgColor: theme.primary }}
        onTap={() => props.onRotate(false)}
      >
        <Icon name="back-page" left={16} top={16} size={24} />
        <Text class="absolute text-sm font-bold text-center" style={{ insetL: 46, insetT: 17, width: 186, textColor: theme.white }}>
          {pick(props.language, "返回竖屏", "Portrait")}
        </Text>
      </Pressable>
    </View>
  );
}

function Dimmer(props: LandscapeProps & { lightId: LightId }) {
  const light = () => props.state.lights[props.lightId]!;
  const enabled = () => isLightAvailable(props.state, props.lightId);
  const percent = () => percentFromBrightness(light().brightness);
  const back = () => {
    if (props.dimmerMode === "color") props.onDimmerMode("brightness");
    else props.onNav({ type: "back" });
  };
  const toggleColor = () => {
    if (enabled()) props.onDimmerMode(props.dimmerMode === "brightness" ? "color" : "brightness");
  };
  const setBrightness = (value: number) => props.onAction({
    type: "set-brightness",
    lightId: props.lightId,
    brightness: brightnessFromPercent(value),
  });
  const setColor = (hue: number, saturation: number) => props.onAction({
    type: "set-color",
    lightId: props.lightId,
    hue,
    saturation,
  });
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 640, height: 400, bgColor: theme.page }}>
      <Pressable
        box={{ left: 0, top: 0, width: 238, height: 44 }}
        onTap={back}
      >
        <Icon name="back-text" left={16} top={8} size={24} />
        <Text class="absolute text-lg font-bold" style={{ insetL: 48, insetT: 10, width: 182, textColor: theme.text }}>
          {lightInfo(props.state, props.lightId, props.language).name}
        </Text>
      </Pressable>
      <Text class="absolute text-xs text-right" style={{ insetL: 480, insetT: 13, width: 144, textColor: enabled() ? theme.secondaryText : theme.disabledText }}>
        {lightStatusText(props.state, props.lightId, props.language)}
      </Text>

      <Numerals text={`${percent()}%`} size={44} left={320} top={44} center />
      {props.dimmerMode === "brightness" ? (
        <VerticalSlider
          left={272}
          top={90}
          screenTop={90}
          width={96}
          height={214}
          value={percent()}
          color={lightColor(light())}
          on={light().on}
          enabled={enabled()}
          onChange={setBrightness}
        />
      ) : (
        <ColorWheel
          left={212}
          top={88}
          size={216}
          hue={light().hue}
          saturation={light().saturation}
          enabled={enabled()}
          onChange={setColor}
        />
      )}

      <ModeButton
        left={256}
        top={314}
        size={48}
        icon={light().on ? "power-page" : "power-secondary"}
        label={light().on ? pick(props.language, "关灯", "Off") : pick(props.language, "开灯", "On")}
        background={light().on ? theme.on : theme.secondaryBackground}
        labelColor={light().on ? theme.on : theme.secondaryText}
        enabled={enabled()}
        onTap={() => { if (enabled()) props.onAction({ type: "toggle-light", lightId: props.lightId }); }}
      />
      <ModeButton
        left={336}
        top={314}
        size={48}
        icon={props.dimmerMode === "brightness" ? "color-primary" : "bulb-primary"}
        label={props.dimmerMode === "brightness" ? pick(props.language, "颜色", "Color") : pick(props.language, "亮度", "Bright")}
        background={props.dimmerMode === "brightness" ? theme.secondaryBackground : theme.primaryChip}
        labelColor={props.dimmerMode === "brightness" ? theme.secondaryText : theme.primary}
        enabled={enabled()}
        onTap={toggleColor}
      />
    </View>
  );
}

function Provision(props: LandscapeProps & { topic: "wifi" | "ha" }) {
  const [switched, setSwitched] = createSignal<"idle" | "requested" | "none">("idle");
  const ha = () => haStatus(props.state, props.language);
  const haTone = () => ha().tone === "connected" ? theme.green : ha().tone === "offline" ? theme.on : theme.disabledText;
  const switchNetwork = () => setSwitched(requestNextPreset() ? "requested" : "none");
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 640, height: 400, bgColor: theme.page }}>
      <Pressable box={{ left: 0, top: 0, width: 250, height: 52 }} onTap={() => props.onNav({ type: "back" })}>
        <Icon name="back-text" left={16} top={14} size={24} />
        <Text class="absolute text-lg font-bold" style={{ insetL: 48, insetT: 14, width: 186, textColor: theme.text }}>
          {pick(props.language, "连接状态", "Connection")}
        </Text>
      </Pressable>
      <Text class="absolute text-xs" style={{ insetL: 332, insetT: 18, width: 292, textColor: theme.secondaryText }}>
        {props.topic === "wifi"
          ? pick(props.language, "设备当前的 Wi-Fi 与 Home Assistant 连接。", "This device's Wi-Fi and Home Assistant status.")
          : pick(props.language, "Home Assistant 连接与设备当前的 Wi-Fi。", "Home Assistant and this device's Wi-Fi status.")}
      </Text>

      <View class="absolute" style={{ insetL: 16, insetT: 64, width: 296, height: 168, radius: 12, bgColor: theme.card }}>
        <View class="absolute" style={{ insetL: 14, insetT: 18, width: 10, height: 10, radius: 5, bgColor: props.network.connected ? theme.green : theme.disabledText }} />
        <Text class="absolute text-sm font-bold" style={{ insetL: 34, insetT: 12, width: 120, textColor: theme.text }}>Wi-Fi</Text>
        <Text class="absolute text-xs text-right" style={{ insetL: 164, insetT: 14, width: 118, textColor: theme.secondaryText }}>
          {props.network.connected ? pick(props.language, "已连接", "Connected") : pick(props.language, "未连接", "Not connected")}
        </Text>
        <View class="absolute" style={{ insetL: 14, insetT: 48, width: 268, height: 1, bgColor: theme.divider }} />
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 62, width: 100, textColor: theme.secondaryText }}>
          {pick(props.language, "当前网络", "Network")}
        </Text>
        <Text class="absolute text-sm text-right" style={{ insetL: 108, insetT: 60, width: 174, textColor: theme.text }}>{props.network.ssid}</Text>
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 98, width: 100, textColor: theme.secondaryText }}>
          {pick(props.language, "IP 地址", "IP address")}
        </Text>
        <Text class="absolute text-sm text-right" style={{ insetL: 108, insetT: 96, width: 174, textColor: theme.text }}>{props.network.address}</Text>
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 134, width: 100, textColor: theme.secondaryText }}>
          {pick(props.language, "信号强度", "Signal")}
        </Text>
        <Text class="absolute text-sm text-right" style={{ insetL: 108, insetT: 132, width: 174, textColor: theme.text }}>
          {formatRssi(props.network.rssi, props.language)}
        </Text>
      </View>

      <View class="absolute" style={{ insetL: 328, insetT: 64, width: 296, height: 168, radius: 12, bgColor: theme.card }}>
        <View class="absolute" style={{ insetL: 14, insetT: 18, width: 10, height: 10, radius: 5, bgColor: haTone() }} />
        <Text class="absolute text-sm font-bold" style={{ insetL: 34, insetT: 12, width: 170, textColor: theme.text }}>Home Assistant</Text>
        <Text class="absolute text-xs text-right" style={{ insetL: 190, insetT: 14, width: 92, textColor: theme.secondaryText }}>{ha().label}</Text>
        <View class="absolute" style={{ insetL: 14, insetT: 48, width: 268, height: 1, bgColor: theme.divider }} />
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 62, width: 100, textColor: theme.secondaryText }}>
          {pick(props.language, "连接状态", "Status")}
        </Text>
        <Text class="absolute text-sm text-right" style={{ insetL: 108, insetT: 60, width: 174, textColor: theme.text }}>{ha().label}</Text>
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 100, width: 268, textColor: theme.disabledText }}>
          {pick(props.language, "地址与令牌由技术人员写入设备。", "Technicians write the address and token.")}
        </Text>
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 126, width: 268, textColor: theme.disabledText }}>
          {pick(props.language, "连接断开时，灯光和快捷操作不可用。", "Lights and quick actions need a connection.")}
        </Text>
      </View>

      {canSwitchNetwork() ? (
        <>
          <Pressable
            box={{ left: 16, top: 252, width: 296, height: 48 }}
            style={{ radius: 24, bgColor: theme.primary }}
            onTap={switchNetwork}
          >
            <Text class="absolute text-sm font-bold text-center" style={{ insetL: 0, insetT: 14, width: 296, textColor: theme.white }}>
              {pick(props.language, "切换网络", "Next network")}
            </Text>
          </Pressable>
          <Text class="absolute text-2xs" style={{ insetL: 16, insetT: 310, width: 296, textColor: theme.secondaryText }}>
            {switched() === "requested"
              ? pick(props.language, "已请求切换，等待新网络。", "Switch requested; waiting for the new network.")
              : switched() === "none"
                ? pick(props.language, "没有其他已配置的预设网络。", "No other preset network is configured.")
                : pick(props.language, "设备将按预设顺序尝试下一个网络。", "The device tries the next network in the preset order.")}
          </Text>
        </>
      ) : (
        <Text class="absolute text-sm" style={{ insetL: 16, insetT: 258, width: 296, height: 60, lineHeight: 24, textColor: theme.secondaryText }}>
          {pick(props.language, "网络由技术人员在设备上预设，展台现场无需配置。", "Technicians preset the network; no booth setup is needed.")}
        </Text>
      )}

      <Pressable box={{ left: 328, top: 252, width: 296, height: 48 }} style={{ radius: 24, bgColor: theme.secondaryBackground }} onTap={() => props.onNav({ type: "back" })}>
        <Text class="absolute text-sm font-bold text-center" style={{ insetL: 0, insetT: 14, width: 296, textColor: theme.text }}>
          {pick(props.language, "返回", "Back")}
        </Text>
      </Pressable>
    </View>
  );
}

export function LandscapeScreen(props: LandscapeProps) {
  const screen = () => {
    const route = props.route;
    if (route.kind === "dimmer") return <Dimmer {...props} lightId={route.lightId} />;
    if (route.kind === "sensor") return <SensorDetailScreen state={props.state} language={props.language} sensorId={route.sensorId} landscape onNav={props.onNav} />;
    if (route.kind === "provision") return <Provision {...props} topic={route.topic} />;
    if (route.tab === "sensors") return <Sensors {...props} />;
    if (route.tab === "settings") return <Settings {...props} />;
    return <Home {...props} />;
  };
  return (
    <View class="relative overflow-hidden" style={{ width: 640, height: 400, bgColor: theme.page }}>
      {screen()}
      {props.route.kind === "tab" ? <LandscapeNav active={activeTab(props.route)} language={props.language} onNav={props.onNav} /> : null}
    </View>
  );
}
