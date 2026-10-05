import React from 'react';
import { PedalInstance } from '../types';
import { MesaMarkHead } from './MesaMarkHead';
import { VoxAC30Head } from './VoxAC30Head';

interface AmpHeadProps {
  amp: PedalInstance;
  onUpdateParam: (ampId: string, paramName: string, value: number) => void;
  onToggleBypass: (ampId: string) => void;
  onRemove: (ampId: string) => void;
  onInspect?: (ampId: string) => void;
  isInspected?: boolean;
  onSaveToLibrary?: (amp: PedalInstance) => void;
}

export const AmpHead: React.FC<AmpHeadProps> = (props) => {
  if (props.amp.type === 'vox') {
    return <VoxAC30Head {...props} />;
  }
  return <MesaMarkHead {...props} />;
};
