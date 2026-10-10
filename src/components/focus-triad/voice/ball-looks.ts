// Voice-stage looks for the crystal ball — generative seeds (the
// ball feeds them through its Oklab palette math in GL), not chrome
// tokens. Kept in a ogl-free module so VoiceOrb can import them
// statically while the ball itself stays code-split.
export interface BallStateLook {
  color: string;
  crackle: number;
  sparks: number;
  speed: number;
  glow: number;
  haze?: number;
}

export const BALL_STATE_LOOK: Record<string, BallStateLook> = {
  idle: { color: "#C9A7FF", crackle: 0.6, sparks: 0.4, speed: 0.85, glow: 0.9 },
  listen: { color: "#5CD1FF", crackle: 0.95, sparks: 0.8, speed: 1.2, glow: 1.0 },
  think: { color: "#9478FF", crackle: 0.7, sparks: 0.45, speed: 0.5, glow: 0.85, haze: 0.85 },
  speak: { color: "#FF7AC8", crackle: 1.0, sparks: 0.9, speed: 1.1, glow: 1.05 }
};
