import { mount } from "@pocketjs/framework/solid";
import { Image, Text, View } from "@pocketjs/framework/solid/components";

function Hello() {
  return (
    <View class="w-full h-full bg-slate-950 p-8 gap-6 flex-col">
      <Image src="block.svg" class="w-full h-32" />
      <Text class="text-2xl text-white font-bold">Hello D1001 M2</Text>
    </View>
  );
}

mount(() => <Hello />);
