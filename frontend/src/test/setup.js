import "@testing-library/jest-dom";

// recharts ResponsiveContainer
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
