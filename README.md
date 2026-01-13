# OSC Great Master

A Stream Dock (AJAZZ Global / HotSpot StreamDock) plugin that sends **custom OSC** from:
- **Dial OSC Great Master** (knob): rotate left/right + press
- **Button OSC Great Master** (key): press to send **up to 4 OSC messages**

> Made for my own workflow with **AJAZZ AKP05E**.  
> I’m sharing it “as-is” for anyone who finds it useful — **no future support is promised**.

## Features

### Dial OSC Great Master (Knob)
- 3 OSC routes: **Left / Right / Press**
- Receiver modes:
  - **Same receiver**: one IP/Port for everything
  - **Different receivers**: per-message IP/Port fields
- Optional:
  - **Send ticks as value** (useful for encoder-style control)
  - **Tick multiplier** (scale the tick amount)

### Button OSC Great Master (Key)
- Sends **1–4 OSC messages** on **Down** or **Up** (selectable)
- Same/Different receiver modes (same idea as the dial)

## Compatibility
- ✅ Tested on **Windows** with **AJAZZ AKP05E** and *Stream Dock AJAZZ Global / HotSpot StreamDock*.
- ❓ Not sure it will work on other hardware or the official Elgato Stream Deck app.

## Install (step-by-step)
1. Download the plugin zip (`*.sdPlugin.zip`) from GitHub Releases.
2. **Double-click** the zip (Windows will install it into StreamDock).
3. Restart **StreamDock** (close and open again).
4. In StreamDock, find the category **OSC Great Master**.
5. Drag:
   - **Dial OSC Great Master** onto a **knob** slot, or
   - **Button OSC Great Master** onto a **button** slot.
6. Configure IP/Port + OSC paths from the **Property Inspector** (right panel).

## Tips / Troubleshooting
- Make sure the target software listens for **OSC over UDP** on the IP/Port you set.
- If nothing arrives:
  - Check Windows Firewall rules for your OSC receiver.
  - Verify you are on the correct network interface.
  - Try `127.0.0.1` only if the receiver runs on the same PC.

## Libraries / tech used
- JavaScript (Node runtime provided by StreamDock/AJAZZ)
- UDP via Node `dgram`
- WebSocket via `ws` (StreamDock plugin connection)

## License
MIT — free to use, modify, and redistribute. See `LICENSE`.
