import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import type { PanelState } from "../model";
import type { NavEvent } from "../navigation";
import { sensorStatusText, SHOWROOM } from "../showroom";
import { agentText, armModeText, resultText, withFreshness } from "../telemetry";
import { theme } from "../theme";
import { ActionButton } from "./console-controls";
import { Divider, Icon, Pressable } from "./primitives";

interface ArmProps {
  state: PanelState;
  landscape?: boolean;
  actionConfigured(actionId: string): boolean;
  onHaAction(actionId: string, confirmed: boolean): void;
  onNav(event: NavEvent): void;
}

const ARM_ACTION_HEIGHT = 52;
const ARM_ACTION_GAP = 20;

function LandscapeArmScreen(props: ArmProps) {
  const armActions = SHOWROOM.actions.filter(action => action.group === "arm");
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 640, height: 400, bgColor: theme.page }}>
      <Pressable
        box={{ left: 0, top: 0, width: 250, height: 52 }}
        onTap={() => props.onNav({ type: "back" })}
      >
        <Icon name="back-text" left={16} top={14} size={24} />
        <Text class="absolute text-lg font-bold" style={{ insetL: 48, insetT: 14, width: 190, textColor: theme.text }}>机械臂操作</Text>
      </Pressable>
      <Text class="absolute text-xs" style={{ insetL: 24, insetT: 64, width: 592, textColor: theme.secondaryText }}>
        点击后由 Home Assistant 调用 KeyMesh
      </Text>
      <For each={armActions}>{(action, index) => (
        <ActionButton
          state={props.state}
          actionId={action.key}
          box={{ left: 24, top: 108 + index() * (ARM_ACTION_HEIGHT + ARM_ACTION_GAP), width: 592, height: ARM_ACTION_HEIGHT }}
          configured={props.actionConfigured(action.key)}
          onHaAction={props.onHaAction}
        />
      )}</For>
      <Text class="absolute text-xs" style={{ insetL: 24, insetT: 268, width: 592, textColor: theme.secondaryText }}>
        重力补偿 120 秒自动结束
      </Text>
      <Text class="absolute text-xs" style={{ insetL: 24, insetT: 292, width: 592, textColor: theme.secondaryText }}>
        动作回放：机械臂跳舞2
      </Text>
    </View>
  );
}

export function ArmScreen(props: ArmProps) {
  if (props.landscape === true) return <LandscapeArmScreen {...props} />;
  const statusBox = { left: 16, top: 72, width: 368, height: 164 };
  const actionsBox = { left: 16, top: 252, width: 368, height: 180 };
  const stopBox = { left: 16, top: 452, width: 368, height: 52 };
  const armActions = SHOWROOM.actions.filter(action => action.group === "arm" && props.actionConfigured(action.key));
  const agent = () => props.state.sensors["reachy-agent"]!;
  const result = () => props.state.sensors["reachy-result"]!;
  const arm = () => props.state.sensors["arm-mode"]!;
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 400, height: 640, bgColor: theme.page }}>
      <Pressable
        box={{ left: 0, top: 0, width: 250, height: 52 }}
        onTap={() => props.onNav({ type: "back" })}
      >
        <Icon name="back-text" left={16} top={14} size={24} />
        <Text class="absolute text-lg font-bold" style={{ insetL: 48, insetT: 14, width: 190, textColor: theme.text }}>机械臂状态</Text>
      </Pressable>
      <View class="absolute" style={{ insetL: statusBox.left, insetT: statusBox.top, width: statusBox.width, height: statusBox.height, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 14, width: 130, textColor: theme.secondaryText }}>Reachy agent</Text>
        <Text class="absolute text-sm font-bold text-right" style={{ insetL: 144, insetT: 12, width: statusBox.width - 158, textColor: theme.text }}>
          {withFreshness(agentText(agent()), agent(), props.state.sensorErrors["reachy-agent"])}
        </Text>
        <Divider left={14} top={44} width={statusBox.width - 28} />
        <Text class="absolute text-xs" style={{ insetL: 14, insetT: 58, width: 120, textColor: theme.secondaryText }}>机械臂模式</Text>
        <Text class="absolute text-2xl font-bold text-right" style={{ insetL: 134, insetT: 50, width: statusBox.width - 148, textColor: theme.primary }}>
          {armModeText(arm())}
        </Text>
        <Text class="absolute text-2xs text-right" style={{ insetL: 134, insetT: 82, width: statusBox.width - 148, textColor: theme.secondaryText }}>
          {sensorStatusText(arm(), props.state.sensorErrors["arm-mode"])}
        </Text>
        <Divider left={14} top={106} width={statusBox.width - 28} />
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 124, width: 62, textColor: theme.secondaryText }}>最近回执</Text>
        <Text class="absolute text-xs text-right" style={{ insetL: 80, insetT: 122, width: statusBox.width - 172, textColor: theme.text }}>
          {resultText(result())}
        </Text>
        <Text class="absolute text-2xs text-right" style={{ insetL: statusBox.width - 74, insetT: 142, width: 60, textColor: theme.secondaryText }}>
          {sensorStatusText(result(), props.state.sensorErrors["reachy-result"])}
        </Text>
      </View>
      <View class="absolute" style={{ insetL: actionsBox.left, insetT: actionsBox.top, width: actionsBox.width, height: actionsBox.height, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-sm font-bold" style={{ insetL: 14, insetT: 14, width: actionsBox.width - 28, textColor: theme.text }}>受保护动作</Text>
        {armActions.length === 0 ? (
          <>
            <Text class="absolute text-xs" style={{ insetL: 14, insetT: 58, width: actionsBox.width - 28, textColor: theme.secondaryText }}>未配置受保护动作</Text>
            <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 88, width: actionsBox.width - 28, textColor: theme.disabledText }}>仅展示状态，不发送机械臂命令</Text>
          </>
        ) : (
          <>
            <For each={armActions}>{(action, index) => (
              <ActionButton
                state={props.state}
                actionId={action.key}
                box={{ left: 14 + (index() % 2) * ((actionsBox.width - 20) / 2), top: 52, width: (actionsBox.width - 42) / 2, height: 52 }}
                configured
                onHaAction={props.onHaAction}
              />
            )}</For>
            <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 122, width: actionsBox.width - 28, textColor: theme.secondaryText }}>高风险动作需要长按确认</Text>
          </>
        )}
        <Text class="absolute text-2xs" style={{ insetL: 14, insetT: 150, width: actionsBox.width - 28, textColor: theme.disabledText }}>不会直发 KeyMesh 或 MQTT</Text>
      </View>
      <ActionButton
        state={props.state}
        actionId="reachy-stop"
        box={stopBox}
        configured={props.actionConfigured("reachy-stop")}
        onHaAction={props.onHaAction}
      />
      <Text class="absolute text-xs text-center" style={{ insetL: stopBox.left, insetT: stopBox.top + 64, width: stopBox.width, textColor: theme.secondaryText }}>
        STOP 仅停止 Reachy 讲解与播报
      </Text>
    </View>
  );
}
