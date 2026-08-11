import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom no implementa matchMedia; lo usan hooks de Radix (Select, Tabs, etc,
// vía @pulso/ui) y `prefers-reduced-motion`.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom no implementa ResizeObserver; lo usan varios primitivos de Radix.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom no implementa PointerEvent por completo; Radix (Select/DropdownMenu) lo
// requiere para sus manejadores de puntero en interacciones de teclado y clic.
if (typeof window !== 'undefined' && !window.PointerEvent) {
  class PointerEventStub extends MouseEvent {
    pointerId = 1;
    width = 1;
    height = 1;
    pressure = 0;
    tangentialPressure = 0;
    tiltX = 0;
    tiltY = 0;
    twist = 0;
    pointerType = 'mouse';
    isPrimary = true;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
    }
  }
  window.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
}

if (typeof window !== 'undefined' && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

if (typeof window !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
});
