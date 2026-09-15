# Shure Wireless Microphones - Companion Module

This is an enhanced Bitfocus Companion module for monitoring and controlling Shure professional wireless microphone systems over an IP network.

---

## What This Module Can Do

This module provides two-way control, real-time status monitoring, dynamic variables, and custom graphical displays for Shure wireless microphone receivers.

- **Real-Time Graphical Status Displays**: Custom button icons render live battery gauges, audio level meters, RF signal strength, antenna status, transmission locks, and encryption status.
- **Audio Control**: Adjust channel audio gain in 1 dB steps, increase or decrease gain, and mute or unmute receiver audio channels.
- **RF and Frequency Management**: Tune frequencies directly, switch transmission groups and channels, flash receiver front-panel LEDs to locate hardware, and monitor antenna diversity in real time.
- **Transmitter Monitoring**: Read transmitter models, device IDs, battery run times in hours and minutes, battery bar levels, battery cycle counts, and battery health percentages.
- **Dynamic Variables**: Over 600 dynamic variables for channel state, telemetry, Dante network audio names, and hardware settings that can be displayed on any button or used in Companion triggers.
- **Visual Feedbacks**: Change button background and text colors based on audio clipping, battery levels, RF mute state, transmitter power, interference detection, encryption errors, and lock states.

---

## Additions Over the Standard Bundled Module

This version includes major feature additions and improvements that are not present in the standard bundled Companion module:

### 1. Axient Digital Channel-Aware RF Mute and Unmute

- **Channel-Level RF Mute Action**: The standard module only permitted RF control through complex slot selections. This module introduces a direct `channel_rf_mute` action that remotely commands linked ADX transmitters to RF Mute or RF On over ShowLink by channel.
- **RF Mute Toggle**: Added one-touch toggle support to both channel RF mute and slot RF mute actions.
- **RF Muted Feedback**: Added a real-time boolean feedback (`channel_rf_muted`) to immediately alert operators with button color changes when a transmitter has its RF muted.
- **Graphic Icon Update**: Automatically reflects the RF mute state directly on the dynamic button display icon.

### 2. Full Support for the Shure SLX-D+ Family

The standard bundled module has no support for SLX-D+ receivers. This module adds full support for:

- **SLXD4+** (Single-Channel Receiver)
- **SLXD4D+** (Dual-Channel Receiver)
- **SLXD5** (Portable Receiver)
- **Remote Pairing Action**: Initiate Bluetooth Low Energy (BLE) pairing directly from a button press.
- **Remote Transmitter Reboot**: Reboot linked transmitters remotely over the wireless link.
- **Link Telemetry**: Live variables and feedbacks for link state, linked transmitter model, and battery runtime in minutes and formatted hours/minutes.
- **Encryption Controls**: Set manual or auto encryption modes, regenerate keys, and display encryption alerts.

### 3. Advanced Axient Digital Controls

- **Slot Audio Offset**: Adjust transmitter slot offset (-12 dB to +21 dB) with direct set, increment, and decrement actions.
- **Input Pad and Polarity**: Toggle or set transmitter input pad (0 dB / -12 dB) and audio polarity (positive / negative) for ADX1 and ADX1M transmitters.
- **Transmission Mode**: Switch between Standard Mode and High Density Mode with actions and feedbacks.
- **Quadversity and Diversity Telemetry**: Antenna levels for antennas C and D, Quadversity mode feedback, and Frequency Diversity mode indicators.
- **Signal Quality Alert**: Feedback that triggers if digital signal quality drops below a user-selected threshold.
- **Unregistered Transmitter Detection**: Alerts if an unrecognized transmitter attempts to sync to an active channel.

### 4. ULX-D System Controls and Network Audio

- **Front Panel Locks**: Remotely lock, unlock, or toggle Scan Lock and Sync Lock, with visual feedbacks.
- **High Density Mode**: Remotely toggle or set High Density mode.
- **Audio Summing and Frequency Diversity**: Select routing modes (1+2, 3+4, 1+2/3+4, 1+2+3+4) on multi-channel receivers.
- **Dante Network Names**: Live polling and variables for Dante device names and Dante channel names.
- **Transmitter Firmware Version**: Automatically queried and exposed as a variable for inventory and maintenance.

### 5. Unified Group and Channel Setting

- Direct action to tune a receiver to any specific Group and Channel number using variable inputs, compatible across Axient Digital, ULX-D, QLX-D, and SLX-D.

### 6. Audio Peak and Clipping Alert Feedback

- Real-time boolean feedback that alerts operators when incoming audio reaches or exceeds a user-defined threshold in dBFS, or when the hardware audio peak indicator triggers.

---

## Supported Hardware Models

| Family         | Model ID     | Description             | Channels | ShowLink Slots |
| -------------- | ------------ | ----------------------- | -------- | -------------- |
| Axient Digital | `ad4d`       | AD4D Dual Receiver      | 2        | 8              |
| Axient Digital | `ad4q`       | AD4Q Quad Receiver      | 4        | 8              |
| ULX-D          | `ulxd4`      | ULXD4 Single Receiver   | 1        | 0              |
| ULX-D          | `ulxd4d`     | ULXD4D Dual Receiver    | 2        | 0              |
| ULX-D          | `ulxd4q`     | ULXD4Q Quad Receiver    | 4        | 0              |
| QLX-D          | `qlxd4`      | QLXD4 Single Receiver   | 1        | 0              |
| SLX-D          | `slxd4`      | SLXD4 Single Receiver   | 1        | 0              |
| SLX-D          | `slxd4d`     | SLXD4D Dual Receiver    | 2        | 0              |
| SLX-D+         | `slxd4plus`  | SLXD4+ Single Receiver  | 1        | 0              |
| SLX-D+         | `slxd4dplus` | SLXD4D+ Dual Receiver   | 2        | 0              |
| SLX-D+         | `slxd5`      | SLXD5 Portable Receiver | 1        | 0              |

---

## Bugs Found in the Original Module and Fixes Made

During development and code auditing of the standard bundled module, several bugs were uncovered and corrected.

### 1. Slot RF Power Feedback Was Permanently Broken

- **What Was Wrong**: In the original module, the code tried to compare transmitter power levels by converting text choices like "LOW", "NORMAL", or "HIGH" into numbers using the JavaScript `parseInt()` function. Because words cannot be converted to numbers, this always returned `NaN` (Not a Number). Since a word never equals `NaN`, this feedback never turned on and was completely non-functional.
- **How It Was Fixed**: The code was changed to compare the text values directly without trying to turn words into numbers. The feedback now triggers as expected.

### 2. Action Input Validation Caused JavaScript Errors

- **What Was Wrong**: In the original code, the option validator tried to call a `.test()` method directly on text strings stored in the configuration. In JavaScript, text strings do not have a `.test()` function (only regular expression objects do). This could cause the module to crash with a `TypeError` or silently fail to validate user input.
- **How It Was Fixed**: The option parser was rewritten to detect whether validation data is a regular expression, a text pattern, or a number range, and handles all three correctly without crashing.

### 3. Option ID Name Collision in Group and Channel Action

- **What Was Wrong**: In the original action setup, the text input field for the channel number used the exact same identifier (`channel`) as the dropdown menu used to choose which receiver channel to change (`channel`). When the action ran, the channel number typed by the user overwrote the receiver channel selection.
- **How It Was Fixed**: Renamed the channel number input field to `channel_num` so both the selected receiver channel and the desired frequency channel number work independently.

### 4. Crash on Short or Error Packets from Receivers

- **What Was Wrong**: When processing incoming messages from the receiver, the original code checked if the second word started with `SLOT` without first checking if a second word existed. If the receiver sent a short message, a single-word message, or an error report like `< REP ERR >`, the module would crash with an unhandled exception: `Cannot read properties of undefined (reading 'startsWith')`.
- **How It Was Fixed**: Added safety checks to verify that words exist in the message before inspecting their contents.

### 5. Missing Bounds Checking on Slot Audio Offset

- **What Was Wrong**: The action to set slot audio offset took text input and sent it directly to the receiver without verifying whether the resulting number was within the -12 dB to +21 dB range supported by Shure hardware.
- **How It Was Fixed**: Added validation to verify that the calculated offset falls between 0 and 33 (-12 dB to +21 dB) before sending the command string to the receiver.

### 6. Frequency Regex Blocked International Frequency Bands

- **What Was Wrong**: The original frequency validation pattern strictly checked for US UHF frequencies between 470 MHz and 937 MHz. In Europe, Japan, and other regions, Shure systems also operate in 941–960 MHz, 1.2 GHz (1240–1260 MHz), and 1.5 GHz (1492–1525 MHz). The old pattern prevented users from entering valid operating frequencies outside North America.
- **How It Was Fixed**: Updated the pattern to accept any valid 3-digit or 4-digit megahertz frequency with three decimal places.

### 7. Missing Encryption Icon on SLX-D+

- **What Was Wrong**: While encryption was added as a selectable icon for SLX-D+ receivers, the icon generation code was not passing the encryption state to the image renderer, so the encryption lock badge never appeared on the button.
- **How It Was Fixed**: Updated the icon renderer to accept encryption status and draw the lock or alert badge when enabled on SLX-D+ units.

### 8. Inconsistent Newlines in Button Status Text

- **What Was Wrong**: In the Channel Status Display feedback, some status fields appended line breaks using raw newline characters (`\n`) while others used escaped newline characters (`\\n`). This caused inconsistent text wrapping on Companion buttons depending on the Companion version and operating system.
- **How It Was Fixed**: Standardized all status label line breaks to use the identical format throughout the file.

---

## Configuration Settings

- **Target IP**: The IP address of the Shure receiver.
- **Target Port**: Default is `2202`.
- **Model Type**: Select your receiver model from the dropdown.
- **Enable Metering**: Enables continuous background polling of audio and RF meters.
- **Metering Interval**: Rate in milliseconds at which the receiver sends meter updates (default is 5000 ms; recommended 500–5000 ms).
- **Variable Format**: Choose between "Include Units" (e.g. `+3 dB`, `470.200 MHz`) or "Numeric Only" (`3`, `470200`).

---

## License

MIT License. See [LICENSE](file:///Users/mattbell/Documents/Shure%20Companion%20Module/LICENSE) for details.
