import { createSignal } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { View } from "@pocketjs/framework/solid/components";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { worker } from "@pocketjs/framework/worker/channels";
import { createLightAdapter, type LightAdapter } from "./devices";
import {
  changedLights,
  createInitialPanelState,
  isLightAvailable,
  reducePanel,
  type LightId,
  type LightState,
  type PanelAction,
  type PanelState,
} from "./model";
import {
  createInputDisplayState,
  inputIntent,
  moveFocus,
  readInputSource,
  type FocusTarget,
  type InputEvent,
} from "./input";
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
  rowIntent,
  tileIntent,
  type NavEvent,
  type Route,
} from "./navigation";
import { encodeMessage, decodeMessage } from "./protocol";
import { sceneEffect, sceneRunStatus } from "./scenes";
import { createScreenOffControl, createSettings, reduceSettings, type SettingsAction } from "./settings";
import { decodeSession, encodeSession, restorePanelState, restoreSettings } from "./session";
import { pageWindow, SHOWROOM, slidingWindow } from "./showroom";
import { theme } from "./theme";
import type { PanelHaConfig, WorkerCommand, WorkerEvent } from "./protocol";
import { DimmerScreen } from "./ui/dimmer-screen";
import { HomeScreen } from "./ui/home-screen";
import { LandscapeScreen } from "./ui/landscape-screen";
import { LightsScreen } from "./ui/lights-screen";
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
  const [focus, setFocus] = createSignal<FocusTarget | null>(null);
  const [lightPage, setLightPage] = createSignal(0);
  const [sensorPage, setSensorPage] = createSignal(0);
  const inputSource = readInputSource();
  const [input, setInput] = createSignal(createInputDisplayState(Boolean(inputSource)));
  const config: PanelHaConfig = readHaConfig();
  const utcOffsetMinutes = readUtcOffsetMinutes();
  const firmwareVersion = readFirmwareVersion();
  const landscape = readLandscape();
  const configured = config.baseUrl.length > 0 && config.token.length > 0 && !config.configError;
  const onboardLightId = SHOWROOM.lights.find(light => light.source === "onboard")?.key;
  const configChannel = worker.channel("ha-config");
  const commands = worker.channel("ha-commands");
  const events = worker.channel("ha-events");
  const screenOffControl = createScreenOffControl(screenOffNative());
  screenOffControl.apply(settings().screenOffSeconds);
  let frame = 0;
  const pendingHa: Record<LightId, { light: LightState; seq: number; sendAt: number }> = {};
  const haSequences: Record<LightId, number> = {};
  const serviceRuns: Record<string, number> = {};
  let selftestSent = false;
  let lastHaError = "";

  const queueHa = (lightId: LightId, light: LightState) => {
    if (!configured) return;
    const seq = (haSequences[lightId] ?? 0) + 1;
    haSequences[lightId] = seq;
    pendingHa[lightId] = { light, seq, sendAt: frame + 6 };
  };
  const adapters: Record<LightId, LightAdapter> = {};
  for (const light of SHOWROOM.lights)
    adapters[light.key] = createLightAdapter(light.key, light.source, value => queueHa(light.key, value));

  const dispatch = (action: PanelAction, fromHa = false): boolean => {
    const previous = state();
    const next = reducePanel(previous, action);
    if (next === previous) return true;
    setState(next);
    if (fromHa) return true;
    try {
      for (const lightId of changedLights(previous, next)) adapters[lightId].apply(next.lights[lightId]);
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
    setFocus(null);
  };

  const onNav = (event: NavEvent) => {
    if (event.type === "page") {
      changePage(event.target, event.direction);
      return;
    }
    const next = navigate(route(), event);
    setRoute(next);
    if (event.type === "open-dimmer" || event.type === "open-sensor")
      setFocus(input().source === "touch" ? null : { kind: "back", id: "back" });
    else if (event.type !== "select-light" && event.type !== "cycle-light")
      setFocus(null);
  };

  const onScene = (sceneId: string) => {
    const effect = sceneEffect(state(), sceneId);
    // A future HA scene adapter can accept effect.entityId here. No current
    // worker command is reused or emitted for an unsupported scene.
    const applied = effect.type === "local" ? dispatch(effect.action) : false;
    dispatch({ type: "scene-result", sceneId, status: sceneRunStatus(effect, applied) });
  };

  const onFocus = (target: FocusTarget) => {
    setFocus(target);
    setInput({ ...input(), source: "touch", lastAction: "触摸" });
  };

  const controllableLights = (): LightId[] =>
    state().lightOrder.filter(lightId => isLightAvailable(state(), lightId));

  const focusTargets = (): FocusTarget[] => {
    const current = route();
    if (current.kind === "dimmer" || current.kind === "sensor" || current.kind === "provision")
      return [
        { kind: "back", id: "back" },
        ...(current.kind === "dimmer"
          ? slidingWindow(state().lightOrder, current.lightId, 4)
              .filter(lightId => isLightAvailable(state(), lightId))
              .map(lightId => ({ kind: "light" as const, id: lightId }))
          : []),
      ];
    if (current.tab === "home") return [
      ...SHOWROOM.home.lights.map(id => ({ kind: "light" as const, id })),
      ...SHOWROOM.home.sensors.map(id => ({ kind: "sensor" as const, id })),
      ...SHOWROOM.home.scenes.map(id => ({ kind: "scene" as const, id })),
    ];
    if (current.tab === "lights")
      return pageWindow(state().lightOrder, lightPage(), 4).items.map(id => ({ kind: "light" as const, id }));
    if (current.tab === "sensors")
      return pageWindow(state().sensorOrder, sensorPage(), 4).items.map(id => ({ kind: "sensor" as const, id }));
    return [];
  };

  const activateFocus = (details: boolean) => {
    const target = focus() ?? focusTargets()[0];
    if (!target) return;
    setFocus(target);
    if (target.kind === "back") {
      onNav({ type: "back" });
      return;
    }
    if (target.kind === "sensor") {
      onNav({ type: "open-sensor", sensorId: target.id });
      return;
    }
    if (target.kind === "scene") {
      if (!details) onScene(target.id);
      return;
    }
    const current = route();
    if (current.kind === "dimmer") {
      onNav({ type: "select-light", lightId: target.id, available: controllableLights() });
      return;
    }
    if (current.kind === "tab" && current.tab === "lights") {
      const next = rowIntent("row", target.id, controllableLights());
      if (next.nav) onNav(next.nav);
      return;
    }
    const next = tileIntent(details ? "long-press" : "tap", target.id, controllableLights());
    if (next.action) dispatch(next.action);
    if (next.nav) onNav(next.nav);
  };

  const onInput = (event: InputEvent) => {
    const intent = inputIntent(event);
    const label = event.source === "keyboard" ? event.key : event.button;
    setInput({ available: true, source: event.source, lastAction: label });
    if (!intent) return;
    switch (intent.type) {
      case "focus-next": setFocus(moveFocus(focusTargets(), focus(), 1)); break;
      case "focus-previous": setFocus(moveFocus(focusTargets(), focus(), -1)); break;
      case "activate": activateFocus(false); break;
      case "details": activateFocus(true); break;
      case "back": onNav({ type: "back" }); break;
      case "page-next":
      case "page-previous": {
        const current = route();
        const direction = intent.type === "page-next" ? 1 : -1;
        if (current.kind === "tab" && (current.tab === "lights" || current.tab === "sensors"))
          changePage(current.tab, direction);
        break;
      }
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

  const configBytes = new Uint8Array(4096);
  encodeMessage(config, configBytes);
  if (!configChannel.publish(configBytes)) throw new Error("HA config channel rejected the configuration");
  dispatch({ type: "ha", haConfigured: configured, haConnected: false, haLightConfigured: Boolean(config.lightEntityId) });
  dispatch({ type: "clock", clockEpochSeconds: readRtcSeconds(), clockSynced: false });
  console.log("[ha-panel] dashboard: home, lights, sensors, dimmer, settings");
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
        const legacyId = state().legacyHaLightId;
        if (event.connected && config.selftest && config.lightEntityId && legacyId && !selftestSent) {
          selftestSent = true;
          dispatch({ type: "set-brightness", lightId: legacyId, brightness: 160 });
          dispatch({ type: "set-color", lightId: legacyId, hue: 210, saturation: 68 });
          console.log("[ha-panel] mock light self-test requested");
        }
      } else if (event.type === "light") {
        const legacyId = state().legacyHaLightId;
        if (legacyId) dispatch({ type: "entity-light", lightId: legacyId, light: event.light }, true);
      } else if (event.type === "entity-light") {
        dispatch({ type: "entity-light", lightId: event.lightId, light: event.light }, true);
      } else if (event.type === "sensor") {
        dispatch({ type: "sensor", sensorId: event.sensorId, reading: event.reading }, true);
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
  inputSource?.subscribe(onInput);

  const shared = () => ({
    state: state(),
    focus: focus(),
    onFocus,
    onNav,
  });

  const screen = () => {
    const current = route();
    if (current.kind === "dimmer")
      return <DimmerScreen {...shared()} lightId={current.lightId} onAction={dispatch} />;
    if (current.kind === "sensor")
      return <SensorDetailScreen {...shared()} sensorId={current.sensorId} />;
    if (current.kind === "provision")
      return <ProvisionScreen topic={current.topic} onNav={onNav} />;
    if (current.tab === "lights")
      return <LightsScreen {...shared()} network={network()} page={lightPage()} onAction={dispatch} />;
    if (current.tab === "sensors")
      return <SensorsScreen {...shared()} network={network()} page={sensorPage()} />;
    if (current.tab === "settings")
      return (
        <SettingsScreen
          state={state()}
          settings={settings()}
          network={network()}
          input={input()}
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
        onScene={onScene}
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
        input={input()}
        lightPage={lightPage()}
        sensorPage={sensorPage()}
        focus={focus()}
        onFocus={onFocus}
        utcOffsetMinutes={utcOffsetMinutes}
        firmwareVersion={firmwareVersion}
        onAction={dispatch}
        onSettings={onSettings}
        onNav={onNav}
        onScene={onScene}
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
