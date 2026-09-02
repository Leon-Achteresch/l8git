export function getCurrentWindow() {
  return {
    onFocusChanged: async () => () => undefined,
    onCloseRequested: async () => () => undefined,
    onResized: async () => () => undefined,
    setTitle: async () => undefined,
    isFocused: async () => true,
    label: "main",
    setIgnoreCursorEvents: async () => undefined,
    setSize: async () => undefined,
    setPosition: async () => undefined,
    outerPosition: async () => ({ x: 0, y: 0 }),
    innerSize: async () => ({ width: 1280, height: 800 }),
    scaleFactor: async () => 1,
    close: async () => undefined,
    hide: async () => undefined,
    show: async () => undefined,
    setFocus: async () => undefined,
    isVisible: async () => true,
    listen: async () => () => undefined,
  };
}

export async function currentMonitor() {
  return {
    size: { width: 1920, height: 1080 },
    scaleFactor: 1,
    position: { x: 0, y: 0 },
  };
}

export class LogicalPosition {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

export class LogicalSize {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

export class PhysicalPosition {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

export class PhysicalSize {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}
