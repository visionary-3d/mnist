export const lerp = (x: number, y: number, a: number) => x * (1 - a) + y * a

export const smoothstep = (min: number, max: number, value: number) => {
  var x = Math.max(0, Math.min(1, (value - min) / (max - min)))
  return x * x * (3 - 2 * x)
}
export const pow = (a: number, b: number) => {
  return Math.pow(a, b)
}

export const easeUpDownExpo = (x: number) => {
  return lerp(
    1.0 - pow(40.0, -10.0 * x),
    1.0 - (1.0 - pow(2.0, -25.0 * x)),
    smoothstep(0.1, 0.96, x)
  )
}

export const easeOutExpo = (x: number) => {
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x)
}

export const EaseOutCirc = (x: number) => {
  return Math.sqrt(1.0 - Math.pow(x - 1.0, 2.0))
}

export const UpDownCirc = (x: number) => {
  return Math.sin(EaseOutCirc(x) * Math.PI)
}

export const clamp = (x: number, a: number, b: number) => {
  return Math.min(Math.max(x, a), b)
}
