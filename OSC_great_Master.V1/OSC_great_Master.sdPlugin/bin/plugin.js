/* OSC great Master - StreamDock/StreamDeck-compatible plugin
 * Actions:
 *  - gptcom.oscremote.knobtriple : knob left/right/press OSC
 *  - gptcom.oscremote.quadpress  : key press sends up to 4 OSC messages
 */
const WebSocket = require("ws");
const dgram = require("dgram");
const fs = require("fs");
const path = require("path");

const ACTION_KNOB = "gptcom.oscremote.knobtriple";
const ACTION_QUAD = "gptcom.oscremote.quadpress";

function nowIso() { return new Date().toISOString(); }

function intVal(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function boolVal(v) { return v === true || v === "true" || v === 1 || v === "1"; }

function safeStr(v, def) {
  if (typeof v === "string" && v.length) return v;
  return def;
}

// --- OSC encoding (minimal) ---
function pad4(n) { return (4 - (n % 4)) % 4; }

function writePaddedString(str) {
  const b = Buffer.from(str + "\0", "utf8");
  const pad = pad4(b.length);
  return pad ? Buffer.concat([b, Buffer.alloc(pad)]) : b;
}

function writeInt32BE(num) {
  const b = Buffer.alloc(4);
  b.writeInt32BE(num, 0);
  return b;
}

function writeFloat32BE(num) {
  const b = Buffer.alloc(4);
  b.writeFloatBE(num, 0);
  return b;
}

function buildOscPacket(oscPath, args) {
  const pathBuf = writePaddedString(oscPath);
  let typeTag = ",";
  const argBufs = [];

  for (const a of (args || [])) {
    if (typeof a === "number" && Number.isFinite(a)) {
      if (Number.isInteger(a)) {
        typeTag += "i";
        argBufs.push(writeInt32BE(a));
      } else {
        typeTag += "f";
        argBufs.push(writeFloat32BE(a));
      }
    } else if (typeof a === "string") {
      typeTag += "s";
      argBufs.push(writePaddedString(a));
    } else if (typeof a === "boolean") {
      typeTag += a ? "T" : "F";
    } else if (a === null || a === undefined) {
      typeTag += "N";
    } else {
      // fallback to string
      typeTag += "s";
      argBufs.push(writePaddedString(String(a)));
    }
  }

  const typesBuf = writePaddedString(typeTag);
  return Buffer.concat([pathBuf, typesBuf, ...argBufs]);
}

// UDP sender (stateless)
function sendOsc(ip, port, oscPath, args, logger) {
  if (!oscPath || typeof oscPath !== "string") return;
  if (!ip || typeof ip !== "string") return;
  if (!port || port <= 0) return;

  const pkt = buildOscPacket(oscPath, args || []);
  const sock = dgram.createSocket("udp4");
  sock.send(pkt, port, ip, (err) => {
    if (err) logger && logger(`[OSC] ERROR send ${ip}:${port} ${oscPath} -> ${err.message}`);
    sock.close();
  });

  logger && logger(`[OSC] send ${ip}:${port} ${oscPath} args=${JSON.stringify(args || [])} bytes=${pkt.length}`);
}

// --- Logging ---
let logFile = null;
function initLog(pluginInfo) {
  try {
    const base = pluginInfo && pluginInfo.plugin ? pluginInfo.plugin.uuid : "osc-great-master";
    const logsDir = path.join(__dirname, "..", "logs");
    fs.mkdirSync(logsDir, { recursive: true });
    logFile = path.join(logsDir, "events.log");
    fs.appendFileSync(logFile, `\n--- start ${nowIso()} ---\n`);
  } catch (_) {}
}

function logLine(line) {
  try {
    if (logFile) fs.appendFileSync(logFile, line + "\n");
  } catch (_) {}
  console.log(line);
}

// --- Settings normalization ---
function normalizeKnobSettings(raw) {
  raw = raw || {};
  const receiverMode = safeStr(raw.receiverMode, "same");

  const globalIp = safeStr(raw.globalIp, safeStr(raw.clientAddress, safeStr(raw.ip, "127.0.0.1")));
  const globalPort = intVal(raw.globalPort ?? raw.clientPort ?? raw.port, 8000);

  const leftPath  = safeStr(raw.leftPath,  safeStr(raw.pathLeft, "/left"));
  const rightPath = safeStr(raw.rightPath, safeStr(raw.pathRight, "/right"));
  const pressPath = safeStr(raw.pressPath, safeStr(raw.pathPress, "/press"));

  const leftIp  = safeStr(raw.leftIp, "");
  const leftPort  = intVal(raw.leftPort, 0);
  const rightIp = safeStr(raw.rightIp, "");
  const rightPort = intVal(raw.rightPort, 0);
  const pressIp = safeStr(raw.pressIp, "");
  const pressPort = intVal(raw.pressPort, 0);

  const sendTicksAsValue = boolVal(raw.sendTicksAsValue);
  const tickMultiplier = intVal(raw.tickMultiplier, 1);

  return {
    receiverMode,
    globalIp, globalPort,
    leftPath, rightPath, pressPath,
    leftIp, leftPort, rightIp, rightPort, pressIp, pressPort,
    sendTicksAsValue,
    tickMultiplier: tickMultiplier === 0 ? 1 : tickMultiplier
  };
}

function pickTargetKnob(s, which) {
  if (s.receiverMode === "different") {
    if (which === "left" && s.leftIp && s.leftPort > 0) return { ip: s.leftIp, port: s.leftPort };
    if (which === "right" && s.rightIp && s.rightPort > 0) return { ip: s.rightIp, port: s.rightPort };
    if (which === "press" && s.pressIp && s.pressPort > 0) return { ip: s.pressIp, port: s.pressPort };
  }
  return { ip: s.globalIp, port: s.globalPort };
}

function normalizeQuadSettings(raw) {
  raw = raw || {};
  const sendOn = safeStr(raw.sendOn, "down");
  const receiverMode = safeStr(raw.receiverMode, "same");
  const globalIp = safeStr(raw.globalIp, "127.0.0.1");
  const globalPort = intVal(raw.globalPort, 8000);

  const out = {
    sendOn,
    receiverMode,
    globalIp, globalPort,
    m: []
  };

  for (let i = 1; i <= 4; i++) {
    const p = safeStr(raw[`m${i}Path`], "");
    const ip = safeStr(raw[`m${i}Ip`], "");
    const port = intVal(raw[`m${i}Port`], 0);
    out.m.push({ path: p, ip, port });
  }
  return out;
}

function pickTargetQuad(s, idx) {
  if (s.receiverMode === "different") {
    const m = s.m[idx];
    if (m && m.ip && m.port > 0) return { ip: m.ip, port: m.port };
  }
  return { ip: s.globalIp, port: s.globalPort };
}

// --- StreamDeck/StreamDock websocket client ---
let ws = null;
let uuid = null;

const settingsByContext = new Map();

function sendToSD(payload) {
  try {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
  } catch (_) {}
}

function onKnobRotate(msg) {
  const ctx = msg.context;
  const raw = (msg.payload && msg.payload.settings) ? msg.payload.settings : settingsByContext.get(ctx) || {};
  const s = normalizeKnobSettings(raw);

  const ticks = intVal(msg.payload && msg.payload.ticks, 0);
  if (!ticks) return;

  const which = ticks < 0 ? "left" : "right";
  const path = which === "left" ? s.leftPath : s.rightPath;
  const target = pickTargetKnob(s, which);

  // When left/right are separate OSC paths, most receivers expect a *positive*
  // step amount. So we send abs(ticks) here.
  const step = Math.abs(ticks) * s.tickMultiplier;
  const args = s.sendTicksAsValue ? [step] : [];
  sendOsc(target.ip, target.port, path, args, logLine);
}

function onKnobPress(msg) {
  const ctx = msg.context;
  const raw = (msg.payload && msg.payload.settings) ? msg.payload.settings : settingsByContext.get(ctx) || {};
  const s = normalizeKnobSettings(raw);
  const target = pickTargetKnob(s, "press");
  sendOsc(target.ip, target.port, s.pressPath, [], logLine);
}

function onQuadKey(msg) {
  const ctx = msg.context;
  const raw = (msg.payload && msg.payload.settings) ? msg.payload.settings : settingsByContext.get(ctx) || {};
  const s = normalizeQuadSettings(raw);

  const event = msg.event; // keyDown / keyUp
  const want = (s.sendOn === "up") ? "keyUp" : "keyDown";
  if (event !== want) return;

  for (let i = 0; i < 4; i++) {
    const path = s.m[i].path;
    if (!path) continue;
    const target = pickTargetQuad(s, i);
    sendOsc(target.ip, target.port, path, [], logLine);
  }
}

function handleMessage(msg) {
  // Track settings per context
  if (msg.event === "didReceiveSettings") {
    const ctx = msg.context;
    settingsByContext.set(ctx, (msg.payload && msg.payload.settings) ? msg.payload.settings : {});
    logLine(`[OSC] didReceiveSettings ctx=${ctx} ${JSON.stringify(settingsByContext.get(ctx))}`);
    return;
  }

  if (msg.event === "willAppear" && msg.context) {
    // keep latest settings snapshot
    if (msg.payload && msg.payload.settings) settingsByContext.set(msg.context, msg.payload.settings);
    return;
  }

  // Knob events
  if (msg.action === ACTION_KNOB) {
    if (msg.event === "dialRotate") return onKnobRotate(msg);
    if (msg.event === "dialDown") return onKnobPress(msg); // send on press-down only
  }

  // Key events
  if (msg.action === ACTION_QUAD) {
    if (msg.event === "keyDown" || msg.event === "keyUp") return onQuadKey(msg);
  }
}

function connect(inPort, inUuid, inRegisterEvent, inInfo) {
  uuid = inUuid;
  let infoObj = null;
  try { infoObj = JSON.parse(inInfo); } catch (_) {}
  initLog(infoObj);

  logLine(`[OSC] argv=${process.argv.join(" ")}`);
  ws = new WebSocket(`ws://localhost:${inPort}`);

  ws.on("open", () => {
    sendToSD({ event: inRegisterEvent, uuid });
    logLine(`[OSC] registered event=${inRegisterEvent} uuid=${uuid}`);
  });

  ws.on("message", (data) => {
    let msg = null;
    try { msg = JSON.parse(data); } catch (_) { return; }
    // echo raw messages for debugging (optional)
    if (msg && msg.event) {
      // keep log lighter than full spam
      if (msg.event === "dialRotate" || msg.event === "dialDown" || msg.event === "keyDown" || msg.event === "keyUp" || msg.event === "didReceiveSettings") {
        logLine(JSON.stringify(msg));
      }
    }
    handleMessage(msg);
  });

  ws.on("error", (err) => logLine(`[OSC] WS error: ${err.message}`));
  ws.on("close", () => logLine("[OSC] WS closed"));
}

// StreamDeck / StreamDock entrypoint
global.connectElgatoStreamDeckSocket = connect;

// Auto-start when executed as a script (Stream Deck / StreamDock launches node with args)
if (require.main === module) {
  try {
    const args = process.argv.slice(2);

    const getArg = (flag, defVal = undefined) => {
      const i = args.indexOf(flag);
      if (i === -1) return defVal;
      const v = args[i + 1];
      return (v === undefined || v.startsWith("-")) ? defVal : v;
    };

    const portStr = getArg("-port") ?? getArg("--port");
    const uuid = getArg("-pluginUUID") ?? getArg("--pluginUUID") ?? getArg("-uuid");
    const registerEvent = getArg("-registerEvent") ?? getArg("--registerEvent") ?? "registerPlugin";
    const infoStr = getArg("-info") ?? getArg("--info") ?? "{}";

    const port = parseInt(portStr, 10);
    const info = JSON.parse(infoStr);

    if (!Number.isFinite(port) || !uuid) {
      console.error("[OSC] Missing required args. argv=", process.argv.join(" "));
      // still init basic log to help debugging
      initLog({ plugin: { uuid: "gptcom.oscremote" } });
    } else {
      connect(port, uuid, registerEvent, info);
    }
  } catch (err) {
    console.error("[OSC] Auto-start failed:", err);
    try { initLog({ plugin: { uuid: "gptcom.oscremote" } }); } catch {}
  }
}
