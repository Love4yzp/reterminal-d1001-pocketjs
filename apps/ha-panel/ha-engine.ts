import {
  createActivateEntityRequest,
  createApiProbeRequest,
  createGetEntityStateRequest,
  createGetWeatherRequest,
  createSetLightStateRequest,
  parseLightEntity,
  parseSensorEntity,
  type HttpRequest,
} from "./ha-request";
import type { LightState } from "./model";
import {
  statusErrorText,
  type PanelHaConfig,
  type WorkerCommand,
  type WorkerEvent,
} from "./protocol";
import { SHOWROOM } from "./showroom";
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

const LIGHT_RETRY_TICKS = 50;
const SENSOR_RETRY_TICKS = 50;
const ERROR_RETRY_TICKS = 20;
const HEARTBEAT_TICKS = 100;
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
  private readonly serviceRuns: Record<string, number> = {};
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
    for (const key of Object.keys(this.serviceRuns)) delete this.serviceRuns[key];
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
    if (command.type === "service") return this.service(command.sceneId, command.runId);
    if (command.type === "light") {
      const lightId = "remote";
      const seq = (this.revisions[lightId] ?? 0) + 1;
      this.revisions[lightId] = seq;
      return this.setLight(lightId, command.light, seq, true);
    }
    return this.setLight(command.lightId, command.light, command.seq, false);
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
    if (config.entityMap) return Object.keys(config.entityMap.lights);
    return config.lightEntityId ? ["remote"] : [];
  }

  private lightEntityId(lightId: string, legacy: boolean): string | undefined {
    const config = this.config;
    if (!config) return undefined;
    if (legacy) return config.lightEntityId;
    if (config.entityMap) return config.entityMap.lights[lightId];
    return lightId === "remote" ? config.lightEntityId : undefined;
  }

  private setLight(lightId: string, light: LightState, seq: number, legacy: boolean): Promise<void> {
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
    return this.lanes.run("command", async () => {
      try {
        await this.execute(createSetLightStateRequest(config, light, entityId));
      } catch (error) {
        if (epoch === this.epoch && this.revisions[lightId] === seq)
          this.publishEntityError("light", lightId, "offline", this.errorMessage(error));
      } finally {
        if (epoch === this.epoch) this.due[`light:${lightId}`] = 0;
      }
    });
  }

  private pollLight(lightId: string): void {
    const config = this.config;
    const entityId = this.lightEntityId(lightId, false);
    if (!config || !entityId) return;
    const key = `light:${lightId}`;
    if (this.inFlight.has(key) || this.tickCount < (this.due[key] ?? 0)) return;
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
        if (epoch === this.epoch && revision === (this.revisions[lightId] ?? 0) && this.connected)
          this.publishEntityError("light", lightId, "offline", this.errorMessage(error));
        this.due[key] = this.tickCount + ERROR_RETRY_TICKS;
      } finally {
        this.inFlight.delete(key);
        if (this.due[key] === 0) this.due[key] = this.tickCount + LIGHT_RETRY_TICKS;
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
        if (this.due[key] === 0) this.due[key] = this.tickCount + SENSOR_RETRY_TICKS;
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

  private service(sceneId: string, runId: number): Promise<void> {
    const config = this.config;
    if (!config || !this.configured) return Promise.resolve();
    if ((this.serviceRuns[sceneId] ?? 0) > runId) return Promise.resolve();
    this.serviceRuns[sceneId] = runId;
    const entityId = config.entityMap?.scenes[sceneId];
    const epoch = this.epoch;
    if (!entityId) {
      this.publish({ type: "service-result", sceneId, runId, status: "failed", error: "service entity is not configured" });
      return Promise.resolve();
    }
    return this.lanes.run("command", async () => {
      try {
        await this.execute(createActivateEntityRequest(config, entityId));
        if (epoch === this.epoch && this.serviceRuns[sceneId] === runId)
          this.publish({ type: "service-result", sceneId, runId, status: "applied", error: "" });
      } catch (error) {
        if (epoch === this.epoch && this.serviceRuns[sceneId] === runId)
          this.publish({
            type: "service-result",
            sceneId,
            runId,
            status: "failed",
            error: this.errorMessage(error),
          });
      }
    });
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
