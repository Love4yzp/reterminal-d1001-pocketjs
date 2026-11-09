#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
PORT=${D1001_PORT:-/dev/ttyACM0}
RUN=${1:-"$ROOT/.pocket-build/validation/manual-input/$(date +%Y%m%d-%H%M%S)"}
mkdir -p "$RUN"

if fuser "$PORT" >/dev/null 2>&1; then
  echo "串口被占用：$PORT" >&2
  exit 1
fi
. "$HOME/esp/esp-idf-6.2/export.sh" >/dev/null 2>&1
esptool --port "$PORT" chip-id

require() {
  local log=$1
  shift
  python - "$log" "$@" <<'PY'
import pathlib
import sys
text = pathlib.Path(sys.argv[1]).read_text(errors="replace")
missing = [value for value in sys.argv[2:] if value not in text]
if missing:
    raise SystemExit(f"missing evidence in {sys.argv[1]}: {missing}")
print(f"evidence PASS: {sys.argv[1]}")
PY
}

reject() {
  python - "$1" "$2" <<'PY'
import pathlib
import sys
text = pathlib.Path(sys.argv[1]).read_text(errors="replace")
if sys.argv[2] in text:
    raise SystemExit(f"unexpected evidence in {sys.argv[1]}: {sys.argv[2]}")
print(f"absence PASS: {sys.argv[1]}")
PY
}

capture() {
  local name=$1
  local seconds=$2
  shift 2
  echo
  echo "下一步：$*"
  read -r -p "准备好后按回车，立即开始操作并采集 ${seconds} 秒。" _
  python "$ROOT/tools/d1001-serial-capture.py" --port "$PORT" --seconds "$seconds" --output "$RUN/$name.log" &
  local pid=$!
  wait "$pid"
}

confirm() {
  local answer
  read -r -p "$1 [y/N] " answer
  case "$answer" in
    y|Y) ;;
    *) echo "人工验收失败" >&2; exit 1 ;;
  esac
}

capture timeout-30 45 "设置亮度40%、息屏30秒；等待息屏，触摸一次并松开，等待3秒。"
require "$RUN/timeout-30.log" "backlight=0 saved=40" "backlight=40 wake" "errors=0" "internal_dma"
confirm "唤醒触点没有触发app操作，且亮度恢复40%？"

capture timeout-60 75 "选择1分钟；等待息屏，触摸一次并松开。"
require "$RUN/timeout-60.log" "backlight=0" "wake" "errors=0"

capture timeout-300 315 "选择5分钟；等待息屏，触摸一次并松开。"
require "$RUN/timeout-300.log" "backlight=0" "wake" "errors=0"

capture timeout-never 70 "选择从不；保持无输入70秒，不得息屏；结束后选回1分钟。"
reject "$RUN/timeout-never.log" "backlight=0"
require "$RUN/timeout-never.log" "errors=0" "internal_dma"

capture hold-cancel 35 "按住GPIO3约1.5秒后松开；应出现亮屏反馈，但之后不得形成短按或双击。"
require "$RUN/hold-cancel.log" "GPIO3 hold feedback" "errors=0"
reject "$RUN/hold-cancel.log" "backlight=0"
confirm "1.5秒释放后没有息屏/旋转？"

capture hold-restart 45 "按住GPIO3满3秒；记录原因并重启后保持正常启动35秒以上。"
require "$RUN/hold-restart.log" "restart reason=GPIO3 hold 3000ms" "source=apps" "errors=0" "internal_dma"

capture rotate-single 45 "短按一次GPIO3；等待350ms双击窗口结束并启动横屏runtime 35秒以上。"
require "$RUN/rotate-single.log" "GPIO3 short click rotation requested" "orientation=landscape" "runtime rotated without chip reset" "raster 1280x800, logical 640x400" "errors=0"
confirm "横屏为左侧导航、四列灯卡的新布局，而非竖屏画面旋转？"

capture landscape-touch 35 "在横屏点击左侧灯光、长按第一盏灯并上下拖动调光。"
require "$RUN/landscape-touch.log" "touch landscape=1" "light=desk" "errors=0"
confirm "横屏导航、灯卡和调光触点与显示位置一致？"

capture rotate-return 45 "在横屏打开设置并点击返回竖屏；等待竖屏runtime启动35秒以上。"
require "$RUN/rotate-return.log" "orientation=portrait" "runtime rotated without chip reset" "raster 800x1280, logical 400x640" "errors=0"
confirm "设置页按钮已恢复原始竖屏布局？"

echo "人工输入验收完成；日志位于 $RUN"
