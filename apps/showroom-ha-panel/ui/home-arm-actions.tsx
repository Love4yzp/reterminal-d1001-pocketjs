import { createSignal, For } from "solid-js";
import { View } from "@pocketjs/framework/solid/components";
import { onFrame } from "@pocketjs/framework/lifecycle";
import type { PanelState } from "../model";
import { SHOWROOM } from "../showroom";
import { theme } from "../theme";
import { ActionButton } from "./console-controls";
import type { Box } from "./primitives";

const HOME_ARM_ACTION_HEIGHT = 92;
const HOME_ARM_ACTION_GAP = 8;
const ARM_ACTIONS = SHOWROOM.actions.filter(action => action.group === "arm");

function ArmLoading(props: { box: Box }) {
  const [phase, setPhase] = createSignal(0);
  let frame = 0;
  onFrame(() => {
    frame += 1;
    if (frame % 6 === 0) setPhase(value => (value + 1) % 3);
  });
  return (
    <View
      class="absolute"
      style={{ insetL: props.box.left, insetT: props.box.top, width: props.box.width, height: props.box.height, radius: 12, bgColor: theme.card }}
    >
      <For each={[0, 1, 2]}>{index => (
        <View
          class="absolute"
          style={{
            insetL: props.box.width / 2 - 20 + index * 16,
            insetT: props.box.height / 2 - 4,
            width: 8,
            height: 8,
            radius: 4,
            bgColor: phase() === index ? theme.primary : theme.disabledText,
          }}
        />
      )}</For>
    </View>
  );
}

export function HomeArmActions(props: {
  state: PanelState;
  box: Box;
  landscape?: boolean;
  actionConfigured(actionId: string): boolean;
  onHaAction(actionId: string, confirmed: boolean): void;
}) {
  const ready = () => props.state.haConnected && ARM_ACTIONS.every(action => props.actionConfigured(action.key));
  const buttonBox = (actionId: string): Box => {
    const vertical = props.landscape === true;
    const index = vertical
      ? actionId === "arm-gravity" ? 1 : 0
      : actionId === "arm-gravity" ? 0 : 1;
    const width = vertical ? props.box.width : (props.box.width - HOME_ARM_ACTION_GAP) / 2;
    return {
      left: props.box.left + (vertical ? 0 : index * (width + HOME_ARM_ACTION_GAP)),
      top: props.box.top + (vertical ? index * (HOME_ARM_ACTION_HEIGHT + HOME_ARM_ACTION_GAP) : 0),
      width,
      height: HOME_ARM_ACTION_HEIGHT,
    };
  };
  return (
    <>
      {ready() ? (
        <For each={ARM_ACTIONS}>{action => (
          <ActionButton
            state={props.state}
            actionId={action.key}
            box={buttonBox(action.key)}
            configured
            onHaAction={props.onHaAction}
          />
        )}</For>
      ) : <ArmLoading box={props.box} />}
    </>
  );
}
