#pragma once
// Compiled SynthDef binaries (SCgf v2), generated with sclang from:
//
//   SynthDef(\jws_sine, { |freq=440, amp=0.2, out=0, gate=1|
//       var env = EnvGen.kr(Env.asr(0.01, 1, 0.2), gate, doneAction: 2);
//       var sig = SinOsc.ar(freq) * amp * env;
//       Out.ar(out, sig ! 2);
//   });
//
// Sent to scsynth with /d_recv so the test tone works without sclang.
#include <cstdint>
#include <cstddef>

namespace johnwalls::johnwalls {

inline constexpr uint8_t kSynthDefJwsSine[] = {
    0x53, 0x43, 0x67, 0x66, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x08, 0x6a, 0x77, 0x73, 0x5f, 0x73,
    0x69, 0x6e, 0x65, 0x00, 0x00, 0x00, 0x08, 0x3f, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40,
    0x00, 0x00, 0x00, 0xc2, 0xc6, 0x00, 0x00, 0x3c, 0x23, 0xd7, 0x0a, 0x40, 0xa0, 0x00, 0x00, 0xc0,
    0x80, 0x00, 0x00, 0x3e, 0x4c, 0xcc, 0xcd, 0x00, 0x00, 0x00, 0x04, 0x43, 0xdc, 0x00, 0x00, 0x3e,
    0x4c, 0xcc, 0xcd, 0x00, 0x00, 0x00, 0x00, 0x3f, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x04,
    0x66, 0x72, 0x65, 0x71, 0x00, 0x00, 0x00, 0x00, 0x03, 0x61, 0x6d, 0x70, 0x00, 0x00, 0x00, 0x01,
    0x03, 0x6f, 0x75, 0x74, 0x00, 0x00, 0x00, 0x02, 0x04, 0x67, 0x61, 0x74, 0x65, 0x00, 0x00, 0x00,
    0x03, 0x00, 0x00, 0x00, 0x06, 0x07, 0x43, 0x6f, 0x6e, 0x74, 0x72, 0x6f, 0x6c, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x01, 0x01, 0x01, 0x01, 0x06, 0x45, 0x6e, 0x76,
    0x47, 0x65, 0x6e, 0x01, 0x00, 0x00, 0x00, 0x11, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff,
    0xff, 0xff, 0x00, 0x00, 0x00, 0x01, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff,
    0xff, 0xff, 0x00, 0x00, 0x00, 0x02, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x01, 0xff, 0xff,
    0xff, 0xff, 0x00, 0x00, 0x00, 0x02, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff,
    0xff, 0xff, 0x00, 0x00, 0x00, 0x03, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff,
    0xff, 0xff, 0x00, 0x00, 0x00, 0x04, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x05, 0xff, 0xff,
    0xff, 0xff, 0x00, 0x00, 0x00, 0x06, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x01, 0xff, 0xff,
    0xff, 0xff, 0x00, 0x00, 0x00, 0x07, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x05, 0xff, 0xff,
    0xff, 0xff, 0x00, 0x00, 0x00, 0x06, 0x01, 0x06, 0x53, 0x69, 0x6e, 0x4f, 0x73, 0x63, 0x02, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x01, 0x02, 0x0c, 0x42, 0x69, 0x6e, 0x61, 0x72,
    0x79, 0x4f, 0x70, 0x55, 0x47, 0x65, 0x6e, 0x02, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x02, 0x0c, 0x42, 0x69, 0x6e, 0x61, 0x72, 0x79, 0x4f, 0x70, 0x55, 0x47, 0x65, 0x6e,
    0x02, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x03, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x02, 0x03, 0x4f, 0x75, 0x74,
    0x02, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00
};
inline constexpr size_t kSynthDefJwsSineSize = sizeof(kSynthDefJwsSine);

inline constexpr const char* kVisualPatchLissajous = R"SC(
var width = 840, height = 620;
var win = Window("johnwalls.studio // SuperCollider Lissajous Phosphor Scope", Rect(120, 120, width, height), resizable: true).front;
var view;
var peak = -96.0, rms = -96.0, bpm = 120.0, ppq = 0.0, isPlaying = 0, bar = 1;
var lastNote = 60, lastVel = 0, noteTime = 0.0;
var phase = 0.0, freqRatioX = 1.0, freqRatioY = 2.0;

win.background = Color(0.03, 0.04, 0.06);
win.onClose = { 0.exit; };

view = UserView(win, Rect(0, 0, width, height));
view.resize = 5;
view.background = Color(0.02, 0.03, 0.05);

~jws[\onAudio].value({ |pDb, rDb, b, p, playing, barNum|
    peak = pDb.asFloat;
    rms = rDb.asFloat;
    bpm = b.asFloat;
    ppq = p.asFloat;
    isPlaying = playing.asInteger;
    bar = barNum.asInteger;
});

~jws[\onNote].value({ |note, vel, inst|
    lastNote = note.asInteger;
    lastVel = vel.asInteger;
    noteTime = Process.elapsedTime;
    freqRatioX = (lastNote % 7) + 1;
    freqRatioY = ((lastNote div: 7) % 5) + 2;
});

view.drawFunc = { |v|
    var bounds = v.bounds;
    var w = bounds.width, h = bounds.height;
    var cx = w * 0.5, cy = h * 0.5;
    var linRms = ((rms + 60.0) / 60.0).clip(0.0, 1.0);
    var linPeak = ((peak + 60.0) / 60.0).clip(0.0, 1.0);
    var amp = linRms.linexp(0.001, 1.0, 14.0, min(cx, cy) * 0.82);
    var numPts = 320;
    var noteAge = Process.elapsedTime - noteTime;
    var noteFlash = (1.0 - (noteAge * 4.0)).clip(0.0, 1.0) * (lastVel / 127.0);

    Pen.push;

    // Reticle
    Pen.strokeColor = Color(0.12, 0.16, 0.22, 0.4);
    Pen.width = 1.0;
    Pen.line(Point(0, cy), Point(w, cy));
    Pen.line(Point(cx, 0), Point(cx, h));
    Pen.stroke;

    // Lissajous outer phosphor bloom
    phase = phase + (0.025 * (bpm / 120.0));
    Pen.strokeColor = Color(0.9, 0.69, 0.18, (linPeak * 0.45 + 0.2 + (noteFlash * 0.35)).clip(0.0, 1.0));
    Pen.width = 3.2 + (noteFlash * 2.5);
    Pen.beginPath;
    numPts.do { |i|
        var theta = (i / numPts) * 2pi;
        var px = cx + (sin(theta * freqRatioX + phase) * amp);
        var py = cy + (cos(theta * freqRatioY + (phase * 1.33)) * amp);
        if (i == 0) { Pen.moveTo(Point(px, py)) } { Pen.lineTo(Point(px, py)) };
    };
    Pen.stroke;

    // Lissajous core sharp beam
    Pen.strokeColor = Color(1.0, 0.96, 0.88, (linPeak * 0.8 + 0.25).clip(0.0, 1.0));
    Pen.width = 1.2;
    Pen.beginPath;
    numPts.do { |i|
        var theta = (i / numPts) * 2pi;
        var px = cx + (sin(theta * freqRatioX + phase) * amp);
        var py = cy + (cos(theta * freqRatioY + (phase * 1.33)) * amp);
        if (i == 0) { Pen.moveTo(Point(px, py)) } { Pen.lineTo(Point(px, py)) };
    };
    Pen.stroke;

    // Telemetry text
    Pen.fillColor = Color(0.9, 0.69, 0.18, 0.85);
    Pen.stringAtPoint("JOHNWALLS.STUDIO // SUPERCOLLIDER LISSAJOUS PHOSPHOR SCOPE", Point(16, 16), Font("Monaco", 11));
    Pen.fillColor = Color(0.65, 0.75, 0.85, 0.75);
    Pen.stringAtPoint(
        format("BPM: % | BAR: % | PPQ: % | RMS: % dB | PEAK: % dB | NOTE: %",
            bpm.round(0.1), bar, ppq.round(0.01), rms.round(0.1), peak.round(0.1), lastNote),
        Point(16, 32),
        Font("Monaco", 10)
    );

    Pen.pop;
};
view.animate = true;
view.frameRate = 60;
)SC";

inline constexpr const char* kVisualPatchVectorCascade = R"SC(
var width = 840, height = 620;
var win = Window("johnwalls.studio // SuperCollider Vector Cascade (Particle Cloud)", Rect(140, 140, width, height), resizable: true).front;
var view;
var peak = -96.0, rms = -96.0, bpm = 120.0, ppq = 0.0, isPlaying = 0, bar = 1;
var lastNote = 60, lastVel = 0;
var particles = List.new;

win.background = Color(0.02, 0.02, 0.04);
win.onClose = { 0.exit; };

view = UserView(win, Rect(0, 0, width, height));
view.resize = 5;
view.background = Color(0.02, 0.02, 0.04);

~jws[\onAudio].value({ |pDb, rDb, b, p, playing, barNum|
    peak = pDb.asFloat;
    rms = rDb.asFloat;
    bpm = b.asFloat;
    ppq = p.asFloat;
    isPlaying = playing.asInteger;
    bar = barNum.asInteger;
});

~jws[\onNote].value({ |note, vel, inst|
    lastNote = note.asInteger;
    lastVel = vel.asInteger;
    16.do {
        var angle = 2pi.rand;
        var speed = (vel / 127.0) * 9.0 + 2.0;
        particles.add([0.0, 0.0, cos(angle) * speed, sin(angle) * speed, 1.0, note]);
    };
});

view.drawFunc = { |v|
    var bounds = v.bounds;
    var cx = bounds.width * 0.5, cy = bounds.height * 0.5;
    var linRms = ((rms + 60.0) / 60.0).clip(0.0, 1.0);
    var linPeak = ((peak + 60.0) / 60.0).clip(0.0, 1.0);

    Pen.push;
    Pen.strokeColor = Color(0.2, 0.8, 0.6, 0.6);
    Pen.width = 1.5;

    // Center pulse ring
    Pen.strokeOval(Rect(cx - (linRms * 50.0), cy - (linRms * 50.0), linRms * 100.0, linRms * 100.0));

    particles = particles.select { |p|
        p[0] = p[0] + p[2];
        p[1] = p[1] + p[3];
        p[4] = p[4] - 0.022;
        if (p[4] > 0.0) {
            var px = cx + p[0];
            var py = cy + p[1];
            Pen.strokeColor = Color(0.3, 0.9, 0.7, p[4]);
            Pen.line(Point(px, py), Point(px - (p[2] * 2.5), py - (p[3] * 2.5)));
            Pen.stroke;
            true
        } { false };
    };

    Pen.fillColor = Color(0.3, 0.9, 0.7, 0.85);
    Pen.stringAtPoint("JOHNWALLS.STUDIO // SUPERCOLLIDER VECTOR CASCADE", Point(16, 16), Font("Monaco", 11));
    Pen.fillColor = Color(0.6, 0.8, 0.7, 0.75);
    Pen.stringAtPoint(format("BPM: % | BAR: % | RMS: % dB | PEAK: % dB | ACTIVE PARTICLES: %", bpm.round(0.1), bar, rms.round(0.1), peak.round(0.1), particles.size), Point(16, 32), Font("Monaco", 10));
    Pen.pop;
};
view.animate = true;
view.frameRate = 60;
)SC";

inline constexpr const char* kVisualPatchSpectralWaterfall = R"SC(
var width = 840, height = 620;
var win = Window("johnwalls.studio // SuperCollider Spectral Waterfall", Rect(160, 160, width, height), resizable: true).front;
var view;
var peak = -96.0, rms = -96.0, bpm = 120.0, ppq = 0.0, isPlaying = 0, bar = 1;
var lastNote = 60, lastVel = 0;
var history = List.new;
var maxHistory = 40;

win.background = Color(0.02, 0.02, 0.03);
win.onClose = { 0.exit; };

view = UserView(win, Rect(0, 0, width, height));
view.resize = 5;
view.background = Color(0.02, 0.02, 0.03);

~jws[\onAudio].value({ |pDb, rDb, b, p, playing, barNum|
    peak = pDb.asFloat;
    rms = rDb.asFloat;
    bpm = b.asFloat;
    ppq = p.asFloat;
    isPlaying = playing.asInteger;
    bar = barNum.asInteger;
    history.addFirst([peak, rms, lastNote, bpm]);
    if (history.size > maxHistory) { history.pop };
});

~jws[\onNote].value({ |note, vel, inst|
    lastNote = note.asInteger;
    lastVel = vel.asInteger;
});

view.drawFunc = { |v|
    var bounds = v.bounds;
    var w = bounds.width, h = bounds.height;

    Pen.push;
    history.do { |frame, idx|
        var y = (idx / maxHistory) * h;
        var alpha = 1.0 - (idx / maxHistory);
        var fPeak = frame[0];
        var fRms = frame[1];
        var linPeak = ((fPeak + 60.0) / 60.0).clip(0.0, 1.0);
        var barWidth = linPeak * w * 0.9;
        var barX = (w - barWidth) * 0.5;

        Pen.fillColor = Color(0.6 + (0.4 * alpha), 0.3 * alpha, 0.8 * alpha, alpha * 0.7);
        Pen.fillRect(Rect(barX, y, barWidth, h / maxHistory));
    };

    Pen.fillColor = Color(0.8, 0.5, 1.0, 0.9);
    Pen.stringAtPoint("JOHNWALLS.STUDIO // SUPERCOLLIDER SPECTRAL WATERFALL", Point(16, 16), Font("Monaco", 11));
    Pen.pop;
};
view.animate = true;
view.frameRate = 60;
)SC";

} // namespace johnwalls::johnwalls
