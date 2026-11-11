import { createSignal } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { View } from "@pocketjs/framework/solid/components";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { worker } from "@pocketjs/framework/worker/channels";
import {
  actionConfigured,
  lightCommandForAction,
  lightStateCommand,
  mergeLightCommands,
} from "./console";
import { createLightAdapter, type LightAdapter } from "./devices";
import type { DimmerMode } from "./dimmer";
import type { HaLightCommand } from "./ha-request";
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
import {
  activeTab,
  INITIAL_ROUTE,
  navigate,
  type NavEvent,
  type Route,
} from "./navigation";
import { encodeMessage, decodeMessage } from "./protocol";
import { createScreenOffControl, createSettings, reduceSettings, type SettingsAction } from "./settings";
import { decodeSession, encodeSession, restorePanelState, restoreSettings } from "./session";
import { pageWindow, SHOWROOM, showroomAction } from "./showroom";
import { theme } from "./theme";
import type { PanelHaConfig, WorkerCommand, WorkerEvent } from "./protocol";
import { ArmScreen } from "./ui/arm-screen";
import { DimmerScreen } from "./ui/dimmer-screen";
import { HomeScreen } from "./ui/home-screen";
import { LandscapeScreen } from "./ui/landscape-screen";
import { NavBar } from "./ui/nav-bar";
import { ProvisionScreen } from "./ui/provision-screen";
import { SensorDetailScreen, SensorsScreen } from "./ui/sensors-screen";
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
  const [lightPage, setLightPage] = createSignal(0);
  const [sensorPage, setSensorPage] = createSignal(0);
  const [dimmerMode, setDimmerMode] = createSignal<DimmerMode>("brightness");
  const config: PanelHaConfig = readHaConfig();
  const utcOffsetMinutes = readUtcOffsetMinutes();
  const firmwareVersion = readFirmwareVersion();
  const landscape = readLandscape();
  const configured = config.baseUrl.length > 0 && config.token.length > 0 && !config.configError;
  const onboardLightId = SHOWROOM.lights.find(light => light.source === "onboard")?.key;
  const configChannel = worker.channel("ha-config");
  const entityMapChannel = worker.channel("ha-entity-map");
  const commands = worker.channel("ha-commands");
  const events = worker.channel("ha-events");
  const screenOffControl = createScreenOffControl(screenOffNative());
  screenOffControl.apply(settings().screenOffSeconds);
  let frame = 0;
  const pendingHa: Record<LightId, { light: LightState; command: HaLightCommand; seq: number; sendAt: number }> = {};
  const haSequences: Record<LightId, number> = {};
  const actionRuns: Record<string, number> = {};
  const actionFeedbackUntil: Record<string, number> = {};
  let selftestSent = false;
  let lastHaError = "";

  const isActionConfigured = (actionId: string) => actionConfigured(config, actionId);
  const queueHa = (lightId: LightId, light: LightState, command?: HaLightCommand) => {
    if (!configured) return;
    const seq = (haSequences[lightId] ?? 0) + 1;
    haSequences[lightId] = seq;
    const previous = pendingHa[lightId];
    const previousCommand = previous ? previous.command : undefined;
    const nextCommand = command ?? lightStateCommand(light);
    pendingHa[lightId] = {
      light,
      command: mergeLightCommands(previousCommand, nextCommand) ?? nextCommand,
      seq,
      sendAt: frame + 6,
    };
  };
  const adapters: Record<LightId, LightAdapter> = {};
  for (const light of SHOWROOM.lights)
    adapters[light.key] = createLightAdapter(light.key, light.source, (value, command) => queueHa(light.key, value, command));

  const dispatch = (action: PanelAction, fromHa = false): boolean => {
    const previous = state();
    const next = reducePanel(previous, action);
    if (next === previous) return true;
    setState(next);
    if (fromHa) return true;
    try {
      for (const lightId of changedLights(previous, next)) {
        const light = next.lights[lightId];
        const command = lightCommandForAction(action, light) ?? lightStateCommand(light);
        adapters[lightId].apply(light, command);
      }
      return true;
    } catch (error) {
      setState(previous);
      console.error(`[ha-panel] light update failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  const changePage = (target: "lights" | "sensors", direction: -1 | 1) => {
    if (target === "lights") {
      const next = pageWindow(state().lightOrder, lightPage() + direction, 4).page;
      setLightPage(next);
    } else {
      const next = pageWindow(state().sensorOrder, sensorPage() + direction, 4).page;
      setSensorPage(next);
    }
  };

  const onNav = (event: NavEvent) => {
    if (event.type === "page") {
      changePage(event.target, event.direction);
      return;
    }
    // The showroom has one controllable light: the 灯光 tab opens its dimmer directly.
    const next = event.type === "tab" && event.tab === "lights"
      ? { type: "open-dimmer" as const, lightId: SHOWROOM.home.lights[0]! }
      : event;
    if (next.type === "open-dimmer") setDimmerMode("brightness");
    setRoute(navigate(route(), next));
  };

  const onHaAction = (actionId: string, confirmed: boolean) => {
    const definition = showroomAction(actionId);
    if (!definition || !configured || !state().haConnected || !isActionConfigured(actionId)) return;
    delete actionFeedbackUntil[actionId];
    const runId = (actionRuns[actionId] ?? 0) + 1;
    actionRuns[actionId] = runId;
    if (publishCommand({ type: "action", actionId, runId, confirmed }))
      dispatch({ type: "action-result", actionId, status: "pending" });
    else {
      dispatch({ type: "action-result", actionId, status: "failed", error: "HA command queue is full" });
      if (definition.group === "arm") actionFeedbackUntil[actionId] = frame + 60;
    }
  };

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

  const { entityMap, ...wireConfig } = config;
  const configBytes = new Uint8Array(1024);
  encodeMessage(wireConfig, configBytes);
  if (!configChannel.publish(configBytes)) throw new Error("HA config channel rejected the configuration");
  const entityMapBytes = new Uint8Array(1024);
  encodeMessage(entityMap ?? null, entityMapBytes);
  if (!entityMapChannel.publish(entityMapBytes)) throw new Error("HA entity-map channel rejected the configuration");
  const haLightConfigured = () => Boolean(config.lightEntityId || Object.keys(config.entityMap?.lights ?? {}).length);
  dispatch({
    type: "ha",
    haConfigured: configured,
    haConnected: false,
    haLightConfigured: haLightConfigured(),
  });
  dispatch({ type: "clock", clockEpochSeconds: readRtcSeconds(), clockSynced: false });
  if (config.configError) console.error(`[ha-panel] HA config: ${config.configError}`);
  console.log("[ha-panel] dashboard: console, lights, sensors, arm, dimmer, settings");
  if (config.selftest && onboardLightId) {
    dispatch({ type: "set-brightness", lightId: onboardLightId, brightness: 160 });
    dispatch({ type: "set-color", lightId: onboardLightId, hue: 210, saturation: 68 });
    console.log("[ha-panel] onboard RGB self-test hue=210");
  }

  onFrame(() => {
    frame += 1;
    if (config.selftest && onboardLightId && frame === 60)
      dispatch({ type: "set-color", lightId: onboardLightId, hue: 0, saturation: 70 });
    for (const record of events.observe()) {
      const event: WorkerEvent = decodeMessage<WorkerEvent>(record.copy());
      if (event.type === "status") {
        dispatch({
          type: "ha",
          haConfigured: event.configured,
          haConnected: event.connected,
          haLightConfigured: haLightConfigured(),
        });
        if (!event.connected) {
          for (const lightId of Object.keys(pendingHa)) delete pendingHa[lightId];
        }
        if (event.error !== lastHaError) {
          if (event.error) console.error(`[ha-panel] HA: ${event.error}`);
          lastHaError = event.error;
        }
        const legacyId = state().legacyHaLightId;
        if (event.connected && config.selftest && config.lightEntityId && legacyId && !selftestSent) {
          selftestSent = true;
          dispatch({ type: "set-brightness", lightId: legacyId, brightness: 160 });
          dispatch({ type: "set-color", lightId: legacyId, hue: 210, saturation: 68 });
          console.log("[ha-panel] mock light self-test requested");
        }
      } else if (event.type === "light") {
        const legacyId = state().legacyHaLightId;
        if (legacyId) dispatch({ type: "entity-light", lightId: legacyId, light: event.light, updatedAt: readRtcSeconds() }, true);
      } else if (event.type === "entity-light") {
        dispatch({ type: "entity-light", lightId: event.lightId, light: event.light, updatedAt: readRtcSeconds() }, true);
      } else if (event.type === "sensor") {
        dispatch({
          type: "sensor",
          sensorId: event.sensorId,
          reading: { ...event.reading, updatedAt: event.reading.updatedAt ?? readRtcSeconds() },
        }, true);
      } else if (event.type === "entity-error") {
        dispatch({
          type: "entity-error",
          domain: event.domain,
          key: event.key,
          availability: event.availability,
          error: event.error,
        }, true);
      } else if (event.type === "action-result") {
        if (actionRuns[event.actionId] === event.runId) {
          dispatch({ type: "action-result", actionId: event.actionId, status: event.status, error: event.error }, true);
          if (showroomAction(event.actionId)?.group === "arm") actionFeedbackUntil[event.actionId] = frame + 60;
        }
      } else if (event.type === "weather") {
        dispatch({ type: "weather", weather: event.weather }, true);
      }
    }

    for (const [actionId, until] of Object.entries(actionFeedbackUntil)) {
      if (frame < until) continue;
      delete actionFeedbackUntil[actionId];
      dispatch({ type: "action-result", actionId, status: "idle" }, true);
    }

    for (const [lightId, pending] of Object.entries(pendingHa)) {
      if (!state().haConnected) {
        delete pendingHa[lightId];
        continue;
      }
      if (frame < pending.sendAt) continue;
      if (publishCommand({
        type: "entity-light",
        lightId,
        light: pending.light,
        command: pending.command,
        seq: pending.seq,
      }))
        delete pendingHa[lightId];
      else
        pending.sendAt = frame + 15;
    }
    if (frame % 30 === 0) {
      const now = readRtcSeconds();
      dispatch({
        type: "clock",
        clockEpochSeconds: now,
        clockSynced: syncNativeClock() === "synchronized",
      });
      dispatch({ type: "sensor-tick", nowSeconds: now }, true);
    }
    if (frame % 90 === 0) setNetwork(readNetwork());
  });
  const shared = () => ({
    state: state(),
    onNav,
  });

  const screen = () => {
    const current = route();
    if (current.kind === "dimmer")
      return (
        <DimmerScreen
          {...shared()}
          lightId={current.lightId}
          mode={dimmerMode()}
          onMode={setDimmerMode}
          onAction={dispatch}
        />
      );
    if (current.kind === "sensor")
      return <SensorDetailScreen {...shared()} sensorId={current.sensorId} />;
    if (current.kind === "arm")
      return (
        <ArmScreen
          state={state()}
          actionConfigured={isActionConfigured}
          onHaAction={onHaAction}
          onNav={onNav}
        />
      );
    if (current.kind === "provision")
      return (
        <ProvisionScreen
          topic={current.topic}
          network={network()}
          state={state()}
          onNav={onNav}
        />
      );
    if (current.tab === "sensors")
      return <SensorsScreen {...shared()} network={network()} page={sensorPage()} />;
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
        {...shared()}
        network={network()}
        utcOffsetMinutes={utcOffsetMinutes}
        onAction={dispatch}
        onHaAction={onHaAction}
        actionConfigured={isActionConfigured}
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
        lightPage={lightPage()}
        sensorPage={sensorPage()}
        utcOffsetMinutes={utcOffsetMinutes}
        firmwareVersion={firmwareVersion}
        onAction={dispatch}
        onSettings={onSettings}
        onNav={onNav}
        onHaAction={onHaAction}
        actionConfigured={isActionConfigured}
        onRotate={rotate}
        dimmerMode={dimmerMode()}
        onDimmerMode={setDimmerMode}
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
