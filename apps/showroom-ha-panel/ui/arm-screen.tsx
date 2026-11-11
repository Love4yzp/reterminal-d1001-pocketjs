import { For } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import type { PanelState } from "../model";
import type { NavEvent } from "../navigation";
import { SHOWROOM } from "../showroom";
import { theme } from "../theme";
import { ActionButton } from "./console-controls";
import { Icon, Pressable } from "./primitives";

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

function PortraitArmScreen(props: ArmProps) {
  const armActions = SHOWROOM.actions.filter(action => action.group === "arm");
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: 400, height: 640, bgColor: theme.page }}>
      <Pressable
        box={{ left: 0, top: 0, width: 250, height: 52 }}
        onTap={() => props.onNav({ type: "back" })}
      >
        <Icon name="back-text" left={16} top={14} size={24} />
        <Text class="absolute text-lg font-bold" style={{ insetL: 48, insetT: 14, width: 190, textColor: theme.text }}>机械臂操作</Text>
      </Pressable>
      <Text class="absolute text-xs" style={{ insetL: 16, insetT: 64, width: 368, textColor: theme.secondaryText }}>
        点击后由 Home Assistant 调用 KeyMesh
      </Text>
      <View class="absolute" style={{ insetL: 16, insetT: 96, width: 368, height: 136, radius: 12, bgColor: theme.card }}>
        <Text class="absolute text-xs font-bold" style={{ insetL: 14, insetT: 16, width: 140, textColor: theme.text }}>重力补偿</Text>
        <Text class="absolute text-xs text-right" style={{ insetL: 154, insetT: 16, width: 200, textColor: theme.secondaryText }}>120 秒自动结束</Text>
        <Text class="absolute text-xs font-bold" style={{ insetL: 14, insetT: 78, width: 140, textColor: theme.text }}>动作回放</Text>
        <Text class="absolute text-xs text-right" style={{ insetL: 154, insetT: 78, width: 200, textColor: theme.secondaryText }}>机械臂跳舞2</Text>
      </View>
      <For each={armActions}>{(action, index) => (
        <ActionButton
          state={props.state}
          actionId={action.key}
          box={{ left: 16, top: 288 + index() * (ARM_ACTION_HEIGHT + ARM_ACTION_GAP), width: 368, height: ARM_ACTION_HEIGHT }}
          configured={props.actionConfigured(action.key)}
          onHaAction={props.onHaAction}
        />
      )}</For>
    </View>
  );
}

export function ArmScreen(props: ArmProps) {
  return props.landscape === true ? <LandscapeArmScreen {...props} /> : <PortraitArmScreen {...props} />;
}
