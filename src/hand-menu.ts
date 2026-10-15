import type { Gesture } from "./gesture";

/** Snap horizontal hand input to the same values as a native range input. */
export function rangeValueAt(
  x: number,
  left: number,
  width: number,
  min: number,
  max: number,
  step: number,
): number {
  const ratio = Math.max(0, Math.min(1, (x - left) / (width || 1)));
  const value = min + Math.round((ratio * (max - min)) / step) * step;
  return Number(Math.max(min, Math.min(max, value)).toFixed(8));
}

/** Use real DOM hit testing so panels always shield the scene behind them. */
export class HandMenu {
  private slider: HTMLInputElement | null = null;
  private hovered: HTMLElement | null = null;

  constructor(private viewport: HTMLElement) {}

  reset(): void {
    const slider = this.slider;
    this.slider = null;
    slider?.dispatchEvent(new Event("change", { bubbles: true }));
    this.hovered?.classList.remove("hand-hover");
    this.hovered = null;
  }

  update(gesture: Gesture | null, press: boolean): boolean {
    if (!gesture) {
      this.reset();
      return false;
    }
    const rect = this.viewport.getBoundingClientRect();
    const x = rect.left + gesture.x * rect.width;
    const y = rect.top + gesture.y * rect.height;
    if (this.slider) {
      if (gesture.pinching) {
        this.setRange(this.slider, x);
        return true;
      }
      this.reset();
    }
    const hit = document.elementFromPoint(x, y);
    const surface = hit?.closest<HTMLElement>("[data-hand-surface]");
    const blocked = !!surface && this.viewport.contains(surface);
    const control = blocked
      ? hit?.closest<HTMLElement>('button, input[type="range"]') ?? null
      : null;
    const enabled = control && !control.matches(":disabled") ? control : null;
    this.hovered?.classList.remove("hand-hover");
    this.hovered = enabled;
    enabled?.classList.add("hand-hover");
    if (press && enabled) {
      if (enabled instanceof HTMLInputElement) {
        this.slider = enabled;
        this.setRange(enabled, x);
      } else {
        enabled.click();
      }
    }
    return blocked;
  }

  private setRange(input: HTMLInputElement, x: number): void {
    const rect = input.getBoundingClientRect();
    const value = rangeValueAt(
      x, rect.left, rect.width, Number(input.min), Number(input.max), Number(input.step),
    );
    if (Number(input.value) === value) return;
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
