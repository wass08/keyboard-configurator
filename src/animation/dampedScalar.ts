/** Exact critically damped spring step, stable across variable frame times.
 * omega=40 reaches 95% in ~120ms; retaining velocity makes retargeting smooth. */
export function dampedScalar(value: number, velocity: number, target: number, delta: number, omega = 40) {
  const error = value - target, decay = Math.exp(-omega * delta);
  const momentum = velocity + omega * error;
  const next = target + (error + momentum * delta) * decay;
  const speed = (velocity - omega * momentum * delta) * decay;
  return Math.abs(next - target) < 1e-6 && Math.abs(speed) < 1e-5
    ? { value: target, velocity: 0 } : { value: next, velocity: speed };
}
