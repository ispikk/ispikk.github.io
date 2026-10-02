const phosphors = {
  P1: {
    tag: "green, medium",
    ink: "#5cff6a",
    note: "green. old scopes and radar",
    layers: [
      { color: "#5cff6a", weight: 0.88, tau: 0.009 },
      { color: "#5cff6a", weight: 0.12, tau: 0.045 }
    ]
  },
  P3: {
    tag: "amber, medium",
    ink: "#ffb52e",
    note: "amber terminals",
    layers: [
      { color: "#ffb52e", weight: 0.9, tau: 0.007 },
      { color: "#ffb52e", weight: 0.1, tau: 0.035 }
    ]
  },
  P4: {
    tag: "white, short",
    ink: "#f2efe6",
    note: "black and white tv, almost no afterglow",
    layers: [
      { color: "#c8d4ff", weight: 0.45, tau: 0.000015 },
      { color: "#fff0c8", weight: 0.55, tau: 0.00003 }
    ]
  },
  P7: {
    tag: "blue + yellow, long",
    ink: "#d6ff4a",
    note: "radar. blue flash, then yellow glow that hangs around for seconds",
    layers: [
      { color: "#8fa6ff", weight: 0.5, tau: 0.00002 },
      { color: "#d6ff4a", weight: 0.32, tau: 0.25 },
      { color: "#d6ff4a", weight: 0.18, tau: 1.6 }
    ]
  },
  P12: {
    tag: "orange, long",
    ink: "#ff8a24",
    note: "orange radar phosphor",
    layers: [
      { color: "#ff8a24", weight: 0.7, tau: 0.09 },
      { color: "#ff8a24", weight: 0.3, tau: 0.45 }
    ]
  },
  P19: {
    tag: "orange, very long",
    ink: "#ff9a33",
    note: "orange, glows forever",
    layers: [
      { color: "#ff9a33", weight: 0.55, tau: 0.3 },
      { color: "#ff9a33", weight: 0.45, tau: 2.2 }
    ]
  },
  P28: {
    tag: "yellow-green, long",
    ink: "#c7ff4a",
    note: "yellow-green radar",
    layers: [
      { color: "#c7ff4a", weight: 0.6, tau: 0.15 },
      { color: "#c7ff4a", weight: 0.4, tau: 0.9 }
    ]
  },
  P31: {
    tag: "green, short",
    ink: "#6bff8e",
    note: "normal oscilloscope green",
    layers: [
      { color: "#6bff8e", weight: 0.9, tau: 0.000016 },
      { color: "#6bff8e", weight: 0.09, tau: 0.0003 },
      { color: "#6bff8e", weight: 0.01, tau: 0.012 }
    ]
  },
  P39: {
    tag: "green, long",
    ink: "#7dff5c",
    note: "ibm 5151 green. long glow so 50hz mda doesnt flicker",
    layers: [
      { color: "#7dff5c", weight: 0.6, tau: 0.05 },
      { color: "#7dff5c", weight: 0.4, tau: 0.2 }
    ]
  }
};
