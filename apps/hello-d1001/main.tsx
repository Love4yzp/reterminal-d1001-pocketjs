import { mount } from "@pocketjs/framework/solid";
import { Text, View } from "@pocketjs/framework/solid/components";

function Hello() {
  return (
    <View class="w-full h-full bg-slate-950 p-8 gap-6 flex-col">
      <View class="w-full h-32 bg-cyan-400" />
      <Text class="text-2xl text-white font-bold">Hello D1001</Text>
      <Text class="text-lg text-cyan-300">PocketJS on reTerminal</Text>
      <Text class="text-sm text-slate-300">400 x 640 RGB565 / 2x presentation</Text>
      <View class="w-full h-32 bg-amber-400" />
    </View>
  );
}

mount(() => <Hello />);
