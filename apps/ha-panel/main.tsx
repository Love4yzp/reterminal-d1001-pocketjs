import { createSignal } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { View } from "@pocketjs/framework/solid/components";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { worker } from "@pocketjs/framework/worker/channels";
import { ClockCard, SensorsCard, WeatherCard } from "./ui/cards";
import { LightsCard } from "./ui/lights";
import { createLightAdapter, type LightAdapter } from "./devices";
import {
  createInitialPanelState,
  reducePanel,
  type LightId,
  type LightState,
  type PanelAction,
  type PanelState,
} from "./model";
import { readHaConfig, readNativeSensors, readRtcSeconds, syncNativeClock } from "./native";
import { encodeMessage, decodeMessage } from "./protocol";
import { DEMO_WEATHER } from "./weather";
import type { PanelHaConfig, WorkerCommand, WorkerEvent } from "./protocol";

function Panel() {
  const [state, setState] = createSignal<PanelState>(createInitialPanelState());
  const config: PanelHaConfig = readHaConfig();
  const configured = config.baseUrl.length > 0 && config.token.length > 0;
  const configChannel = worker.channel("ha-config");
  const commands = worker.channel("ha-commands");
  const events = worker.channel("ha-events");
  let frame = 0;
  let pendingHa: LightState | null = null;
  let sendHaAt = 0;
  let selftestSent = false;
  let sensorLogged = false;
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
    if (action.type === "toggle-light" || action.type === "set-brightness" || action.type === "set-hue") {
      try {
        adapters[action.lightId].apply(next.lights[action.lightId]);
      } catch (error) {
        setState(previous);
        console.error(`[ha-panel] ${action.lightId} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
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
  dispatch({ type: "ha", haConfigured: configured, haConnected: false });
  dispatch({ type: "clock", clockEpochSeconds: readRtcSeconds(), clockSynced: false });
  dispatch({ type: "sensors", sensors: readNativeSensors() });
  console.log("[ha-panel] cards: clock, weather, lights, sensors");
  if (config.selftest) {
    dispatch({ type: "select-light", lightId: "onboard" });
    dispatch({ type: "set-brightness", lightId: "onboard", brightness: 160 });
    dispatch({ type: "set-hue", lightId: "onboard", hue: 210 });
    console.log("[ha-panel] onboard RGB self-test hue=210");
  }

  onFrame(() => {
    frame += 1;
    if (config.selftest && frame === 60)
      dispatch({ type: "set-hue", lightId: "onboard", hue: 0 });
    for (const record of events.observe()) {
      const event = decodeMessage<WorkerEvent>(record.copy());
      if (event.type === "status") {
        dispatch({ type: "ha", haConfigured: event.configured, haConnected: event.connected });
        if (event.error !== lastHaError) {
          if (event.error) console.error(`[ha-panel] HA: ${event.error}`);
          lastHaError = event.error;
        }
        if (event.connected && config.selftest && config.lightEntityId && !selftestSent) {
          selftestSent = true;
          dispatch({ type: "select-light", lightId: "remote" });
          dispatch({ type: "set-brightness", lightId: "remote", brightness: 160 });
          dispatch({ type: "set-hue", lightId: "remote", hue: 210 });
          console.log("[ha-panel] mock light self-test requested");
        }
      } else {
        dispatch({ type: "set-brightness", lightId: "remote", brightness: event.light.brightness }, true);
        dispatch({ type: "set-hue", lightId: "remote", hue: event.light.hue }, true);
        if (state().lights.remote.on !== event.light.on)
          dispatch({ type: "toggle-light", lightId: "remote" }, true);
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
    if (frame % 15 === 0) {
      const sample = readNativeSensors();
      dispatch({ type: "sensors", sensors: sample });
      if (sample && !sensorLogged) {
        sensorLogged = true;
        console.log(`[ha-panel] IMU chip=${sample.chipCelsius.toFixed(1)}C accel_z=${sample.acceleration.z.toFixed(2)}m/s2`);
      }
    }
    if (configured && frame % 900 === 0 && state().sensors) {
      publishCommand({ type: "sensors", sample: state().sensors! });
    }
  });

  return (
    <View class="relative overflow-hidden bg-[#0b1220]" style={{ width: 400, height: 640 }}>
      <ClockCard
        epoch={state().clockEpochSeconds}
        synced={state().clockSynced}
        haConfigured={state().haConfigured}
        haConnected={state().haConnected}
      />
      <WeatherCard weather={DEMO_WEATHER} />
      <LightsCard
        state={state()}
        haLightEnabled={configured && Boolean(config.lightEntityId)}
        onAction={dispatch}
      />
      <SensorsCard sample={state().sensors} />
    </View>
  );
}

mount(() => <Panel />);
