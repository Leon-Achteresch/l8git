export interface ChartPoint {
  x: number;
  y: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function monotoneLine(points: readonly ChartPoint[]): string {
  if (points.length === 0) {
    return '';
  }
  if (points.length === 1) {
    return `M ${round(points[0].x)} ${round(points[0].y)}`;
  }

  const count = points.length;
  const slopes: number[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    const dx = points[index + 1].x - points[index].x;
    slopes.push(dx === 0 ? 0 : (points[index + 1].y - points[index].y) / dx);
  }

  const tangents: number[] = new Array<number>(count).fill(0);
  tangents[0] = slopes[0];
  tangents[count - 1] = slopes[count - 2];
  for (let index = 1; index < count - 1; index += 1) {
    const previous = slopes[index - 1];
    const next = slopes[index];
    if (previous * next <= 0) {
      tangents[index] = 0;
      continue;
    }
    const average = (previous + next) / 2;
    const limit = 3 * Math.min(Math.abs(previous), Math.abs(next));
    tangents[index] = Math.sign(average) * Math.min(Math.abs(average), limit);
  }

  let path = `M ${round(points[0].x)} ${round(points[0].y)}`;
  for (let index = 0; index < count - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const dx = (next.x - current.x) / 3;
    path += ` C ${round(current.x + dx)} ${round(current.y + tangents[index] * dx)}, ${round(
      next.x - dx
    )} ${round(next.y - tangents[index + 1] * dx)}, ${round(next.x)} ${round(next.y)}`;
  }
  return path;
}

export function closeArea(
  line: string,
  points: readonly ChartPoint[],
  baseline: number
): string {
  if (line === '' || points.length === 0) {
    return '';
  }
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${round(last.x)} ${round(baseline)} L ${round(first.x)} ${round(baseline)} Z`;
}
