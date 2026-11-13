import { For } from "solid-js";
import { View } from "@pocketjs/framework/solid/components";
import type { Language } from "../i18n";
import type { PanelState } from "../model";
import { SHOWROOM } from "../showroom";
import { theme } from "../theme";
import { ActionButton } from "./console-controls";
import { LoadingDots } from "./loading-dots";
import type { Box } from "./primitives";

const HOME_ARM_ACTION_GAP = 8;
const ARM_ACTIONS = SHOWROOM.actions.filter(action => action.group === "arm");

function ArmLoading(props: { box: Box }) {
  return (
    <View
      class="absolute"
      style={{ insetL: props.box.left, insetT: props.box.top, width: props.box.width, height: props.box.height, radius: 12, bgColor: theme.card }}
    >
      <LoadingDots centerX={props.box.width / 2} centerY={props.box.height / 2} />
    </View>
  );
}

/** Portrait uses the full box height per button; landscape stacks two buttons inside it. */
function armButtonHeight(box: Box, landscape: boolean): number {
  return landscape ? (box.height - HOME_ARM_ACTION_GAP) / 2 : box.height;
}

export function HomeArmActions(props: {
  state: PanelState;
  language: Language;
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
    const height = armButtonHeight(props.box, vertical);
    const width = vertical ? props.box.width : (props.box.width - HOME_ARM_ACTION_GAP) / 2;
    return {
      left: props.box.left + (vertical ? 0 : index * (width + HOME_ARM_ACTION_GAP)),
      top: props.box.top + (vertical ? index * (height + HOME_ARM_ACTION_GAP) : 0),
      width,
      height,
    };
  };
  return (
    <>
      {ready() ? (
        <For each={ARM_ACTIONS}>{action => (
          <ActionButton
            state={props.state}
            language={props.language}
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
