const DATA_TYPE = {
  FLOAT: 1,
  VEC2: 2,
  VEC3: 3,
  SHADER: 4,
  TEXTURE: 5,
};

const CONNECTION_STYLE = {
  DEFAULT: "default",
  DASHED: "dashed",
  DOTTED: "dotted",
  SOLID: "solid",
  STRAIGHT: "straight",
  CURVED: "curved",
};

const STATES = {
  IDLE: 0,
  SELECTING: 1,
  DRAGGING: 2,
};

const PORT_DIR = {
  INPUT: "input",
  OUTPUT: "output",
  BOTH: "both",
};

const NODE_TYPES = {
  FRAGMENT_SHADER: 2,
  VIEW: 3,
  CUSTOM: 4,
};

// Simple event emitter for vanilla JS
class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  off(event, listenerToRemove) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(
      (listener) => listener !== listenerToRemove,
    );
  }

  emit(event, data) {
    if (!this.events[event]) return;
    this.events[event].forEach((listener) => listener(data));
  }
}
const GUID = function () {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export {
  DATA_TYPE,
  CONNECTION_STYLE,
  STATES,
  PORT_DIR,
  NODE_TYPES,
  EventEmitter,
  GUID,
};
