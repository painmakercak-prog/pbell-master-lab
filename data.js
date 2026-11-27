/* PBell Master Lab V2.0  -  locked formula and trigger libraries.
   The master formula is byte-locked. Only BPM, the sample-trigger slot,
   and the optional uploaded-audio sentence may change. */
(function (global) {
  "use strict";

  var UPLOADED_SENTENCE = "Keep the uploaded sample loud and recognizable.";

  var MASTER_BEFORE_TRIGGER = "Raw underground Atlanta trap instrumental, ";
  var MASTER_AFTER_BPM = " BPM. Vintage ";
  var MASTER_AFTER_TRIGGER = " sample looping throughout, simple repetitive melody, gritty stripped-down production, hard knocking 808s, dirty sub bass, blunt punchy kicks, dry claps, basic ticking hi-hats with occasional fast rolls. Loose bouncy drum pocket, aggressive minimal trap rhythm, slightly unpolished bedroom producer sound, raw sampler texture. Very few instruments, no extra melodies, no elaborate arrangements. Heavy bass, simple drums, hypnotic repetitive loop, dark playful street energy.";

  var LYRICS = "[Instrumental]\n[Sample Intro]\n[Heavy Drum and 808 Drop]\n[Main Loop]\n[Minimal Drum Variation]\n[Main Loop]\n[Outro]";

  var EXCLUDE = "EDM, dubstep, pop, country, cinematic orchestration, layered synths, countermelodies, lush pads, complex arrangements, dramatic transitions, risers, excessive percussion, beat switches, vocals, vocal chops.";

  var CORE_CATEGORIES = [
    "Retro Gaming",
    "Soundfonts and Production",
    "Film and Television",
    "Experimental"
  ];

  var CORE_TRIGGERS = {
    "Retro Gaming": [
      "RuneScape-style MIDI",
      "GoldenEye 007 N64",
      "Perfect Dark N64",
      "Ocarina of Time soundfont",
      "Majora’s Mask MIDI",
      "Diablo II dungeon music",
      "Morrowind MIDI",
      "World of Warcraft Classic",
      "Silent Hill PS1",
      "Resident Evil save room",
      "Metal Gear Solid PS1",
      "Donkey Kong 64 soundfont",
      "Castlevania MIDI",
      "Doom 64 ambience",
      "PS2 BIOS menu music",
      "Nintendo DS soundfont",
      "Nintendo 64 menu music",
      "1990s dungeon crawler MIDI",
      "Japanese RPG battle music",
      "Vintage Japanese RPG MIDI",
      "Sega Genesis FM synth",
      "PS1 survival horror",
      "Japanese dungeon RPG"
    ],
    "Soundfonts and Production": [
      "General MIDI soundfont",
      "Roland Sound Canvas MIDI",
      "Microsoft GS Wavetable MIDI",
      "Yamaha OPL3 FM synthesis",
      "Amiga tracker music",
      "1990s ROMpler",
      "12-bit sampler",
      "Low-resolution PCM",
      "Casio preset melody",
      "Early wavetable synthesis",
      "Dungeon synth",
      "MIDI pizzicato strings",
      "FM mallet synthesis",
      "Detuned harpsichord",
      "Sampled orchestral stabs",
      "Vintage Casio keyboard",
      "Memphis cassette sample"
    ],
    "Film and Television": [
      "1970s Italian horror soundtrack",
      "1980s VHS horror synth",
      "1990s anime villain theme",
      "Soviet animation soundtrack",
      "Vintage Japanese commercial jingle",
      "1970s kung fu film soundtrack",
      "1970s European library music",
      "1990s wrestling entrance music",
      "Old television weather channel music",
      "1980s public access television music"
    ],
    "Experimental": [
      "Haunted carnival organ",
      "Vintage music box",
      "Children’s educational CD-ROM music",
      "Early internet flash game music",
      "Vintage Arabic keyboard melody",
      "Analog telephone hold music",
      "Medieval dungeon synth",
      "Abandoned amusement park music"
    ]
  };

  var DISCOVERY_AREAS = [
    "Obscure video game soundtracks",
    "Vintage computer soundfonts",
    "Forgotten synthesizers",
    "Film soundtrack aesthetics",
    "Regional instrumentation",
    "Unusual sampled instruments",
    "Retro television music",
    "Experimental digital textures"
  ];

  /* Seed ideas only. All start Untested with 0 generations. Separate from the core 58. */
  var DISCOVERY_TRIGGERS = {
    "Obscure video game soundtracks": [
      "Chrono Trigger SNES soundfont",
      "EarthBound Mother 2 soundtrack",
      "Streets of Rage 2 FM synth",
      "TurboGrafx-16 HuCard music",
      "Secret of Mana lunate harp"
    ],
    "Vintage computer soundfonts": [
      "AdLib OPL2 FM",
      "Sound Blaster AWE32",
      "Commodore 64 SID chip",
      "Atari ST YM2149",
      "Roland MT-32 General MIDI"
    ],
    "Forgotten synthesizers": [
      "Yamaha DX7 electric piano",
      "Roland D-50 digital native",
      "Korg M1 organ preset",
      "Casio CZ-101 phase distortion",
      "PPG Wave wavetable"
    ],
    "Film soundtrack aesthetics": [
      "1960s giallo soundtrack",
      "John Carpenter 1982 synth score",
      "1960s spy thriller soundtrack",
      "1970s nature documentary theme",
      "1980s Hong Kong action score"
    ],
    "Regional instrumentation": [
      "koto ostinato",
      "guzheng pluck loop",
      "mbira thumb piano",
      "gamelan metallophone",
      "oud plucked melody"
    ],
    "Unusual sampled instruments": [
      "toy piano cluster",
      "prepared piano pluck",
      "kalimba loop",
      "glass harmonica",
      "rusty tine thumb piano"
    ],
    "Retro television music": [
      "1980s news open theme",
      "1990s home shopping bed music",
      "1970s game show cue",
      "1980s weather bumper",
      "late-night infomercial bed"
    ],
    "Experimental digital textures": [
      "bitcrushed organ loop",
      "early tracker module arpeggio",
      "degraded MiniDisc skip",
      "12-bit sampler fold",
      "granular pitch-down bell"
    ]
  };

  var TIERS = [
    { value: "Untested", label: "Untested" },
    { value: "S", label: "S  Exceptional" },
    { value: "A", label: "A  Consistently fire" },
    { value: "B", label: "B  Usable" },
    { value: "C", label: "C  Inconsistent" },
    { value: "F", label: "F  Trash" }
  ];

  var DEFAULTS = {
    category: "Retro Gaming",
    trigger: "RuneScape-style MIDI",
    bpm: 150,
    minBpm: 100,
    maxBpm: 180,
    audioReference: true,
    weirdness: 50,
    styleInfluence: 50,
    audioInfluence: 50,
    variety: 0,
    maxMode: false
  };

  function triggerSlot(primary, fusion) {
    var a = String(primary || "").trim();
    var b = fusion && String(fusion).trim();
    if (b) return a + " and " + b;
    return a;
  }

  function buildStylePrompt(bpm, primary, fusion, uploaded) {
    var body =
      MASTER_BEFORE_TRIGGER +
      String(bpm) +
      MASTER_AFTER_BPM +
      triggerSlot(primary, fusion) +
      MASTER_AFTER_TRIGGER;
    if (uploaded) return body + " " + UPLOADED_SENTENCE + " Instrumental only.";
    return body + " Instrumental only.";
  }

  function allCoreEntries() {
    var list = [];
    CORE_CATEGORIES.forEach(function (cat) {
      CORE_TRIGGERS[cat].forEach(function (name) {
        list.push({ name: name, category: cat, source: "core" });
      });
    });
    return list;
  }

  function allDiscoveryEntries() {
    var list = [];
    DISCOVERY_AREAS.forEach(function (area) {
      DISCOVERY_TRIGGERS[area].forEach(function (name) {
        list.push({ name: name, category: area, source: "discovery" });
      });
    });
    return list;
  }

  global.PBELL_DATA = {
    UPLOADED_SENTENCE: UPLOADED_SENTENCE,
    LYRICS: LYRICS,
    EXCLUDE: EXCLUDE,
    CORE_CATEGORIES: CORE_CATEGORIES,
    CORE_TRIGGERS: CORE_TRIGGERS,
    DISCOVERY_AREAS: DISCOVERY_AREAS,
    DISCOVERY_TRIGGERS: DISCOVERY_TRIGGERS,
    TIERS: TIERS,
    DEFAULTS: DEFAULTS,
    CHAR_FLAG: 1000,
    triggerSlot: triggerSlot,
    buildStylePrompt: buildStylePrompt,
    allCoreEntries: allCoreEntries,
    allDiscoveryEntries: allDiscoveryEntries
  };
})(window);
