import { StudioModule, StudioPedalBoardModule } from '../types';

export const isFloatDiff = (current: number, target: unknown): target is number => {
  return typeof target === 'number' && Math.abs(current - target) > 0.05;
};

/**
 * Pure function to map incoming host automation parameter diffs (e.g. from Ableton Live)
 * into pedal board modules without triggering unnecessary React object allocations if nothing changed.
 */
export function syncHostParametersToModules(
  prevModules: StudioModule[],
  hostParams: Record<string, any>
): StudioModule[] {
  let anyChanged = false;
  const nextModules = prevModules.map((module) => {
    if (module.type !== 'pedal_board') return module;
    const board = module as StudioPedalBoardModule;
    let boardChanged = false;
    const nextPedals = board.pedals.map((p) => {
      let pedalChanged = false;
      const newParams = { ...p.parameters };

      // Mesa Boogie
      if (p.id === 'mesa_mark3') {
        if (hostParams.mesa_bypass !== undefined) {
          const byp = Boolean(hostParams.mesa_bypass);
          if (p.bypassed !== byp) {
            p = { ...p, bypassed: byp };
            pedalChanged = true;
          }
        }
        if (isFloatDiff(newParams.gain?.value, hostParams.mesa_gain)) {
          newParams.gain = { ...newParams.gain, value: hostParams.mesa_gain };
          pedalChanged = true;
        }
        if (isFloatDiff(newParams.master?.value, hostParams.mesa_master)) {
          newParams.master = { ...newParams.master, value: hostParams.mesa_master };
          pedalChanged = true;
        }
        if (isFloatDiff(newParams.channel?.value, hostParams.mesa_channel)) {
          newParams.channel = { ...newParams.channel, value: hostParams.mesa_channel };
          pedalChanged = true;
        }
        if (isFloatDiff(newParams.bass?.value, hostParams.mesa_bass)) {
          newParams.bass = { ...newParams.bass, value: hostParams.mesa_bass };
          pedalChanged = true;
        }
        if (isFloatDiff(newParams.mid?.value, hostParams.mesa_mid)) {
          newParams.mid = { ...newParams.mid, value: hostParams.mesa_mid };
          pedalChanged = true;
        }
        if (isFloatDiff(newParams.treble?.value, hostParams.mesa_treble)) {
          newParams.treble = { ...newParams.treble, value: hostParams.mesa_treble };
          pedalChanged = true;
        }
        if (isFloatDiff(newParams.presence?.value, hostParams.mesa_presence)) {
          newParams.presence = { ...newParams.presence, value: hostParams.mesa_presence };
          pedalChanged = true;
        }
      }

      // Vox AC-30
      if (p.id === 'vox_ac30') {
        if (hostParams.vox_bypass !== undefined) {
          const byp = Boolean(hostParams.vox_bypass);
          if (p.bypassed !== byp) {
            p = { ...p, bypassed: byp };
            pedalChanged = true;
          }
        }
        if (isFloatDiff(newParams.gain?.value, hostParams.vox_gain)) {
          newParams.gain = { ...newParams.gain, value: hostParams.vox_gain };
          pedalChanged = true;
        }
        if (isFloatDiff(newParams.channel?.value, hostParams.vox_channel)) {
          newParams.channel = { ...newParams.channel, value: hostParams.vox_channel };
          pedalChanged = true;
        }
        if (isFloatDiff(newParams.bass?.value, hostParams.vox_bass)) {
          newParams.bass = { ...newParams.bass, value: hostParams.vox_bass };
          pedalChanged = true;
        }
        if (isFloatDiff(newParams.treble?.value, hostParams.vox_treble)) {
          newParams.treble = { ...newParams.treble, value: hostParams.vox_treble };
          pedalChanged = true;
        }
        if (isFloatDiff(newParams.cut?.value, hostParams.vox_cut)) {
          newParams.cut = { ...newParams.cut, value: hostParams.vox_cut };
          pedalChanged = true;
        }
        if (isFloatDiff(newParams.chime?.value, hostParams.vox_chime)) {
          newParams.chime = { ...newParams.chime, value: hostParams.vox_chime };
          pedalChanged = true;
        }
        if (isFloatDiff(newParams.master?.value, hostParams.vox_master)) {
          newParams.master = { ...newParams.master, value: hostParams.vox_master };
          pedalChanged = true;
        }
      }

      // Delay
      if (p.id === 'dub_echo') {
        if (hostParams.delay_bypass !== undefined) {
          const byp = Boolean(hostParams.delay_bypass);
          if (p.bypassed !== byp) {
            p = { ...p, bypassed: byp };
            pedalChanged = true;
          }
        }
        if (isFloatDiff(newParams.time?.value, hostParams.delay_time)) {
          newParams.time = { ...newParams.time, value: hostParams.delay_time };
          pedalChanged = true;
        }
        if (isFloatDiff(newParams.feedback?.value, hostParams.delay_fb)) {
          newParams.feedback = { ...newParams.feedback, value: hostParams.delay_fb };
          pedalChanged = true;
        }
      }

      // Filter
      if (p.id === 'resonant_filter') {
        if (hostParams.filter_bypass !== undefined) {
          const byp = Boolean(hostParams.filter_bypass);
          if (p.bypassed !== byp) {
            p = { ...p, bypassed: byp };
            pedalChanged = true;
          }
        }
        if (isFloatDiff(newParams.cutoff?.value, hostParams.filter_cutoff)) {
          newParams.cutoff = { ...newParams.cutoff, value: hostParams.filter_cutoff };
          pedalChanged = true;
        }
      }

      // Ducker
      if (p.id === 'sidechain_ducker') {
        if (hostParams.ducker_bypass !== undefined) {
          const byp = Boolean(hostParams.ducker_bypass);
          if (p.bypassed !== byp) {
            p = { ...p, bypassed: byp };
            pedalChanged = true;
          }
        }
        if (isFloatDiff(newParams.depth?.value, hostParams.ducker_depth)) {
          newParams.depth = { ...newParams.depth, value: hostParams.ducker_depth };
          pedalChanged = true;
        }
      }

      if (pedalChanged) {
        boardChanged = true;
        return { ...p, parameters: newParams };
      }
      return p;
    });

    if (boardChanged) {
      anyChanged = true;
      return { ...board, pedals: nextPedals };
    }
    return board;
  });

  return anyChanged ? nextModules : prevModules;
}
