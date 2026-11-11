import {
  createApiProbeRequest,
  createGetEntityStateRequest,
  createGetWeatherRequest,
  createLightCommandRequest,
  createPressButtonRequest,
  createSetLightStateRequest,
  parseLightEntity,
  parseSensorEntity,
  type HaLightCommand,
  type HttpRequest,
} from "./ha-request";
import type { LightState } from "./model";
import {
  statusErrorText,
  type PanelHaConfig,
  type WorkerCommand,
  type WorkerEvent,
} from "./protocol";
import { SHOWROOM, showroomAction } from "./showroom";
import { parseWeatherEntity } from "./weather";

export interface HaResponse {
  code: number;
  body: string;
}

export type HaExecute = (request: HttpRequest) => Promise<HaResponse>;
export type HaPublish = (event: WorkerEvent) => void;

type Lane = "poll" | "command";

class SerialLanes {
  private tails: Record<Lane, Promise<void>> = {
    poll: Promise.resolve(),
    command: Promise.resolve(),
  };

  run<T>(lane: Lane, task: () => Promise<T>): Promise<T> {
    const result = this.tails[lane].then(task);
    this.tails[lane] = result.then(() => undefined, () => undefined);
    return result;
  }

  async idle(): Promise<void> {
    await Promise.all([this.tails.poll, this.tails.command]);
  }
}

// The ESP-Hosted transport on this factory image has a costly blocking HTTP
// receive. Poll showroom state every five minutes after the initial snapshot;
// direct UI commands still use the independent command lane immediately.
const LIGHT_RETRY_TICKS = 3_000;
const SENSOR_RETRY_TICKS = 3_000;
const ERROR_RETRY_TICKS = 300;
const HEARTBEAT_TICKS = 3_000;
const WEATHER_TICKS = 6_000;

export class HaEngine {
  private config: PanelHaConfig | undefined;
  private configured = false;
  private connected = false;
  private tickCount = 0;
  private epoch = 0;
  private heartbeatDue = 0;
  private heartbeatInFlight = false;
  private readonly lanes = new SerialLanes();
  private readonly inFlight = new Set<string>();
  private readonly due: Record<string, number> = {};
  private readonly revisions: Record<string, number> = {};
  private readonly commandPending: Record<string, number> = {};
  private readonly actionRuns: Record<string, number> = {};
  private readonly fallback: Record<string, LightState> = {};

  constructor(
    private readonly execute: HaExecute,
    private readonly publish: HaPublish,
  ) {}

  setConfig(config: PanelHaConfig): void {
    this.config = config;
    this.configured = config.baseUrl.length > 0 && config.token.length > 0 && !config.configError;
    this.connected = false;
    this.epoch += 1;
    this.heartbeatDue = 0;
    this.heartbeatInFlight = false;
    for (const key of Object.keys(this.due)) delete this.due[key];
    for (const key of Object.keys(this.revisions)) delete this.revisions[key];
    for (const key of Object.keys(this.commandPending)) delete this.commandPending[key];
    for (const key of Object.keys(this.actionRuns)) delete this.actionRuns[key];
    this.publishStatus(config.configError ?? "", true);
  }

  tick(): void {
    this.tickCount += 1;
    const config = this.config;
    if (!config || !this.configured) return;
    if (!this.heartbeatInFlight && this.tickCount >= this.heartbeatDue) void this.heartbeat();
    if (!this.connected) return;

    for (const lightId of this.lightIds()) this.pollLight(lightId);
    if (config.entityMap) {
      for (const sensorId of Object.keys(config.entityMap.sensors)) this.pollSensor(sensorId);
    }
    this.pollWeather();
  }

  command(command: WorkerCommand): Promise<void> {
    if (command.type === "action") return this.action(command.actionId, command.runId, command.confirmed === true);
    if (command.type === "light") {
      const lightId = "remote";
      const seq = (this.revisions[lightId] ?? 0) + 1;
      this.revisions[lightId] = seq;
      return this.setLight(lightId, command.light, seq, true);
    }
    return this.setLight(command.lightId, command.light, command.seq, false, command.command);
  }

  async idle(): Promise<void> {
    await this.lanes.idle();
  }

  private errorMessage(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    const token = this.config?.token;
    return statusErrorText(token ? text.split(token).join("<redacted>") : text);
  }

  private publishStatus(error = "", force = false): void {
    if (!force && this.lastStatus?.error === error && this.lastStatus.connected === this.connected &&
        this.lastStatus.configured === this.configured) return;
    this.lastStatus = { error, connected: this.connected, configured: this.configured };
    this.publish({ type: "status", configured: this.configured, connected: this.connected, error });
  }

  private lastStatus: { error: string; connected: boolean; configured: boolean } | undefined;

  private async heartbeat(): Promise<void> {
    const config = this.config;
    if (!config) return;
    const epoch = this.epoch;
    this.heartbeatInFlight = true;
    try {
      await this.lanes.run("poll", () => this.execute(createApiProbeRequest(config)));
      if (epoch !== this.epoch) return;
      this.connected = true;
      this.heartbeatDue = this.tickCount + HEARTBEAT_TICKS;
      this.publishStatus();
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.connected = false;
      this.heartbeatDue = this.tickCount + ERROR_RETRY_TICKS;
      this.publishStatus(this.errorMessage(error), true);
    } finally {
      this.heartbeatInFlight = false;
    }
  }

  private lightIds(): string[] {
    const config = this.config;
    if (!config) return [];
    const ids = new Set(Object.keys(config.entityMap?.lights ?? {}));
    if (config.lightEntityId) ids.add("remote");
    return [...ids];
  }

  private lightEntityId(lightId: string, legacy: boolean): string | undefined {
    const config = this.config;
    if (!config) return undefined;
    if (legacy) return config.lightEntityId;
    const mapped = config.entityMap?.lights[lightId];
    if (mapped) return mapped;
    return lightId === "remote" ? config.lightEntityId : undefined;
  }

  private setLight(
    lightId: string,
    light: LightState,
    seq: number,
    legacy: boolean,
    command?: HaLightCommand,
  ): Promise<void> {
    const config = this.config;
    if (!config || !this.configured) return Promise.resolve();
    if ((this.revisions[lightId] ?? 0) > seq) return Promise.resolve();
    this.revisions[lightId] = seq;
    this.fallback[lightId] = { ...light };
    const entityId = this.lightEntityId(lightId, legacy);
    const epoch = this.epoch;
    if (!entityId) {
      this.publishEntityError("light", lightId, "unavailable", "light entity is not configured");
      return Promise.resolve();
    }
    this.commandPending[lightId] = (this.commandPending[lightId] ?? 0) + 1;
    return this.lanes.run("command", async () => {
      try {
        const request = command
          ? createLightCommandRequest(config, entityId, command)
          : createSetLightStateRequest(config, light, entityId);
        await this.execute(request);
      } catch (error) {
        if (epoch === this.epoch && this.revisions[lightId] === seq)
          this.publishEntityError("light", lightId, "offline", this.errorMessage(error));
      } finally {
        if (epoch === this.epoch) {
          const pending = (this.commandPending[lightId] ?? 1) - 1;
          if (pending > 0) this.commandPending[lightId] = pending;
          else {
            delete this.commandPending[lightId];
            this.due[`light:${lightId}`] = 0;
          }
        }
      }
    });
  }

  private pollLight(lightId: string): void {
    const config = this.config;
    const entityId = this.lightEntityId(lightId, false);
    if (!config || !entityId) return;
    const key = `light:${lightId}`;
    if ((this.commandPending[lightId] ?? 0) > 0 ||
        this.inFlight.has(key) || this.tickCount < (this.due[key] ?? 0)) return;
    this.inFlight.add(key);
    const epoch = this.epoch;
    const revision = this.revisions[lightId] ?? 0;
    void this.lanes.run("poll", async () => {
      try {
        const response = await this.execute(createGetEntityStateRequest(config, entityId));
        if (epoch !== this.epoch || revision !== (this.revisions[lightId] ?? 0) || !this.connected) return;
        const fallback = this.fallback[lightId] ?? SHOWROOM.lights.find(light => light.key === lightId)?.initial ?? {
          on: false, brightness: 128, hue: 36, saturation: 70,
        };
        const light = parseLightEntity(response.body, fallback);
        if (!light) {
          this.publishEntityError("light", lightId, "unavailable", "light entity is unavailable or malformed");
          return;
        }
        this.fallback[lightId] = light;
        this.publish({ type: "entity-light", lightId, light });
        this.due[key] = this.tickCount + LIGHT_RETRY_TICKS;
      } catch (error) {
        if (epoch === this.epoch && revision === (this.revisions[lightId] ?? 0)) {
          if (this.connected) this.publishEntityError("light", lightId, "offline", this.errorMessage(error));
          this.due[key] = this.tickCount + ERROR_RETRY_TICKS;
        }
      } finally {
        this.inFlight.delete(key);
        const stale = epoch !== this.epoch || revision !== (this.revisions[lightId] ?? 0) || !this.connected;
        if (!stale && (this.due[key] ?? 0) === 0) this.due[key] = this.tickCount + LIGHT_RETRY_TICKS;
      }
    });
  }

  private pollSensor(sensorId: string): void {
    const config = this.config;
    const entityId = config?.entityMap?.sensors[sensorId];
    if (!config || !entityId) return;
    const key = `sensor:${sensorId}`;
    if (this.inFlight.has(key) || this.tickCount < (this.due[key] ?? 0)) return;
    this.inFlight.add(key);
    const epoch = this.epoch;
    void this.lanes.run("poll", async () => {
      try {
        const response = await this.execute(createGetEntityStateRequest(config, entityId));
        if (epoch !== this.epoch || !this.connected) return;
        const reading = parseSensorEntity(response.body);
        if (!reading) {
          this.publishEntityError("sensor", sensorId, "unavailable", "sensor entity is malformed");
        } else if (reading.status === "unavailable") {
          this.publish({
            type: "sensor",
            sensorId,
            reading: { value: null, status: "unavailable", updatedAt: null },
          });
        } else {
          this.publish({
            type: "sensor",
            sensorId,
            reading: { value: reading.value, status: "live", updatedAt: null },
          });
        }
        this.due[key] = this.tickCount + SENSOR_RETRY_TICKS;
      } catch (error) {
        if (epoch === this.epoch && this.connected)
          this.publishEntityError("sensor", sensorId, "offline", this.errorMessage(error));
        this.due[key] = this.tickCount + ERROR_RETRY_TICKS;
      } finally {
        this.inFlight.delete(key);
        if ((this.due[key] ?? 0) === 0) this.due[key] = this.tickCount + SENSOR_RETRY_TICKS;
      }
    });
  }

  private pollWeather(): void {
    const config = this.config;
    if (!config || this.inFlight.has("weather") || this.tickCount < (this.due.weather ?? 0)) return;
    this.inFlight.add("weather");
    const epoch = this.epoch;
    void this.lanes.run("poll", async () => {
      try {
        const response = await this.execute(createGetWeatherRequest(config));
        if (epoch === this.epoch && this.connected)
          this.publish({ type: "weather", weather: parseWeatherEntity(response.body) });
        this.due.weather = this.tickCount + WEATHER_TICKS;
      } catch {
        if (epoch === this.epoch && this.connected) this.publish({ type: "weather", weather: null });
        this.due.weather = this.tickCount + WEATHER_TICKS;
      } finally {
        this.inFlight.delete("weather");
      }
    });
  }

  private action(actionId: string, runId: number, confirmed: boolean): Promise<void> {
    const config = this.config;
    if (!config || !this.configured) return Promise.resolve();
    if ((this.actionRuns[actionId] ?? 0) > runId) return Promise.resolve();
    this.actionRuns[actionId] = runId;
    const definition = showroomAction(actionId);
    const entityId = config.entityMap?.actions[actionId];
    if (!definition || !entityId) {
      this.publishActionResult(actionId, runId, "failed", "action entity is not configured");
      return Promise.resolve();
    }
    if (definition.requiresHold && !confirmed) {
      this.publishActionResult(actionId, runId, "failed", "hold confirmation is required");
      return Promise.resolve();
    }
    const epoch = this.epoch;
    return this.lanes.run("command", async () => {
      try {
        await this.execute(createPressButtonRequest(config, entityId));
        if (epoch === this.epoch && this.actionRuns[actionId] === runId)
          this.publishActionResult(actionId, runId, "accepted", "");
      } catch (error) {
        if (epoch === this.epoch && this.actionRuns[actionId] === runId)
          this.publishActionResult(actionId, runId, "failed", this.errorMessage(error));
      }
    });
  }

  private publishActionResult(
    actionId: string,
    runId: number,
    status: "accepted" | "failed",
    error: string,
  ): void {
    this.publish({ type: "action-result", actionId, runId, status, error: statusErrorText(error) });
  }

  private publishEntityError(
    domain: "light" | "sensor",
    key: string,
    availability: "offline" | "unavailable",
    error: string,
  ): void {
    this.publish({ type: "entity-error", domain, key, availability, error: statusErrorText(error) });
  }
}
