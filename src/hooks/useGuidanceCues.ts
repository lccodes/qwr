import { useEffect, useRef } from 'react';
import type { NavigationState } from '../types';

function buzz(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore vibrate blocks
    }
  }
}

function speakOffline(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.94; // slightly calm, clear cadence for seniors & kids
    utter.pitch = 1.0;
    utter.lang = 'en-US';
    window.speechSynthesis.speak(utter);
  } catch {
    // Ignore speech synthesis errors on restricted platforms
  }
}

/**
 * Triggers gentle haptic vibrations and optional offline Web Speech API voice
 * prompts at approaching turns, off-track transitions, and walk arrival.
 */
export function useGuidanceCues(
  navState: NavigationState | null,
  active: boolean,
  voiceEnabled: boolean
) {
  const lastStepIndexRef = useRef<number | null>(null);
  const wasOffTrackRef = useRef(false);
  const lastOffTrackAlertAtRef = useRef(0);
  const announcedArrivalRef = useRef(false);

  useEffect(() => {
    if (!active) {
      lastStepIndexRef.current = null;
      wasOffTrackRef.current = false;
      announcedArrivalRef.current = false;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, [active]);

  useEffect(() => {
    if (!active || !navState) return;

    // 1. Arrival celebration
    if (navState.hasArrived && !announcedArrivalRef.current) {
      announcedArrivalRef.current = true;
      buzz([80, 70, 120]);
      if (voiceEnabled) {
        speakOffline('Welcome back to Parking. Great walk at the Quogue Wildlife Refuge!');
      }
      return;
    }

    // 2. Off-track alert (with 20s cooldown so it never nags)
    if (navState.isOffTrack) {
      const now = Date.now();
      if (!wasOffTrackRef.current || now - lastOffTrackAlertAtRef.current > 20000) {
        wasOffTrackRef.current = true;
        lastOffTrackAlertAtRef.current = now;
        buzz([120, 80, 120]);
        if (voiceEnabled) {
          speakOffline(`${navState.headline}. Follow the red arrow back to the trail.`);
        }
      }
      return;
    }

    // 3. Rejoined trail reassurance
    if (wasOffTrackRef.current && !navState.isOffTrack) {
      wasOffTrackRef.current = false;
      buzz(60);
      if (voiceEnabled) {
        speakOffline('You are back on the trail.');
      }
    }

    // 4. Approaching turn alert (< 24 meters ahead of next turn)
    if (
      navState.nextStep &&
      navState.nextStep.turnType !== 'straight' &&
      navState.nextStep.turnType !== 'start' &&
      navState.distanceToNextTurnMeters <= 24 &&
      lastStepIndexRef.current !== navState.nextStep.index
    ) {
      lastStepIndexRef.current = navState.nextStep.index;
      buzz(70);
      if (voiceEnabled) {
        const feet = Math.max(
          20,
          Math.round((navState.distanceToNextTurnMeters * 3.28084) / 10) * 10
        );
        speakOffline(`In ${feet} feet, ${navState.nextStep.instruction}.`);
      }
    }
  }, [active, navState, voiceEnabled]);
}
