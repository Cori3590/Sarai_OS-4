
import React from 'react';
import { Archetype } from './types';

export const ARCHETYPES: Record<Archetype, { label: string; description: string; emoji: string }> = {
  custom: {
    label: 'Companion',
    description: 'A loyal, intelligent, and adaptive companion.',
    emoji: '🦊'
  }
};

export const COLORS = {
  primary: '#22d3ee', // Cyan-400 (Winter Fox Blue)
  secondary: '#164e63', // Cyan-900
  bg: '#020402',
};
