# Shure Wireless Systems & In-Ear Monitors - Companion Module

This is an enhanced Bitfocus Companion module for monitoring and controlling Shure professional wireless microphone systems and in-ear monitoring systems (including PSM1000) over an IP network.

---

## What This Module Can Do

This module provides two-way control, real-time status monitoring, dynamic variables, and custom graphical displays for Shure wireless microphone receivers and IEM transmitters over an IP network.

- **Wireless Microphone Systems**: Full monitoring and control for Axient Digital (AD4D, AD4Q), ANX4 Multi-Channel Receiver platform, ULX-D, QLX-D, SLX-D, and SLX-D+ systems.
- **In-Ear Monitoring Systems**: Full monitoring and control for PSM1000 (P10T dual-channel transmitter).
- **Real-Time Graphical Status Displays**: Custom button icons render live battery gauges, audio level meters, RF signal strength, antenna status, transmission locks, and encryption status.
- **Audio Control**: Adjust receiver channel audio gain in 1 dB steps, adjust PSM transmitter audio input level (-67 dB to 0 dB), perform relative software gain stepping (+X dB / -X dB), switch Line/Aux sensitivity, and mute or unmute audio.
- **RF and Frequency Management**: Tune frequencies directly across international frequency bands, switch transmission groups and channels, flash front-panel LEDs to locate hardware, select RF output power, and execute one-touch RF mute toggling per-channel or for all channels.
- **Transmitter & Receiver Telemetry**: Read transmitter models, device IDs, battery run times in hours and minutes, battery bar levels, battery cycle counts, health percentages, and PSM stereo audio input levels (L/R).
- **Dynamic Variables**: Hundreds of dynamic variables for channel state, telemetry, Dante network audio names, and hardware settings that can be displayed on any button or used in Companion triggers.
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

- Direct action to tune a receiver to any specific Group and Channel number using variable inputs, compatible across Axient Digital, ULX-D, QLX-D, SLX-D, and PSM1000.

### 6. Audio Peak and Clipping Alert Feedback

- Real-time boolean feedback that alerts operators when incoming audio reaches or exceeds a user-defined threshold in dBFS, or when the hardware audio peak indicator triggers.

### 7. Unified Support for Shure PSM1000 In-Ear Monitoring Systems

The standalone PSM1000 Companion module was limited and contained critical parsing bugs. This unified module incorporates complete, production-grade support for the **Shure PSM1000 (P10T)**:
- **Audio Input Level & Relative Stepping**: Set absolute input level (-67 dB to 0 dB) or adjust gain in software using dedicated Increment (+X dB) and Decrement (-X dB) actions.
- **Per-Channel and All-Channels RF Control**: Mute, unmute, or toggle RF transmission for Channel 1, Channel 2, or both channels simultaneously with instant visual feedback.
- **RF Output Power Selection**: Set transmission power levels (10 mW, 50 mW, 100 mW) per channel or across all channels.
- **Audio Transmission Modes & Line Sensitivity**: Set or toggle Audio TX Modes (Mono, Point-to-Point, Stereo) and Audio Input Line Level (Aux -10 dBV / Line +4 dBu).
- **Stereo Real-Time Metering & Peak Alerts**: Live Left/Right input level monitoring variables and configurable audio peak/clipping feedback.
- **Dynamic Variable Formatting**: Toggle between human-readable units (dB, MHz, mW) and raw numeric values.

### 8. Full Support for Shure ANX4 Multi-Channel Receiver Platform

Full integration for Shure's next-generation **ANX4 Multi-Channel Receiver**:
- **Massive Channel Scaling**: Supports up to **16 channels** in Axient Digital transmission mode and up to **24 channels** in ULX-D transmission mode, with 8 ShowLink transmitter slots per Axient Digital channel (up to 128 total ShowLink slots tracked).
- **Dynamic Channel Licensing & Availability**: Automatic polling and live variables for `number_channels_licensed` (0–24) and `available_channels` (reporting active, non-eclipsed channels when FD-C or Quadversity is in use).
- **Multi-Standard Transmission Modes**: Live discovery and variables for `transmission_mode` (`AD_STANDARD`, `AD_HIGH_DENSITY`, `ULXD_STANDARD`, `ULXD_HIGH_DENSITY`).
- **Antenna Configuration**: Per-channel selection and feedback for antenna distribution (`AUTOMATIC`, `AB`, `CD`, `QUADVERSITY`).
- **Plug-On Transmitter Controls (AD3 / ADX3)**:
  - **Phantom Power**: Remotely monitor and control transmitter phantom power (`Off`, `+12V`, `+48V`) via actions, feedbacks, variables, and button labels.
  - **High Pass Filter (HPF)**: Remotely monitor and control transmitter high-pass filter cutoffs (`Off`, `40 Hz`, `80 Hz`, `160 Hz`, `240 Hz`) via actions, feedbacks, variables, and button labels.
- **Expanded Transmitter Ecosystem**: Native support for AD3, ADX3, ADTD, ADTQ, and Q5X transmitters.

---

## Supported Hardware Models

| Family         | Model ID     | Description                                     | Channels | ShowLink Slots |
| -------------- | ------------ | ----------------------------------------------- | -------- | -------------- |
| Axient Digital | `ad4d`       | AD4D Dual Receiver                              | 2        | 8              |
| Axient Digital | `ad4q`       | AD4Q Quad Receiver                              | 4        | 8              |
| Axient Digital | `anx4`       | ANX4 Multi-Channel Receiver (16 AD / 24 ULX-D)  | 24       | 8              |
| ULX-D          | `ulxd4`      | ULXD4 Single Receiver                      | 1        | 0              |
| ULX-D          | `ulxd4d`     | ULXD4D Dual Receiver                       | 2        | 0              |
| ULX-D          | `ulxd4q`     | ULXD4Q Quad Receiver                       | 4        | 0              |
| QLX-D          | `qlxd4`      | QLXD4 Single Receiver                      | 1        | 0              |
| SLX-D          | `slxd4`      | SLXD4 Single Receiver                      | 1        | 0              |
| SLX-D          | `slxd4d`     | SLXD4D Dual Receiver                       | 2        | 0              |
| SLX-D+         | `slxd4plus`  | SLXD4+ Single Receiver                     | 1        | 0              |
| SLX-D+         | `slxd4dplus` | SLXD4D+ Dual Receiver                      | 2        | 0              |
| SLX-D+         | `slxd5`      | SLXD5 Portable Receiver                    | 1        | 0              |
| PSM            | `psm1000`    | PSM1000 Dual Transmitter (P10T)            | 2        | 0              |

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

### 9. PSM1000 RF Power Level Feedback Was Broken in Original Module

- **What Was Wrong**: In the standalone `companion-module-shure-psm1000`, the report processor checked `if (key == 'RF_TX_LEVEL')`, whereas Shure hardware sends `RF_TX_LVL`. As a result, the RF power variable never updated and feedback never triggered.
- **How It Was Fixed**: Corrected the command string key to match `RF_TX_LVL`, enabling real-time feedback and variable updates.

### 10. Multi-Word Name Truncation Bug in PSM Module

- **What Was Wrong**: In the standalone module, splitting incoming command strings by spaces dropped all words after the first space for channel names (e.g. "Lead Vox" became "Lead") and device names (e.g. "IEM Rack 1" became "IEM").
- **How It Was Fixed**: The unified module preserves all words in channel and device names using proper delimiter-aware joining.

### 11. Undefined Variable in PSM Meter Rate Report

- **What Was Wrong**: In the standalone module, the meter rate report handler assigned an uninitialized local variable `variable` and passed an undeclared variable ID `ch_x_meter`.
- **How It Was Fixed**: Meter rate is cleanly parsed, stored in channel state, and mapped to `ch_x_meter_rate`.

---

## Comprehensive Comparison: Shure ANX4 vs. Axient Digital (AD4D / AD4Q)

The Shure **ANX4 Multi-Channel Receiver** represents the evolution of Shure's flagship digital wireless platform. While it builds directly upon the proven command string architecture of **Axient Digital (AD4D and AD4Q)**, ANX4 introduces architectural, operational, and protocol advancements designed for large-scale enterprise, broadcast, and theatrical RF deployments.

### 1. Architectural Scaling & Dynamic Licensing

| Feature | Axient Digital (AD4D / AD4Q) | Shure ANX4 |
| :--- | :--- | :--- |
| **Chassis Channel Capacity** | Fixed 2 Channels (AD4D) or 4 Channels (AD4Q) | Up to **16 Channels** (AD mode) or **24 Channels** (ULX-D mode) |
| **Licensing Model** | Factory fixed hardware channel count | **Software-licensed channel tiering** (`NUMBER_CHANNELS_LICENSED` 00–24) |
| **Form Factor / Density** | 1RU rack mount per 2 or 4 channels | High-density centralized modular architecture |
| **Total ShowLink Slots** | 16 slots (AD4D) / 32 slots (AD4Q) | Up to **128 ShowLink transmitter slots** (16 AD channels × 8 slots) |

- **AD4D / AD4Q**: Channels are hardwired to physical receiver tuner circuits inside the 1RU chassis. A system needing 16 channels requires four AD4Q chassis, four network IP connections, and complex external RF antenna splitters.
- **ANX4**: Centralizes RF processing into a single IP endpoint managing up to 16 Axient Digital or 24 ULX-D simultaneous audio channels. The receiver reports licensed channel capacity dynamically over IP via `< GET NUMBER_CHANNELS_LICENSED >`. This Companion module automatically monitors `number_channels_licensed` so operators know available channel capacity.

### 2. Multi-Standard Transmission Modes & Hybrid Support

- **AD4D / AD4Q**: Dedicated exclusively to the Axient Digital RF waveform. Supports two transmission modes: `STANDARD` (optimum RF range and battery life) and `HIGH_DENSITY` (up to 47 channels per 6 MHz TV band).
- **ANX4**: A cross-platform hybrid receiver that natively demodulates both **Axient Digital** and **ULX-D** digital transmissions:
  - `AD_STANDARD`: Axient Digital standard mode (up to 16 channels).
  - `AD_HIGH_DENSITY`: Axient Digital high-density mode (up to 16 channels).
  - `ULXD_STANDARD`: ULX-D standard mode (up to 24 channels).
  - `ULXD_HIGH_DENSITY`: ULX-D high-density mode (up to 24 channels).
- In this module, the receiver variable `transmission_mode` provides live feedback of the current operating mode across all 4 modes.

### 3. Dynamic Channel Eclipsing & Channel Availability

In wireless systems utilizing advanced RF redundancy (such as **Frequency Diversity** or **Quadversity**), additional physical receiver circuits are required to demodulate redundant RF signals:

- **AD4Q**: Quadversity operates on fixed pairs (Channels 1 & 2 or Channels 3 & 4). When enabled, Channel 2 or Channel 4 is sacrificed, and the front panel disables that channel's controls.
- **ANX4**: Introduces **Channel Eclipsing**. When Quadversity or Frequency Diversity Combining (FD-C) is activated on an ANX4 channel, secondary physical channels are allocated internally to process the redundant antenna or carrier signals. These secondary channels are marked as "eclipsed" and removed from the active channel list.
- **Protocol Difference**: ANX4 introduces the `< GET AVAILABLE_CHANNELS >` command. The receiver returns a formatted list of un-eclipsed, active channel indices:
  ```
  < REP AVAILABLE_CHANNELS {1,2,3,4,5,6,7,9...} >
  ```
  *(In the example above, Channel 8 is eclipsed by Quadversity / FD-C operation on an earlier channel).*
- This Companion module parses and exposes `available_channels`, allowing control interfaces to hide or disable buttons for eclipsed channels automatically.

### 4. Antenna Matrix Architecture & Per-Channel Routing

- **AD4D / AD4Q**: Feature fixed physical BNC antenna inputs (A and B on AD4D; A, B, C, D on AD4Q). Quadversity is a global receiver mode toggle (`QUADVERSITY_MODE ON/OFF`) affecting paired channels 1+2 and 3+4.
- **ANX4**: Implements a flexible internal antenna distribution matrix. Each channel can be independently assigned to specific antenna pairs or Quadversity reception via `< SET/GET x ANTENNA_CONFIGURATION >`:
  - `AUTOMATIC`: System selects optimal antenna routing.
  - `AB`: Channel receives exclusively from Antenna Pair A/B.
  - `CD`: Channel receives exclusively from Antenna Pair C/D.
  - `QUADVERSITY`: Channel receives from all four antennas (A, B, C, and D) simultaneously for maximum RF reliability in harsh environments.
- This module provides direct actions, feedbacks, button display labels, and variables for `antenna_configuration`.

### 5. Plug-On Transmitter Support (AD3 & ADX3) with Remote ShowLink Control

ANX4 expands the supported transmitter family to include the Shure **AD3** (standard) and **ADX3** (ShowLink-enabled) plug-on transmitters used extensively in ENG, broadcast, and film production:

- **Transmitter Phantom Power**:
  - Remotely monitor and control phantom power supplied to condenser microphones connected to the plug-on transmitter.
  - States: `Off` (`0000`), `+12V` (`012`), and `+48V` (`048`).
  - Supported via direct channel queries (`TX_PHANTOM_POWER`), ShowLink slot control (`SLOT_PHANTOM_POWER`), dedicated Companion actions, button status labels, feedbacks, and dynamic variables.
- **Transmitter High-Pass Filter (HPF)**:
  - Remotely monitor and control low-cut rumble filtering directly on the transmitter.
  - Cutoff frequencies: `Off` (`000`), `40 Hz` (`040`), `80 Hz` (`080`), `160 Hz` (`160`), and `240 Hz` (`240`).
  - Supported via channel queries (`TX_HIGH_PASS_FILTER`), ShowLink slot actions (`SLOT_HIGH_PASS_FILTER`), button status labels, feedbacks, and dynamic variables.
- **Expanded Transmitter Model Lineup**:
  - AD4 original lineup: `AD1`, `AD2`, `ADX1`, `ADX1M`, `ADX2`, `ADX2FD`.
  - ANX4 enhanced lineup adds: `AD3`, `ADX3`, `ADTD` (dual-handheld transmitter), `ADTQ` (quad-channel handheld transmitter), and `Q5X` (specialty player mic transmitters).

### 6. Summary Comparison Matrix

| Capability | Axient Digital (AD4D / AD4Q) | ANX4 Platform |
| :--- | :--- | :--- |
| **Command Protocol** | Shure ASCII v2.0 (TCP Port 2202) | Shure ASCII v2.0 (TCP Port 2202) — Exact Superset |
| **Channel Count** | 2 or 4 channels | Up to 16 channels (AD) / 24 channels (ULX-D) |
| **Transmission Modes** | Standard, High Density | AD Standard, AD High Density, ULX-D Standard, ULX-D High Density |
| **Dynamic Channel Licensing** | Not applicable | Yes (`NUMBER_CHANNELS_LICENSED`) |
| **Channel Eclipsing Telemetry** | Not applicable | Yes (`AVAILABLE_CHANNELS`) |
| **Antenna Configuration** | Global Quadversity mode toggle | Per-channel routing (`AB`, `CD`, `AUTOMATIC`, `QUADVERSITY`) |
| **ShowLink Slots per Channel** | 8 slots | 8 slots per AD channel (up to 128 slots per chassis) |
| **ShowLink Slot Batch Query** | Slot by slot | Optimized multi-slot discovery (`SLOT_STATUS 0`) |
| **AD3 / ADX3 Plug-On Support** | Partial (unsupported in legacy docs) | Full: Remote Phantom Power (+12V/+48V) & HPF (40–240Hz) |
| **Specialty Transmitters** | Standard AD/ADX series | Native recognition for `ADTD`, `ADTQ`, `Q5X`, `AD3`, `ADX3` |
| **Dante Digital Audio** | Dual redundant ports (Dante / AES67) | High-capacity Dante / AES67 network interface |

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
