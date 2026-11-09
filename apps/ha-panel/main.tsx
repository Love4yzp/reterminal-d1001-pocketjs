import { createSignal } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { View } from "@pocketjs/framework/solid/components";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { worker } from "@pocketjs/framework/worker/channels";
import { createLightAdapter, type LightAdapter } from "./devices";
import {
  changedLights,
  createInitialPanelState,
  reducePanel,
  type LightId,
  type LightState,
  type PanelAction,
  type PanelState,
} from "./model";
import {
  readBacklight,
  readFirmwareVersion,
  readHaConfig,
  readLandscape,
  readNetwork,
  readRtcSeconds,
  readUtcOffsetMinutes,
  requestLandscape,
  savePanelState,
  screenOffNative,
  syncNativeClock,
  takePanelState,
  writeBacklight,
} from "./native";
import { activeTab, INITIAL_ROUTE, navigate, type NavEvent, type Route } from "./navigation";
import { encodeMessage, decodeMessage } from "./protocol";
import { createScreenOffControl, createSettings, reduceSettings, type SettingsAction } from "./settings";
import { decodeSession, encodeSession, restorePanelState, restoreSettings } from "./session";
import { theme } from "./theme";
import type { PanelHaConfig, WorkerCommand, WorkerEvent } from "./protocol";
import { DimmerScreen } from "./ui/dimmer-screen";
import { HomeScreen } from "./ui/home-screen";
import { LandscapeScreen } from "./ui/landscape-screen";
import { LightsScreen } from "./ui/lights-screen";
import { NavBar } from "./ui/nav-bar";
import { ProvisionScreen } from "./ui/provision-screen";
import { SettingsScreen } from "./ui/settings-screen";

function Panel() {
  const saved = decodeSession(takePanelState());
  const initialBacklight = readBacklight();
  const [state, setState] = createSignal<PanelState>(
    saved ? restorePanelState(createInitialPanelState(), saved) : createInitialPanelState(),
  );
  const [route, setRoute] = createSignal<Route>(saved?.route ?? INITIAL_ROUTE);
  const [network, setNetwork] = createSignal(readNetwork());
  const [settings, setSettings] = createSignal(
    saved ? restoreSettings(createSettings(initialBacklight), saved) : createSettings(initialBacklight),
  );
  const config: PanelHaConfig = readHaConfig();
  const utcOffsetMinutes = readUtcOffsetMinutes();
  const firmwareVersion = readFirmwareVersion();
  const landscape = readLandscape();
  const configured = config.baseUrl.length > 0 && config.token.length > 0;
  const configChannel = worker.channel("ha-config");
  const commands = worker.channel("ha-commands");
  const events = worker.channel("ha-events");
  const screenOffControl = createScreenOffControl(screenOffNative());
  screenOffControl.apply(settings().screenOffSeconds);
  let frame = 0;
  let pendingHa: LightState | null = null;
  let sendHaAt = 0;
  let selftestSent = false;
  let lastHaError = "";

  const queueHa = (light: LightState) => {
    if (!configured) return;
    pendingHa = light;
    sendHaAt = frame + 6;
  };
  const adapters: Record<LightId, LightAdapter> = {
    desk: createLightAdapter("desk", "virtual", queueHa),
    shelf: createLightAdapter("shelf", "virtual", queueHa),
    onboard: createLightAdapter("onboard", "onboard", queueHa),
    remote: createLightAdapter("remote", "ha", queueHa),
  };

  const dispatch = (action: PanelAction, fromHa = false) => {
    const previous = state();
    const next = reducePanel(previous, action);
    if (next === previous) return;
    setState(next);
    if (fromHa) return;
    try {
      for (const lightId of changedLights(previous, next)) adapters[lightId].apply(next.lights[lightId]);
    } catch (error) {
      setState(previous);
      console.error(`[ha-panel] light update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const onNav = (event: NavEvent) => setRoute(navigate(route(), event));

  const rotate = (landscape: boolean) => {
    if (!savePanelState(encodeSession(state(), route(), settings())))
      console.warn("[ha-panel] native session snapshot rejected the update");
    if (!requestLandscape(landscape)) console.warn("[ha-panel] rotation binding rejected the update");
  };

  const onSettings = (action: SettingsAction) => {
    const previous = settings();
    const next = reduceSettings(previous, action);
    if (next === previous) return;
    if (action.type === "backlight") {
      if (next.backlight === null || !writeBacklight(next.backlight)) {
        console.warn("[ha-panel] backlight binding rejected the update");
        return;
      }
    } else {
      screenOffControl.apply(next.screenOffSeconds);
    }
    setSettings(next);
  };

  const publishCommand = (command: WorkerCommand): boolean => {
    const bytes = new Uint8Array(1024);
    encodeMessage(command, bytes);
    const accepted = commands.publish(bytes);
    if (!accepted) console.warn("[ha-panel] HA command queue is full");
    return accepted;
  };

  const configBytes = new Uint8Array(512);
  encodeMessage(config, configBytes);
  if (!configChannel.publish(configBytes)) throw new Error("HA config channel rejected the configuration");
  dispatch({ type: "ha", haConfigured: configured, haConnected: false, haLightConfigured: Boolean(config.lightEntityId) });
  dispatch({ type: "clock", clockEpochSeconds: readRtcSeconds(), clockSynced: false });
  console.log("[ha-panel] dashboard: home, lights, dimmer, settings");
  if (config.selftest) {
    dispatch({ type: "set-brightness", lightId: "onboard", brightness: 160 });
    dispatch({ type: "set-color", lightId: "onboard", hue: 210, saturation: 68 });
    console.log("[ha-panel] onboard RGB self-test hue=210");
  }

  onFrame(() => {
    frame += 1;
    if (config.selftest && frame === 60)
      dispatch({ type: "set-color", lightId: "onboard", hue: 0, saturation: 70 });
    for (const record of events.observe()) {
      const event = decodeMessage<WorkerEvent>(record.copy());
      if (event.type === "status") {
        dispatch({
          type: "ha",
          haConfigured: event.configured,
          haConnected: event.connected,
          haLightConfigured: Boolean(config.lightEntityId),
        });
        if (event.error !== lastHaError) {
          if (event.error) console.error(`[ha-panel] HA: ${event.error}`);
          lastHaError = event.error;
        }
        if (event.connected && config.selftest && config.lightEntityId && !selftestSent) {
          selftestSent = true;
          dispatch({ type: "set-brightness", lightId: "remote", brightness: 160 });
          dispatch({ type: "set-color", lightId: "remote", hue: 210, saturation: 68 });
          console.log("[ha-panel] mock light self-test requested");
        }
      } else if (event.type === "light") {
        dispatch({ type: "remote-light", light: event.light }, true);
      } else {
        dispatch({ type: "weather", weather: event.weather }, true);
      }
    }

    if (pendingHa && frame >= sendHaAt) {
      const light = pendingHa;
      if (publishCommand({ type: "light", light })) pendingHa = null;
      else sendHaAt = frame + 15;
    }
    if (frame % 30 === 0) {
      dispatch({
        type: "clock",
        clockEpochSeconds: readRtcSeconds(),
        clockSynced: syncNativeClock() === "synchronized",
      });
    }
    if (frame % 90 === 0) setNetwork(readNetwork());
  });

  const screen = () => {
    const current = route();
    if (current.kind === "dimmer")
      return <DimmerScreen state={state()} lightId={current.lightId} onAction={dispatch} onNav={onNav} />;
    if (current.kind === "provision")
      return <ProvisionScreen topic={current.topic} onNav={onNav} />;
    if (current.tab === "lights")
      return <LightsScreen state={state()} network={network()} onAction={dispatch} onNav={onNav} />;
    if (current.tab === "settings")
      return (
        <SettingsScreen
          state={state()}
          settings={settings()}
          network={network()}
          utcOffsetMinutes={utcOffsetMinutes}
          firmwareVersion={firmwareVersion}
          onSettings={onSettings}
          onNav={onNav}
          onRotate={() => rotate(true)}
        />
      );
    return (
      <HomeScreen
        state={state()}
        network={network()}
        utcOffsetMinutes={utcOffsetMinutes}
        onAction={dispatch}
        onNav={onNav}
      />
    );
  };

  if (landscape)
    return (
      <LandscapeScreen
        state={state()}
        route={route()}
        settings={settings()}
        network={network()}
        utcOffsetMinutes={utcOffsetMinutes}
        firmwareVersion={firmwareVersion}
        onAction={dispatch}
        onSettings={onSettings}
        onNav={onNav}
        onRotate={rotate}
      />
    );
  return (
    <View class="relative overflow-hidden" style={{ width: 400, height: 640, bgColor: theme.page }}>
      {screen()}
      {route().kind === "tab" ? <NavBar active={activeTab(route())} onNav={onNav} /> : null}
    </View>
  );
}

mount(() => <Panel />);
