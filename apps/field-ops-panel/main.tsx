import { createSignal } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { View } from "@pocketjs/framework/solid/components";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { worker } from "@pocketjs/framework/worker/channels";
import { toggleLanguage } from "./i18n";
import { readLocalCache, readLocalOpsConfig, readLocalPrefs, writeLocalCache, writeLocalPrefs } from "./local-config";
import {
  canControl,
  createInitialOpsState,
  hasNewCriticalAlarm,
  modeLabel,
  setpointUnit,
  statusLedColor,
  type OpsState,
} from "./model";
import {
  readBacklight,
  readFirmwareVersion,
  readLandscape,
  readNetwork,
  readRtcSeconds,
  readUtcOffsetMinutes,
  requestLandscape,
  savePanelState,
  screenOffNative,
  setNativeRgb,
  syncNativeClock,
  takePanelState,
  writeBacklight,
} from "./native";
import { INITIAL_TAB, type Tab } from "./navigation";
import {
  decodeMessage,
  encodeMessage,
  type OpsProfileId,
  type OpsTelemetrySnapshot,
  type WorkerCommand,
  type WorkerEvent,
} from "./protocol";
import { decodeSession, encodeSession } from "./session";
import { createScreenOffControl, createSettings, reduceSettings, type SettingsAction } from "./settings";
import { getTheme, THEME_ORDER, type ThemeId } from "./theme";
import { AlarmsScreen } from "./ui/alarms-screen";
import { ControlScreen } from "./ui/control-screen";
import { LandscapeScreen } from "./ui/landscape-screen";
import { NavBar } from "./ui/nav-bar";
import { OverviewScreen } from "./ui/overview-screen";
import { StatusBar } from "./ui/status-bar";
import { SystemScreen } from "./ui/system-screen";
import { playOpsSound, pumpOpsAudio } from "./ui-sound";

function FieldOpsPanel() {
  const savedSession = decodeSession(takePanelState());
  const localPrefs = readLocalPrefs();
  const cached = readLocalCache();
  const opsConfig = readLocalOpsConfig();
  const configured = opsConfig.baseUrl.length > 0 && opsConfig.token.length > 0;
  const initialBacklight = readBacklight();
  const utcOffsetMinutes = readUtcOffsetMinutes();
  const firmwareVersion = readFirmwareVersion(savedSession?.language ?? localPrefs?.language ?? "zh");
  const landscape = readLandscape();

  const initialSettings = createSettings(initialBacklight);
  const restoredSettings = savedSession
    ? { ...initialSettings, screenOffSeconds: savedSession.screenOffSeconds }
    : initialSettings;

  const [tab, setTab] = createSignal<Tab>(savedSession?.tab ?? INITIAL_TAB);
  const [network, setNetwork] = createSignal(readNetwork(savedSession?.language ?? localPrefs?.language ?? "zh"));
  const [settings, setSettings] = createSignal(restoredSettings);
  const [state, setState] = createSignal<OpsState>(
    createInitialOpsState({
      configured,
      configError: opsConfig.configError ?? "",
      profileId: savedSession?.profileId ?? localPrefs?.profileId ?? opsConfig.profileId,
      staleAfterSeconds: opsConfig.staleAfterSeconds,
      themeId: savedSession?.themeId ?? localPrefs?.themeId ?? "cobalt",
      language: savedSession?.language ?? localPrefs?.language ?? "zh",
      muted: savedSession?.muted ?? localPrefs?.muted ?? false,
      cachedSnapshot: cached?.snapshot ?? null,
      cachedEpoch: cached?.receivedEpoch ?? null,
      clockEpochSeconds: readRtcSeconds(),
    }),
  );

  const screenOffControl = createScreenOffControl(screenOffNative());
  screenOffControl.apply(settings().screenOffSeconds);

  const configChannel = worker.channel("ops-config");
  const commandChannel = worker.channel("ops-commands");
  const eventChannel = worker.channel("ops-events");

  const theme = () => getTheme(state().themeId);
  let frame = 0;
  let lastLedKey = "";

  const updateLed = (nextState: OpsState) => {
    const color = statusLedColor(nextState);
    const key = color.join(",");
    if (key === lastLedKey) return;
    lastLedKey = key;
    setNativeRgb(color);
  };

  const persistPrefs = (nextState: OpsState) => {
    writeLocalPrefs({
      themeId: nextState.themeId,
      language: nextState.language,
      muted: nextState.muted,
      profileId: nextState.profileId,
    });
  };

  const publishConfig = (profileId: OpsProfileId) => {
    const bytes = new Uint8Array(512);
    encodeMessage({ ...opsConfig, profileId }, bytes);
    if (!configChannel.publish(bytes)) throw new Error("ops-config channel rejected configuration");
  };

  const sendCommand = (command: WorkerCommand): boolean => {
    const bytes = new Uint8Array(512);
    encodeMessage(command, bytes);
    return commandChannel.publish(bytes);
  };

  publishConfig(state().profileId);
  updateLed(state());

  const onRefresh = () => {
    sendCommand({ type: "poll" });
  };

  const onSelectTheme = (themeId: ThemeId) => {
    const next = { ...state(), themeId };
    setState(next);
    persistPrefs(next);
  };

  const onCycleTheme = () => {
    const idx = THEME_ORDER.indexOf(state().themeId);
    onSelectTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]!);
  };

  const onLanguageToggle = () => {
    const language = toggleLanguage(state().language);
    const next = { ...state(), language };
    setState(next);
    setNetwork(readNetwork(language));
    persistPrefs(next);
  };

  const onSelectProfile = (profileId: OpsProfileId) => {
    if (profileId === state().profileId) return;
    const next = {
      ...state(),
      profileId,
      dirtyDraft: false,
      pendingCommand: null,
      receipt: null,
    };
    setState(next);
    persistPrefs(next);
    sendCommand({ type: "set-profile", profileId });
  };

  const onToggleMute = () => {
    const next = { ...state(), muted: !state().muted };
    setState(next);
    persistPrefs(next);
  };

  const onCommit = () => {
    const cur = state();
    if (!canControl(cur)) return;
    const commandId = cur.nextCommandId;
    const ok = sendCommand({
      type: "setpoint",
      commandId,
      mode: cur.draftMode,
      targetKw: cur.draftTargetKw,
    });
    if (!ok) return;
    setState({
      ...cur,
      nextCommandId: commandId + 1,
      pendingCommand: {
        commandId,
        labelZh: `${modeLabel(cur.draftMode, cur.profileId, "zh")} ${cur.draftTargetKw} ${setpointUnit(cur.profileId)}`,
        labelEn: `${modeLabel(cur.draftMode, cur.profileId, "en")} ${cur.draftTargetKw} ${setpointUnit(cur.profileId)}`,
        startedFrame: frame,
      },
      receipt: null,
    });
  };

  const onAck = (alarmId: string) => {
    const cur = state();
    if (!canControl(cur)) return;
    const commandId = cur.nextCommandId;
    const ok = sendCommand({ type: "ack-alarm", commandId, alarmId });
    if (!ok) return;
    setState({
      ...cur,
      nextCommandId: commandId + 1,
      pendingCommand: {
        commandId,
        labelZh: `确认告警 ${alarmId}`,
        labelEn: `Ack ${alarmId}`,
        startedFrame: frame,
      },
    });
  };

  const onSettings = (action: SettingsAction) => {
    const prev = settings();
    const next = reduceSettings(prev, action);
    if (next === prev) return;
    if (action.type === "backlight") {
      if (next.backlight === null || !writeBacklight(next.backlight)) return;
    } else {
      screenOffControl.apply(next.screenOffSeconds);
    }
    setSettings(next);
  };

  const onRotate = (toLandscape: boolean) => {
    const cur = state();
    savePanelState(encodeSession(tab(), cur.themeId, cur.language, cur.profileId, cur.muted, settings()));
    requestLandscape(toLandscape);
  };

  onFrame(() => {
    frame += 1;
    pumpOpsAudio();

    for (const record of eventChannel.observe()) {
      const event = decodeMessage<WorkerEvent>(record.copy());
      const cur = state();
      if (event.type === "status") {
        const next: OpsState = {
          ...cur,
          configured: event.configured,
          connected: event.connected,
          error: event.error,
          pendingCommand: !event.connected ? null : cur.pendingCommand,
        };
        setState(next);
        updateLed(next);
      } else if (event.type === "summary") {
        if (event.summary.profileId !== cur.profileId) continue;
        const nowEpoch = cur.clockEpochSeconds ?? event.summary.updatedAtEpoch;
        const snap: OpsTelemetrySnapshot = {
          ...event.summary,
          alarms: cur.snapshot?.profileId === event.summary.profileId ? cur.snapshot.alarms : [],
        };
        writeLocalCache({ snapshot: snap, receivedEpoch: nowEpoch });
        const next: OpsState = {
          ...cur,
          connected: true,
          snapshot: snap,
          lastReceivedEpoch: nowEpoch,
          draftMode: cur.dirtyDraft ? cur.draftMode : snap.mode,
          draftTargetKw: cur.dirtyDraft ? cur.draftTargetKw : snap.targetKw,
        };
        setState(next);
        updateLed(next);
      } else if (event.type === "alarms-batch") {
        if (event.profileId !== cur.profileId || !cur.snapshot) continue;
        const nextAlarms = event.reset ? [...event.alarms] : [...cur.snapshot.alarms, ...event.alarms];
        const nextSnap: OpsTelemetrySnapshot = { ...cur.snapshot, alarms: nextAlarms };
        if (hasNewCriticalAlarm(cur.snapshot, nextSnap)) {
          playOpsSound("alarm", cur.muted);
        }
        const nowEpoch = cur.lastReceivedEpoch ?? cur.clockEpochSeconds ?? nextSnap.updatedAtEpoch;
        writeLocalCache({ snapshot: nextSnap, receivedEpoch: nowEpoch });
        const next: OpsState = { ...cur, snapshot: nextSnap };
        setState(next);
        updateLed(next);
      } else if (event.type === "command-result") {
        const matchesPending = cur.pendingCommand?.commandId === event.commandId;
        const next: OpsState = {
          ...cur,
          dirtyDraft: event.ok ? false : cur.dirtyDraft,
          pendingCommand: matchesPending ? null : cur.pendingCommand,
          receipt: { ok: event.ok, message: event.message, expiresFrame: frame + 180 },
        };
        setState(next);
        updateLed(next);
      }
    }

    const cur = state();
    if (cur.pendingCommand && frame - cur.pendingCommand.startedFrame > 450) {
      setState({
        ...cur,
        pendingCommand: null,
        receipt: { ok: false, message: "Timeout waiting for readback", expiresFrame: frame + 180 },
      });
    } else if (cur.receipt && frame > cur.receipt.expiresFrame) {
      setState({ ...cur, receipt: null });
    }

    if (frame % 30 === 0) {
      syncNativeClock();
      const clockEpochSeconds = readRtcSeconds();
      if (clockEpochSeconds !== state().clockEpochSeconds) {
        const next = { ...state(), clockEpochSeconds };
        setState(next);
        updateLed(next);
      }
    }
    if (frame % 90 === 0) setNetwork(readNetwork(state().language));
  });

  if (landscape) {
    return (
      <LandscapeScreen
        tab={tab()}
        state={state()}
        settings={settings()}
        network={network()}
        utcOffsetMinutes={utcOffsetMinutes}
        firmwareVersion={firmwareVersion}
        gatewayUrl={opsConfig.baseUrl}
        theme={theme()}
        onTab={setTab}
        onRefresh={onRefresh}
        onDraftMode={(draftMode) => setState({ ...state(), draftMode, dirtyDraft: true })}
        onDraftTarget={(draftTargetKw) => setState({ ...state(), draftTargetKw, dirtyDraft: true })}
        onCommit={onCommit}
        onAck={onAck}
        onToggleMute={onToggleMute}
        onSelectTheme={onSelectTheme}
        onSelectProfile={onSelectProfile}
        onLanguageToggle={onLanguageToggle}
        onCycleTheme={onCycleTheme}
        onSettings={onSettings}
        onRotate={onRotate}
      />
    );
  }

  return (
    <View class="relative overflow-hidden" style={{ width: 400, height: 640, bgColor: theme().page }}>
      <StatusBar
        width={400}
        state={state()}
        network={network()}
        theme={theme()}
        onLanguageToggle={onLanguageToggle}
        onCycleTheme={onCycleTheme}
      />
      {tab() === "control" ? (
        <ControlScreen
          state={state()}
          utcOffsetMinutes={utcOffsetMinutes}
          theme={theme()}
          onDraftMode={(draftMode) => setState({ ...state(), draftMode, dirtyDraft: true })}
          onDraftTarget={(draftTargetKw) => setState({ ...state(), draftTargetKw, dirtyDraft: true })}
          onCommit={onCommit}
        />
      ) : tab() === "alarms" ? (
        <AlarmsScreen
          state={state()}
          utcOffsetMinutes={utcOffsetMinutes}
          theme={theme()}
          onAck={onAck}
          onToggleMute={onToggleMute}
        />
      ) : tab() === "system" ? (
        <SystemScreen
          state={state()}
          settings={settings()}
          network={network()}
          firmwareVersion={firmwareVersion}
          gatewayUrl={opsConfig.baseUrl}
          theme={theme()}
          onSelectTheme={onSelectTheme}
          onSelectProfile={onSelectProfile}
          onLanguageToggle={onLanguageToggle}
          onSettings={onSettings}
          onRotate={onRotate}
        />
      ) : (
        <OverviewScreen
          state={state()}
          utcOffsetMinutes={utcOffsetMinutes}
          theme={theme()}
          onRefresh={onRefresh}
          onTab={setTab}
        />
      )}
      <NavBar
        active={tab()}
        language={state().language}
        unackedAlarms={state().snapshot ? state().snapshot!.alarms.filter(a => !a.acked).length : 0}
        theme={theme()}
        onSelect={setTab}
      />
    </View>
  );
}

mount(() => <FieldOpsPanel />);
